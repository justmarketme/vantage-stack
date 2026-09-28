import { z } from "zod";
import {
  AppointmentInput,
  AppointmentPatch,
  AutomationPatch,
  GoalInput,
  GoalPatch,
  LoginInput,
  PatientInput,
  PatientPatch,
  SendMessageInput,
  StateKey,
  StateValue,
  normalizeE164,
  type ApiError,
  type Appointment,
  type Automation,
  type Conversation,
  type Dashboard,
  type Goal,
  type Message,
  type Patient,
  type Session,
} from "../types";

/**
 * Typed client for `/api/clinic-crm/**` (see docs/clinic-crm/SPEC.md).
 *
 * - Same-origin cookies only (`vs_clinic_session`), JSON in and out.
 * - Every body is validated with the shared zod schema before it leaves the
 *   browser; failures throw `ApiClientError(400, …, fields)` with no request made.
 * - A 401 dispatches `clinic-crm:unauthorized` on window (the providers clear
 *   caches and redirect to login). Login itself is exempt — a wrong password
 *   is a 401 the form must show, not a redirect.
 * - No patient data in URLs: ids are validated UUIDs; search terms that look
 *   like a phone number or email never reach the query string (see `patients.list`).
 */

export const API_BASE = "/api/clinic-crm";
export const API_TIMEOUT_MS = 15_000;
export const UNAUTHORIZED_EVENT = "clinic-crm:unauthorized";
export const LOGOUT_EVENT = "clinic-crm:logout";

export class ApiClientError extends Error {
  readonly status: number;
  readonly error: string;
  readonly fields?: Record<string, string>;

  constructor(status: number, error: string, fields?: Record<string, string>) {
    super(error);
    this.name = "ApiClientError";
    this.status = status;
    this.error = error;
    if (fields) this.fields = fields;
    // Keep instanceof working when transpiled to ES5 targets.
    Object.setPrototypeOf(this, ApiClientError.prototype);
  }
}

const FRIENDLY_STATUS: Record<number, string> = {
  0: "Can't reach the server. Check your connection and try again.",
  400: "Some details need attention.",
  401: "Your session has ended. Please sign in again.",
  403: "You don't have permission to do that.",
  404: "That record could not be found.",
  408: "The server took too long to respond. Please try again.",
  409: "That action conflicts with the current state.",
  413: "That is too large to save.",
  429: "Too many attempts. Please wait a moment and try again.",
  500: "Something went wrong on our side. Please try again.",
};

function friendly(status: number): string {
  return FRIENDLY_STATUS[status] ?? (status >= 500 ? FRIENDLY_STATUS[500] : "Request failed.");
}

/** zod issues → `{ "field.path": "first message" }`. */
export function zodFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const k = issue.path.length ? issue.path.join(".") : "_";
    if (!(k in fields)) fields[k] = issue.message;
  }
  return fields;
}

function validate<S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw new ApiClientError(400, friendly(400), zodFields(r.error));
  return r.data;
}

const Id = z.string().uuid();
function id(v: string): string {
  const r = Id.safeParse(v);
  if (!r.success) throw new ApiClientError(400, "Invalid id.", { id: "Invalid id" });
  return encodeURIComponent(r.data);
}

const DateOrDateTime = z.union([z.string().date(), z.string().datetime({ offset: true })]);

function notifyUnauthorized(): void {
  try {
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
  } catch {
    /* Event constructor unavailable (very old engines) — nothing else to do. */
  }
}

