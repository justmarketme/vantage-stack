import { after } from "next/server";
import { consultantConfig } from "../config";
import { TUNABLES_3A } from "../metrics/tunables";

/**
 * Supabase Realtime NUDGES — "something changed, refetch through the authed API". Never data:
 * the payload is always `{}` so nothing sensitive can leak onto a broadcast channel (the app
 * uses its own JWT auth, so channels are public broadcast topics readable with the anon key).
 *
 * Topics: `${prefix}:leaderboard` and `${prefix}:call:<callId>`; event `TUNABLES_3A.realtime.event`.
 *
 * Uses the Realtime broadcast REST endpoint (verified against the current Supabase docs):
 *   POST ${SUPABASE_URL}/realtime/v1/api/broadcast
 *   headers: apikey (+ Authorization: Bearer) = service-role key
 *   body:    { messages: [{ topic, event, payload, private: false }] }
 */
export type NudgeTopic = "leaderboard" | { callId: string };

export function nudgeTopicName(topic: NudgeTopic, prefix = consultantConfig().realtime.channelPrefix): string {
  return topic === "leaderboard" ? `${prefix}:leaderboard` : `${prefix}:call:${topic.callId}`;
}

/** Fire-and-forget. Resolves once the broadcast was attempted; never throws, never logs data. */
export async function nudge(topic: NudgeTopic): Promise<void> {
  try {
    const cfg = consultantConfig().realtime;
    if (!cfg.supabaseUrl || !cfg.serviceRoleKey) return;
    const res = await fetch(`${cfg.supabaseUrl.replace(/\/+$/, "")}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: cfg.serviceRoleKey,
        Authorization: `Bearer ${cfg.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ topic: nudgeTopicName(topic, cfg.channelPrefix), event: TUNABLES_3A.realtime.event, payload: {}, private: false }],
      }),
      signal: AbortSignal.timeout(TUNABLES_3A.realtime.requestTimeoutMs),
    });
    if (!res.ok) console.warn("[consultant] realtime.nudge status", res.status);
  } catch {
    // Best-effort: clients also poll, so a lost nudge only delays a refresh.
  }
}

/**
 * Nudge after the response is sent (inside a request), so a serverless function doesn't freeze
 * mid-fetch and the caller never waits. Outside a request scope `after()` throws — then the
 * nudge simply runs detached.
 */
export function nudgeLater(topic: NudgeTopic): void {
  try {
    after(() => nudge(topic));
  } catch {
    void nudge(topic);
  }
}
