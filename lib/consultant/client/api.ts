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

import type { z } from "zod";
import type {
  ApiError,
  CalendarConnection,
  CalendarProvider,
  Call,
  CallDetail,
  CallPatch,
  CardEventInput,
  Deal,
  EmmaMessage,
  FunnelMetrics,
  GamificationSettings,
  Goal,
  GoalInput,
  GoalPatch,
  Lead,
  LeadDetail,
  LeadInput,
  LeadPatch,
  LeadSearchInput,
  Leaderboard,
  LiveCallState,
  Me,
  Meeting,
  MeetingInput,
  MeetingPatch,
  Note,
  NoteInput,
  NotePatch,
  NoteRevision,
  PaymentConfirmInput,
  Period,
  Reward,
  SalesStage,
  ScrapedImportResult,
  ScrapedLeadImport,
  SystemHealth,
  TodayStats,
  TrainingModule,
  UploadRequest,
  UploadTicket,
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
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
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
  /**
   * @deprecated Wave 2: search text never goes in a URL (phone numbers would
   * land in access logs). Use `api.leads.search`. Kept so wave-1 callers still
   * compile: a non-empty `q` is transparently sent as `POST leads/search`.
   */
  q?: string;
  scope?: "mine" | "pool" | "all";
};

/** Body of `POST leads/search` (defaults: q "", scope "mine"). */
export type LeadSearchParams = z.input<typeof LeadSearchInput>;

export type LeaderboardRankBy = Leaderboard["rankedBy"];

/** `GET metrics?consultantId=team` (managers). */
export type TeamFunnelMetrics = {
  team: FunnelMetrics;
  byConsultant: (FunnelMetrics & { consultantId: string; name: string })[];
};

export type RewardStatusFilter = "pending" | "all";
export type DeadLetterKind = "event" | "message";

/**
 * A dead-lettered event delivery or Emma message (admin Systems view).
 * NOT in the frozen contract yet — shape proposed by Agent 2; fields beyond
 * `kind` + `id` are optional so a different server shape still renders.
 */
export type DeadLetter = {
  kind: DeadLetterKind;
  id: string;
  type?: string;
  target?: string | null;
  attempts?: number;
  lastError?: string | null;
  createdAt?: string;
  updatedAt?: string | null;
};

/** What `GET admin/dead-letters` returns: dead events (deliveries grouped) and dead Emma messages. */
type DeadLettersResponse = {
  events?: { id: string; type: string; occurredAt: string; targets: string[]; attempts: number; lastError: string | null }[];
  messages?: EmmaMessage[];
};

/** Flatten the server's `{ events, messages }` into the one retryable list the Systems view renders. */
function toDeadLetters(r: DeadLettersResponse | null | undefined): DeadLetter[] {
  const events: DeadLetter[] = (r?.events ?? []).map((e) => ({
    kind: "event",
    id: e.id,
    type: e.type,
    target: e.targets.join(", "),
    attempts: e.attempts,
    lastError: e.lastError,
    createdAt: e.occurredAt,
  }));
  const messages: DeadLetter[] = (r?.messages ?? []).map((m) => ({
    kind: "message",
    id: m.id,
    type: m.template,
    target: m.channel,
    attempts: m.attempts,
    lastError: m.lastError,
    createdAt: m.createdAt,
  }));
  return [...events, ...messages];
}

export type MeetingListParams = { from?: string; to?: string; leadId?: string };

const search = (input: LeadSearchParams, o?: RequestOptions) =>
  request<Lead[]>("POST", "/leads/search", { ...input, q: (input.q ?? "").trim() }, o);

