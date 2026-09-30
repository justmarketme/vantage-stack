/**
 * Typed client for `/api/consultant/**` (see docs/consultant-portal/SPEC.md).
 *
 * - `credentials: "same-origin"` — the admin session cookie is the auth.
 * - Every failure throws `ApiClientError { status, error, fields }`. Network
 *   failures (offline, DNS, aborted) have `status: 0` so callers can queue.
 * - A 401 dispatches `consultant:unauthorized` on `window`; the shell redirects
 *   to `/admin/login?next=`.
 * - Error text shown to users comes from the server's `ApiError.error` (already
 *   user-safe) or a generic message — never raw response bodies.
 */

import type {
  ApiError,
  Call,
  CallDetail,
  CallPatch,
  CardEventInput,
  Lead,
  LeadDetail,
  LeadInput,
  LeadPatch,
  LiveCallState,
  Me,
  Note,
  NoteInput,
  NotePatch,
  NoteRevision,
  SalesStage,
  TodayStats,
  VoiceToken,
} from "../types";

export const API_BASE = "/api/consultant";
export const UNAUTHORIZED_EVENT = "consultant:unauthorized";

export class ApiClientError extends Error {
  readonly status: number;
  readonly error: string;
  readonly fields?: Record<string, string>;

  constructor(status: number, error: string, fields?: Record<string, string>) {
    super(error);
    this.name = "ApiClientError";
    this.status = status;
    this.error = error;
    this.fields = fields;
  }

  /** Offline / DNS / aborted — the request never got a response. */
  get isNetwork(): boolean {
    return this.status === 0;
  }

  /** Worth retrying later (network, timeouts, rate limits, server errors). */
  get isTransient(): boolean {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

export function isApiClientError(e: unknown): e is ApiClientError {
  return e instanceof ApiClientError;
}

const GENERIC: Record<number, string> = {
  0: "You're offline or the connection dropped. Check your signal and try again.",
  401: "Your session has expired. Please sign in again.",
  403: "You don't have access to that.",
  404: "That record couldn't be found.",
  408: "The request timed out. Try again.",
  409: "That conflicts with a newer change.",
  429: "Too many attempts. Wait a moment and try again.",
  503: "This service isn't available right now.",
};

function genericMessage(status: number): string {
  return GENERIC[status] ?? (status >= 500 ? "Something went wrong on our side. Try again." : "The request failed.");
}

function notifyUnauthorized(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  } catch {
    /* very old engines */
  }
}

export interface RequestOptions {
  signal?: AbortSignal;
  /** Let the request outlive the page (pagehide flushes). Body must be < 64KB. */
  keepalive?: boolean;
  /** Abort after this long. Default 20s; 0 disables. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;

export async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const init: RequestInit = {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers,
    keepalive: opts.keepalive,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;
  if (ctrl) {
    init.signal = ctrl.signal;
    if (opts.signal) {
      if (opts.signal.aborted) ctrl.abort();
      else opts.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
    }
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        ctrl.abort();
      }, timeoutMs);
    }
  } else if (opts.signal) {
    init.signal = opts.signal;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch (err) {
    if (timer) clearTimeout(timer);
    if (opts.signal?.aborted) throw err; // caller-initiated abort: let them see AbortError
    throw new ApiClientError(timedOut ? 408 : 0, genericMessage(timedOut ? 408 : 0));
  }
  if (timer) clearTimeout(timer);

  if (res.status === 204 || res.status === 205) return undefined as T;

  let payload: unknown = undefined;
  const text = await res.text().catch(() => "");
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = undefined;
    }
  }

  if (!res.ok) {
    if (res.status === 401) notifyUnauthorized();
    const p = (payload ?? {}) as Partial<ApiError>;
    const message = typeof p.error === "string" && p.error.trim() ? p.error : genericMessage(res.status);
    const fields = p.fields && typeof p.fields === "object" ? p.fields : undefined;
    throw new ApiClientError(res.status, message, fields);
  }
  return payload as T;
}

const enc = encodeURIComponent;

function qs(params: Record<string, string | number | undefined | null>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${enc(k)}=${enc(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export type LeadListParams = {
  stage?: SalesStage;
  q?: string;
  scope?: "mine" | "pool" | "all";
};

export const api = {
  me: (o?: RequestOptions) => request<Me>("GET", "/me", undefined, o),

  stats: {
    today: (params?: { consultantId?: string }, o?: RequestOptions) =>
      request<TodayStats>("GET", `/stats/today${qs({ consultantId: params?.consultantId })}`, undefined, o),
  },

  leads: {
    list: (params: LeadListParams = {}, o?: RequestOptions) =>
      request<Lead[]>("GET", `/leads${qs({ stage: params.stage, q: params.q?.trim(), scope: params.scope })}`, undefined, o),
    create: (input: LeadInput, o?: RequestOptions) => request<Lead>("POST", "/leads", input, o),
    get: (id: string, o?: RequestOptions) => request<LeadDetail>("GET", `/leads/${enc(id)}`, undefined, o),
    patch: (id: string, patch: LeadPatch, o?: RequestOptions) => request<Lead>("PATCH", `/leads/${enc(id)}`, patch, o),
    claim: (id: string, o?: RequestOptions) => request<Lead>("POST", `/leads/${enc(id)}/claim`, undefined, o),
  },

  voice: {
    token: (o?: RequestOptions) => request<VoiceToken>("POST", "/voice/token", undefined, o),
  },

  calls: {
    start: (leadId: string, o?: RequestOptions) => request<Call>("POST", "/calls", { leadId }, o),
    get: (id: string, o?: RequestOptions) => request<CallDetail>("GET", `/calls/${enc(id)}`, undefined, o),
    live: (id: string, after: number, o?: RequestOptions) =>
      request<LiveCallState>("GET", `/calls/${enc(id)}/live${qs({ after: Math.max(0, Math.floor(after)) })}`, undefined, o),
    patch: (id: string, patch: CallPatch, o?: RequestOptions) => request<Call>("PATCH", `/calls/${enc(id)}`, patch, o),
    summarise: (id: string, o?: RequestOptions) => request<Call>("POST", `/calls/${enc(id)}/summarise`, undefined, o),
    cards: (id: string, input: CardEventInput, o?: RequestOptions) =>
      request<void>("POST", `/calls/${enc(id)}/cards`, input, o),
    /** Same-origin, session-authenticated audio stream. Never a Twilio URL. */
    recordingUrl: (id: string): string => `${API_BASE}/calls/${enc(id)}/recording`,
    /** Path used by `navigator.sendBeacon` on pagehide. */
    cardsUrl: (id: string): string => `${API_BASE}/calls/${enc(id)}/cards`,
  },

  notes: {
    create: (input: NoteInput, o?: RequestOptions) => request<Note>("POST", "/notes", input, o),
    patch: (id: string, patch: NotePatch, o?: RequestOptions) => request<Note>("PATCH", `/notes/${enc(id)}`, patch, o),
    revisions: (id: string, o?: RequestOptions) =>
      request<NoteRevision[]>("GET", `/notes/${enc(id)}/revisions`, undefined, o),
  },
} as const;

export type ConsultantApi = typeof api;
