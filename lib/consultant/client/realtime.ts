/**
 * Realtime NUDGES for the Consultant Portal (framework-free; used by
 * hooks/consultant/useRealtimeNudge.ts).
 *
 * Design (SPEC-WAVE2 → Realtime):
 * - The server broadcasts an EMPTY nudge on a Supabase Realtime broadcast topic
 *   (`<prefix>:call:<callId>` for a new transcript segment,
 *   `<prefix>:leaderboard` for any metric-affecting change). A nudge carries no
 *   data — and even if a payload arrives we ignore it. On a nudge the client
 *   refetches through the authenticated API, so every byte shown still passes
 *   the app's own session + role checks. The anon key only lets a browser hear
 *   "something changed", never what.
 * - supabase-js is loaded LAZILY (dynamic import) the first time a component
 *   subscribes, so it never weighs on first paint of the portal.
 * - One socket per tab, one channel per topic, reference-counted across
 *   components.
 * - Degrades to polling: when env is missing, the import fails, the socket is
 *   blocked (CSP, corporate proxy) or a channel errors/times out, the topic
 *   reports `unavailable` and callers keep (or speed up) their polling. If the
 *   channel later recovers, it reports `live` again and fires one catch-up
 *   nudge, because updates may have been missed while it was down.
 */

export type NudgeTopic = "leaderboard" | { callId: string };
export type RealtimeStatus = "connecting" | "live" | "unavailable";

export const DEFAULT_REALTIME_PREFIX = "vs-consultant";
/** No SUBSCRIBED within this long → report unavailable (polling takes over). */
export const REALTIME_CONNECT_TIMEOUT_MS = 8_000;

export type RealtimeConfig = { url: string; anonKey: string; prefix: string };

/**
 * Public env only. Accessed as literal `process.env.NEXT_PUBLIC_*` so Next
 * inlines the values into the client bundle.
 */
export function realtimeConfig(): RealtimeConfig | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  const prefix = (process.env.NEXT_PUBLIC_CONSULTANT_REALTIME_PREFIX ?? "").trim() || DEFAULT_REALTIME_PREFIX;
  if (!url || !anonKey || !/^https:\/\//.test(url)) return null;
  return { url, anonKey, prefix };
}

export function realtimePrefix(): string {
  return (process.env.NEXT_PUBLIC_CONSULTANT_REALTIME_PREFIX ?? "").trim() || DEFAULT_REALTIME_PREFIX;
}

/** `"leaderboard"` → `vs-consultant:leaderboard`; `{ callId }` → `vs-consultant:call:<id>`. */
export function topicName(topic: NudgeTopic, prefix: string = realtimePrefix()): string {
  return typeof topic === "string" ? `${prefix}:${topic}` : `${prefix}:call:${topic.callId}`;
}

// ── Minimal structural types (so tests can fake the client) ─────────────────

export interface RealtimeChannelLike {
  on(type: "broadcast", filter: { event: string }, callback: (payload: unknown) => void): RealtimeChannelLike;
  subscribe(callback?: (status: string, err?: Error) => void): RealtimeChannelLike;
}

export interface RealtimeClientLike {
  channel(name: string, opts?: { config?: { broadcast?: { self?: boolean; ack?: boolean } } }): RealtimeChannelLike;
  removeChannel(channel: RealtimeChannelLike): unknown;
}

export type RealtimeClientFactory = () => Promise<RealtimeClientLike | null>;