interface RequestOptions {
  body?: unknown;
  /** Don't fire the unauthorized event on 401 (login). */
  quiet401?: boolean;
  /** Survive page unload (continuity flush). Body must be < 64 KB. */
  keepalive?: boolean;
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const hasAbort = typeof AbortController !== "undefined";
  const controller = hasAbort ? new AbortController() : null;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const init: RequestInit = {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  };
  if (opts.body !== undefined) {
    init.headers = { Accept: "application/json", "Content-Type": "application/json" };
    init.body = JSON.stringify(opts.body);
  }
  if (opts.keepalive) init.keepalive = true;
  if (controller) init.signal = controller.signal;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller?.abort();
      reject(new ApiClientError(408, friendly(408)));
    }, API_TIMEOUT_MS);
  });
  timeout.catch(() => undefined); // observed via Promise.race; never an unhandled rejection

  let res: Response;
  try {
    res = await Promise.race([fetch(API_BASE + path, init), timeout]);
  } catch (e) {
    if (timer) clearTimeout(timer);
    if (e instanceof ApiClientError) throw e;
    throw new ApiClientError(timedOut ? 408 : 0, friendly(timedOut ? 408 : 0));
  }

  try {
    if (res.status === 401 && !opts.quiet401) notifyUnauthorized();

    let payload: unknown = undefined;
    if (res.status !== 204) {
      const text = await Promise.race([res.text(), timeout]);
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = undefined;
        }
      }
    }

    if (!res.ok) {
      const body = (payload ?? {}) as Partial<ApiError>;
      const message = typeof body.error === "string" && body.error ? body.error : friendly(res.status);
      const fields =
        body.fields && typeof body.fields === "object" ? (body.fields as Record<string, string>) : undefined;
      throw new ApiClientError(res.status, message, fields);
    }
    return payload as T;
  } catch (e) {
    if (e instanceof ApiClientError) throw e;
    throw new ApiClientError(timedOut ? 408 : 0, friendly(timedOut ? 408 : 0));
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── Search privacy ──────────────────────────────────────────────────────────

/**
 * A search term is sent to the server (`?q=`) only when it is a name fragment.
 * Anything that looks like a phone number or email stays in the browser: we
 * fetch the unfiltered list (server max 200) and filter locally. The server
 * must still never log query strings — names are personal information too.
 */
export function isSensitiveSearch(q: string): boolean {
  return q.includes("@") || (q.match(/\d/g)?.length ?? 0) >= 3;
}

export function matchesSensitiveSearch(p: Patient, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (needle.includes("@")) return p.email.toLowerCase().includes(needle);
  const digits = needle.replace(/\D/g, "");
  const e164 = normalizeE164(needle);
  const phoneDigits = p.phone.replace(/\D/g, "");
  if (e164 && p.phone === e164) return true;
  // "0825551234" typed locally should match "+27825551234".
  const local = digits.startsWith("0") ? digits.slice(1) : digits;
  return local.length > 0 && phoneDigits.includes(local);
}

// ── Endpoints ───────────────────────────────────────────────────────────────

export type LoginInputT = z.input<typeof LoginInput>;
export type PatientInputT = z.input<typeof PatientInput>;
export type PatientPatchT = z.input<typeof PatientPatch>;
export type AppointmentInputT = z.input<typeof AppointmentInput>;
export type AppointmentPatchT = z.input<typeof AppointmentPatch>;
export type SendMessageInputT = z.input<typeof SendMessageInput>;
export type AutomationPatchT = z.input<typeof AutomationPatch>;
export type GoalInputT = z.input<typeof GoalInput>;
export type GoalPatchT = z.input<typeof GoalPatch>;
/** GET patients/[id]/export — everything held on the patient (POPIA s.23). */
export type PatientExport = Record<string, unknown>;

export const api = {
  auth: {
    login: async (input: LoginInputT) =>
      request<Session>("POST", "/auth/login", { body: validate(LoginInput, input), quiet401: true }),
    logout: async (): Promise<void> => {
      try {
        await request<void>("POST", "/auth/logout", { quiet401: true });
      } finally {
        // Local state is wiped even if the server call fails — the device is what matters.
        try {
          if (typeof window !== "undefined") window.dispatchEvent(new Event(LOGOUT_EVENT));
        } catch {
          /* ignore */
        }
      }
    },
    me: async () => request<Session>("GET", "/auth/me"),
  },

  dashboard: {
    get: async () => request<Dashboard>("GET", "/dashboard"),
  },

  patients: {
    list: async (q?: string, opts: { lead?: boolean } = {}): Promise<Patient[]> => {
      const term = (q ?? "").trim().slice(0, 80);
      const sensitive = term !== "" && isSensitiveSearch(term);
      const params = new URLSearchParams();
      if (term && !sensitive) params.set("q", term);
      if (opts.lead) params.set("lead", "1");
      const qs = params.toString();
      const rows = await request<Patient[]>("GET", "/patients" + (qs ? `?${qs}` : ""));
      return sensitive ? rows.filter((p) => matchesSensitiveSearch(p, term)) : rows;
    },
    create: async (input: PatientInputT) =>
      request<Patient>("POST", "/patients", { body: validate(PatientInput, input) }),
    get: async (patientId: string) => request<Patient>("GET", `/patients/${id(patientId)}`),
    update: async (patientId: string, patch: PatientPatchT) =>
      request<Patient>("PATCH", `/patients/${id(patientId)}`, { body: validate(PatientPatch, patch) }),
    /** POPIA erasure: hard delete. The UI must confirm first. */
    remove: async (patientId: string) => request<void>("DELETE", `/patients/${id(patientId)}`),
    export: async (patientId: string) => request<PatientExport>("GET", `/patients/${id(patientId)}/export`),
  },

  appointments: {
    list: async (from: string, to: string) => {
      validate(z.object({ from: DateOrDateTime, to: DateOrDateTime }), { from, to });
      const qs = new URLSearchParams({ from, to }).toString();
      return request<Appointment[]>("GET", `/appointments?${qs}`);
    },
    create: async (input: AppointmentInputT) =>
      request<Appointment>("POST", "/appointments", { body: validate(AppointmentInput, input) }),
    update: async (appointmentId: string, patch: AppointmentPatchT) =>
      request<Appointment>("PATCH", `/appointments/${id(appointmentId)}`, {
        body: validate(AppointmentPatch, patch),
      }),
  },

  conversations: {
    list: async () => request<Conversation[]>("GET", "/conversations"),
    get: async (patientId: string) => request<Message[]>("GET", `/conversations/${id(patientId)}`),
  },

  messages: {
    send: async (input: SendMessageInputT) =>
      request<Message>("POST", "/messages", { body: validate(SendMessageInput, input) }),
  },

  automations: {
    list: async () => request<Automation[]>("GET", "/automations"),
    update: async (automationId: string, patch: AutomationPatchT) =>
      request<Automation>("PATCH", `/automations/${id(automationId)}`, {
        body: validate(AutomationPatch, patch),
      }),
  },

  goals: {
    list: async () => request<Goal[]>("GET", "/goals"),
    create: async (input: GoalInputT) => request<Goal>("POST", "/goals", { body: validate(GoalInput, input) }),
    update: async (goalId: string, patch: GoalPatchT) =>
      request<Goal>("PATCH", `/goals/${id(goalId)}`, { body: validate(GoalPatch, patch) }),
    remove: async (goalId: string) => request<void>("DELETE", `/goals/${id(goalId)}`),
  },

  state: {
    /** Resolves `null` when nothing is stored for the key (404). */
    get: async <T = unknown>(key: string): Promise<T | null> => {
      const k = validate(StateKey, key);
      try {
        return (await request<T | null>("GET", `/state/${encodeURIComponent(k)}`)) ?? null;
      } catch (e) {
        if (e instanceof ApiClientError && e.status === 404) return null;
        throw e;
      }
    },
    put: async (key: string, value: unknown, opts: { keepalive?: boolean } = {}) => {
      const k = validate(StateKey, key);
      validate(StateValue, value);
      return request<unknown>("PUT", `/state/${encodeURIComponent(k)}`, {
        body: value ?? null,
        keepalive: opts.keepalive,
      });
    },
  },
};

export type Api = typeof api;