export const api = {
  me: (o?: RequestOptions) => request<Me>("GET", "/me", undefined, o),

  stats: {
    today: (params?: { consultantId?: string }, o?: RequestOptions) =>
      request<TodayStats>("GET", `/stats/today${qs({ consultantId: params?.consultantId })}`, undefined, o),
  },

  leads: {
    /** GET carries only `stage` + `scope` (the server 400s on `q`). */
    list: (params: LeadListParams = {}, o?: RequestOptions) => {
      const q = params.q?.trim();
      if (q) return search({ q, stage: params.stage, scope: params.scope }, o);
      return request<Lead[]>("GET", `/leads${qs({ stage: params.stage, scope: params.scope })}`, undefined, o);
    },
    /** Free-text search (name, clinic, phone, email) — POST so nothing sensitive is in the URL. */
    search,
    create: (input: LeadInput, o?: RequestOptions) => request<Lead>("POST", "/leads", input, o),
    get: (id: string, o?: RequestOptions) => request<LeadDetail>("GET", `/leads/${enc(id)}`, undefined, o),
    patch: (id: string, patch: LeadPatch, o?: RequestOptions) => request<Lead>("PATCH", `/leads/${enc(id)}`, patch, o),
    claim: (id: string, o?: RequestOptions) => request<Lead>("POST", `/leads/${enc(id)}/claim`, undefined, o),
    /** Managers: send scraper results into the Clinics pool (≤500 per call). */
    importScraped: (input: ScrapedLeadImport, o?: RequestOptions) =>
      request<ScrapedImportResult>("POST", "/leads/import", input, o),
  },

  voice: {
    token: (o?: RequestOptions) => request<VoiceToken>("POST", "/voice/token", undefined, o),
  },

  calls: {
    start: (leadId: string, o?: RequestOptions) => request<Call>("POST", "/calls", { leadId }, o),
    get: (id: string, o?: RequestOptions) => request<CallDetail>("GET", `/calls/${enc(id)}`, undefined, o),
    live: (id: string, after: number, o?: RequestOptions) =>
      request<LiveCallState>("GET", `/calls/${enc(id)}/live${qs({ after: Math.max(0, Math.floor(after)) })}`, undefined, o),
    /** Sent as-is (incl. `whatsappConsent` from the wrap-up sheet) — no field filtering here. */
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

  // ── Wave 2 ────────────────────────────────────────────────────────────────

  meetings: {
    /** `from`/`to` are ISO instants (build them with `sastWallClockToIso`). */
    list: (params: MeetingListParams = {}, o?: RequestOptions) =>
      request<Meeting[]>("GET", `/meetings${qs({ from: params.from, to: params.to, leadId: params.leadId })}`, undefined, o),
    create: (input: z.input<typeof MeetingInput>, o?: RequestOptions) => request<Meeting>("POST", "/meetings", input, o),
    patch: (id: string, patch: MeetingPatch, o?: RequestOptions) =>
      request<Meeting>("PATCH", `/meetings/${enc(id)}`, patch, o),
  },

  calendar: {
    list: (o?: RequestOptions) => request<CalendarConnection[]>("GET", "/calendar", undefined, o),
    /** Full-page navigation target that starts the provider's OAuth flow. */
    connectUrl: (provider: CalendarProvider): string => `${API_BASE}/calendar/${enc(provider)}/connect`,
    disconnect: (provider: CalendarProvider, o?: RequestOptions) =>
      request<void>("DELETE", `/calendar/${enc(provider)}`, undefined, o),
  },

  uploads: {
    /** Ask for a short-lived signed upload URL (private bucket). Use `useUpload` to send the file. */
    ticket: (input: UploadRequest, o?: RequestOptions) => request<UploadTicket>("POST", "/uploads", input, o),
  },

  goals: {
    list: (params: { consultantId?: string } = {}, o?: RequestOptions) =>
      request<Goal[]>("GET", `/goals${qs({ consultantId: params.consultantId })}`, undefined, o),
    create: (input: z.input<typeof GoalInput>, o?: RequestOptions) => request<Goal>("POST", "/goals", input, o),
    patch: (id: string, patch: GoalPatch, o?: RequestOptions) => request<Goal>("PATCH", `/goals/${enc(id)}`, patch, o),
    remove: (id: string, o?: RequestOptions) => request<void>("DELETE", `/goals/${enc(id)}`, undefined, o),
  },

  metrics: {
    /** Own funnel, or any consultant's for managers. */
    get: (period: Period, consultantId?: string, o?: RequestOptions) =>
      request<FunnelMetrics>("GET", `/metrics${qs({ period, consultantId })}`, undefined, o),
    /** Team totals + per-consultant rows (needs `view_team_performance` or manager). */
    team: (period: Period, o?: RequestOptions) =>
      request<TeamFunnelMetrics>("GET", `/metrics${qs({ period, consultantId: "team" })}`, undefined, o),
  },

  leaderboard: {
    get: (period: Period, rankBy: LeaderboardRankBy = "points", o?: RequestOptions) =>
      request<Leaderboard>("GET", `/leaderboard${qs({ period, rankBy })}`, undefined, o),
  },

  settings: {
    gamification: {
      get: (o?: RequestOptions) => request<GamificationSettings>("GET", "/settings/gamification", undefined, o),
      /** Needs `manage_gamification`. */
      put: (input: GamificationSettings, o?: RequestOptions) =>
        request<GamificationSettings>("PUT", "/settings/gamification", input, o),
    },
  },

  rewards: {
    list: (status: RewardStatusFilter = "pending", o?: RequestOptions) =>
      request<Reward[]>("GET", `/rewards${qs({ status })}`, undefined, o),
    /** Needs `manage_gamification`. */
    fulfil: (id: string, o?: RequestOptions) => request<Reward>("POST", `/rewards/${enc(id)}/fulfil`, undefined, o),
  },

  deals: {
    /** Manager confirms payment (needs `confirm_payments`); sets the lead to `paid`. */
    confirmPayment: (leadId: string, input: PaymentConfirmInput, o?: RequestOptions) =>
      request<Deal>("POST", `/deals/${enc(leadId)}/payment`, input, o),
    /** Same-origin path that 302s to a short-lived signed URL — open it, never store the target. */
    proofUrl: (leadId: string): string => `${API_BASE}/deals/${enc(leadId)}/proof`,
  },

  training: {
    list: (o?: RequestOptions) => request<TrainingModule[]>("GET", "/training", undefined, o),
    /** Returns the refreshed module list (the next one unlocks server-side). */
    complete: (moduleId: string, o?: RequestOptions) =>
      request<TrainingModule[]>("POST", `/training/${enc(moduleId)}/complete`, undefined, o),
  },

  messages: {
    /** Emma WhatsApp/SMS history for a lead (lead owner or manager). */
    list: (leadId: string, o?: RequestOptions) =>
      request<EmmaMessage[]>("GET", `/messages${qs({ leadId })}`, undefined, o),
  },

  admin: {
    /** Needs `view_system_health`. */
    health: (o?: RequestOptions) => request<SystemHealth>("GET", "/admin/health", undefined, o),
    deadLetters: async (o?: RequestOptions) => toDeadLetters(await request<DeadLettersResponse>("GET", "/admin/dead-letters", undefined, o)),
    retryDeadLetter: (kind: DeadLetterKind, id: string, o?: RequestOptions) =>
      request<void>("POST", `/admin/dead-letters/${enc(kind)}/${enc(id)}/retry`, undefined, o),
  },
} as const;

export type ConsultantApi = typeof api;