/** Lazily imports supabase-js and creates a realtime-only client (no auth storage). */
export const defaultRealtimeFactory: RealtimeClientFactory = async () => {
  if (typeof window === "undefined") return null;
  const cfg = realtimeConfig();
  if (!cfg) return null;
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(cfg.url, cfg.anonKey, {
    // Nothing about the user goes into Supabase auth or localStorage.
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return client as unknown as RealtimeClientLike;
};

type Listener = { onNudge: () => void; onStatus?: (s: RealtimeStatus) => void };
type Entry = {
  listeners: Set<Listener>;
  status: RealtimeStatus;
  channel: RealtimeChannelLike | null;
  everLive: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  closed: boolean;
};

export class NudgeHub {
  private client: Promise<RealtimeClientLike | null> | null = null;
  private topics = new Map<string, Entry>();

  constructor(
    private readonly factory: RealtimeClientFactory = defaultRealtimeFactory,
    private readonly connectTimeoutMs = REALTIME_CONNECT_TIMEOUT_MS,
  ) {}

  status(name: string): RealtimeStatus {
    return this.topics.get(name)?.status ?? "unavailable";
  }

  /** Listen for nudges on a topic. Returns an unsubscribe function. */
  subscribe(name: string, listener: Listener): () => void {
    let entry = this.topics.get(name);
    if (!entry) {
      entry = { listeners: new Set(), status: "connecting", channel: null, everLive: false, timer: null, closed: false };
      this.topics.set(name, entry);
      this.open(name, entry);
    }
    entry.listeners.add(listener);
    listener.onStatus?.(entry.status);
    const e = entry;
    return () => {
      e.listeners.delete(listener);
      if (e.listeners.size === 0) this.close(name, e);
    };
  }

  private getClient(): Promise<RealtimeClientLike | null> {
    if (!this.client) {
      this.client = this.factory().catch(() => null); // import/network failure → polling
    }
    return this.client;
  }

  private setStatus(e: Entry, s: RealtimeStatus): void {
    if (e.closed || e.status === s) return;
    const recovered = s === "live" && e.everLive;
    e.status = s;
    if (s === "live") e.everLive = true;
    e.listeners.forEach((l) => safe(() => l.onStatus?.(s)));
    // Back after a drop: updates may have been missed — one catch-up refetch.
    if (recovered) e.listeners.forEach((l) => safe(l.onNudge));
  }

  private open(name: string, e: Entry): void {
    e.timer = setTimeout(() => {
      if (e.status === "connecting") this.setStatus(e, "unavailable");
    }, this.connectTimeoutMs);
    void this.getClient().then((client) => {
      if (e.closed) return;
      if (!client) {
        this.clearTimer(e);
        this.setStatus(e, "unavailable");
        return;
      }
      try {
        const ch = client.channel(name, { config: { broadcast: { self: false, ack: false } } });
        e.channel = ch;
        ch.on("broadcast", { event: "*" }, () => {
          // Payload deliberately ignored: nudges carry no data.
          if (!e.closed) e.listeners.forEach((l) => safe(l.onNudge));
        }).subscribe((status) => {
          if (status === "SUBSCRIBED") {
            this.clearTimer(e);
            this.setStatus(e, "live");
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            this.clearTimer(e);
            this.setStatus(e, "unavailable");
          }
        });
      } catch {
        this.clearTimer(e);
        this.setStatus(e, "unavailable");
      }
    });
  }

  private close(name: string, e: Entry): void {
    e.closed = true;
    this.clearTimer(e);
    this.topics.delete(name);
    const ch = e.channel;
    e.channel = null;
    if (!ch) return;
    void this.getClient().then((client) => {
      try {
        void Promise.resolve(client?.removeChannel(ch)).catch(() => undefined);
      } catch {
        /* ignore */
      }
    });
  }

  private clearTimer(e: Entry): void {
    if (e.timer) clearTimeout(e.timer);
    e.timer = null;
  }
}

function safe(fn: () => void): void {
  try {
    fn();
  } catch {
    /* one broken listener must not starve the others */
  }
}

let shared: NudgeHub | null = null;

/** The tab-wide hub. */
export function nudgeHub(): NudgeHub {
  if (!shared) shared = new NudgeHub();
  return shared;
}

/** Tests: replace the shared hub (pass null to reset to the default). */
export function setNudgeHubForTests(hub: NudgeHub | null): void {
  shared = hub;
}

/**
 * Coalesce a burst of nudges (e.g. every dial on the floor nudges the
 * leaderboard) into one call: fires `waitMs` after the last nudge, but at
 * least every `maxWaitMs` while nudges keep coming.
 */
export function coalesce(fn: () => void, waitMs: number, maxWaitMs: number): { (): void; cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let first = 0;
  const run = () => {
    timer = null;
    first = 0;
    fn();
  };
  const call = () => {
    const now = Date.now();
    if (!first) first = now;
    if (timer) clearTimeout(timer);
    const due = Math.min(waitMs, Math.max(0, first + maxWaitMs - now));
    timer = setTimeout(run, due);
  };
  call.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    first = 0;
  };
  return call;
}
