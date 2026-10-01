import { after } from "next/server";
import type { Sql } from "postgres";
import { signBody } from "../../auth/signing";
import { consultantConfig, type ConsultantConfig } from "../../config";
import { TUNABLES_3A } from "../../metrics/tunables";
import type { EventType } from "../../types";
import { connectConsultantDb, errorTag, logError } from "../http";
import { nudge } from "../realtime";
import { afterFailure } from "./backoff";

/**
 * Platform-event dispatcher (Wade Foster / Zapier + Jeff Lawson / Twilio lenses).
 *
 * The database already guarantees every business change has an event: outbox triggers
 * (schema.ts, CONSULTANT_DDL_V2) insert `consultant_events` + one `consultant_event_deliveries`
 * row per receiver (n8n, emma_owner) in the same transaction as the change. This module only
 * DELIVERS them, with at-least-once semantics:
 *
 *  1. CLAIM  — one statement picks due rows (`status = 'pending' and next_attempt_at <= now()`)
 *     with `FOR UPDATE SKIP LOCKED` (concurrent cron runs / after() kicks never grab the same
 *     row), increments `attempts` and pushes `next_attempt_at` forward by a LEASE. No
 *     transaction is held open during HTTP.
 *  2. SEND   — POST the stored event JSON, signed `X-VS-Signature: t=…,v1=…` with the target's
 *     secret, with a timeout. Any 2xx = delivered.
 *  3. SETTLE — 2xx → `sent`. Otherwise exponential backoff (cfg.delivery) → `dead` after
 *     cfg.delivery.maxAttempts (visible + retryable in Systems admin).
 *  If the worker crashes between 1 and 3 the lease simply expires and the row is retried — so a
 *  receiver can see an event twice and MUST dedupe on `event.id` (documented in SPEC-WAVE2).
 *
 * A target with no URL/secret configured is not claimed at all (rows stay `pending`, nothing
 * spins or burns attempts); the report says why, and Systems health shows `configured: false`
 * with the pending count.
 */

export const DELIVERY_TARGETS = ["n8n", "emma_owner"] as const;
export type DeliveryTarget = (typeof DELIVERY_TARGETS)[number];

export type TargetConfig = { target: DeliveryTarget; url: string; secret: string };

/** Which targets can be delivered to right now, and why the others are skipped. Pure. */
export function resolveTargets(cfg: Pick<ConsultantConfig, "n8n" | "emmaOwner">): {
  ready: TargetConfig[];
  skipped: Partial<Record<DeliveryTarget, string>>;
} {
  const ready: TargetConfig[] = [];
  const skipped: Partial<Record<DeliveryTarget, string>> = {};
  const check = (target: DeliveryTarget, url: string, secret: string) => {
    if (!url) skipped[target] = "url_not_configured";
    else if (!/^https:\/\//i.test(url) && process.env.NODE_ENV === "production") skipped[target] = "url_not_https";
    else if (!secret) skipped[target] = "secret_not_configured";
    else ready.push({ target, url, secret });
  };
  check("n8n", cfg.n8n.eventsUrl, cfg.n8n.signingSecret);
  check("emma_owner", cfg.emmaOwner.eventsUrl, cfg.emmaOwner.signingSecret);
  return { ready, skipped };
}

export type DispatchReport = {
  claimed: number;
  sent: number;
  retried: number;
  dead: number;
  skipped: Partial<Record<DeliveryTarget, string>>;
};

type Claimed = { event_id: string; target: DeliveryTarget; attempts: number; payload: unknown };

export type PostResult = { ok: true } | { ok: false; error: string };

/** POST one signed event. Error strings are generic codes — never a response body. */
export async function postSigned(
  url: string,
  secret: string,
  rawBody: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = TUNABLES_3A.delivery.requestTimeoutMs,
): Promise<PostResult> {
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-VS-Signature": signBody(secret, rawBody), ...headers },
      body: rawBody,
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "manual",
    });
    if (res.status >= 200 && res.status < 300) return { ok: true };
    return { ok: false, error: `http_${res.status}` };
  } catch (e) {
    const name = String((e as { name?: unknown } | null)?.name ?? ""); // DOMException isn't always instanceof Error
    return { ok: false, error: name === "TimeoutError" || name === "AbortError" ? "timeout" : "network" };
  }
}

/** Run `fn` over items with at most `limit` in flight. */
export async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}

export async function dispatchDue(
  db: Sql,
  opts: { limit?: number; fetchImpl?: typeof fetch; concurrency?: number } = {},
): Promise<DispatchReport> {
  const cfg = consultantConfig();
  const { ready, skipped } = resolveTargets(cfg);
  const report: DispatchReport = { claimed: 0, sent: 0, retried: 0, dead: 0, skipped };
  if (!ready.length) return report;

  const limit = Math.max(1, opts.limit ?? cfg.delivery.batchSize);
  const targets = ready.map((r) => r.target);
  const claimed = await db<Claimed[]>`
    with due as (
      select d.event_id, d.target from public.consultant_event_deliveries d
      where d.status = 'pending' and d.next_attempt_at <= now() and d.target = any(${targets}::text[])
      order by d.next_attempt_at
      limit ${limit}
      for update of d skip locked
    )
    update public.consultant_event_deliveries d
    set attempts = d.attempts + 1,
        next_attempt_at = now() + make_interval(secs => ${TUNABLES_3A.delivery.leaseSec})
    from due, public.consultant_events e
    where d.event_id = due.event_id and d.target = due.target and e.id = d.event_id
    returning d.event_id::text as event_id, d.target, d.attempts, e.payload
  `;
  report.claimed = claimed.length;
  const byTarget = new Map(ready.map((r) => [r.target, r]));

  await mapLimit(claimed, opts.concurrency ?? 5, async (row) => {
    const t = byTarget.get(row.target)!;
    const rawBody = JSON.stringify(row.payload);
    const type = (row.payload as { type?: string } | null)?.type ?? "unknown";
    const result = await postSigned(t.url, t.secret, rawBody, { "X-VS-Event-Id": row.event_id, "X-VS-Event-Type": type }, opts.fetchImpl);
    try {
      if (result.ok) {
        await db`
          update public.consultant_event_deliveries set status = 'sent', sent_at = now(), last_error = null
          where event_id = ${row.event_id}::uuid and target = ${row.target} and status = 'pending'
        `;
        report.sent++;
        return;
      }
      const decision = afterFailure(row.attempts, cfg.delivery);
      if (decision.status === "dead") {
        await db`
          update public.consultant_event_deliveries set status = 'dead', last_error = ${result.error}
          where event_id = ${row.event_id}::uuid and target = ${row.target} and status = 'pending'
        `;
        report.dead++;
        console.warn("[consultant] event delivery dead", row.target, type, result.error);
      } else {
        await db`
          update public.consultant_event_deliveries
          set last_error = ${result.error}, next_attempt_at = now() + make_interval(secs => ${decision.delaySec})
          where event_id = ${row.event_id}::uuid and target = ${row.target} and status = 'pending'
        `;
        report.retried++;
      }
    } catch (e) {
      // Settling failed (DB blip): the lease expires and the row is retried — at-least-once.
      logError("events.settle", e);
    }
  });
  return report;
}

/**
 * Schedule a small dispatch after the current response (call it after any mutation that
 * produced events). Never throws; outside a request scope it is a no-op (the cron catches up).
 */
export function kickDispatch(): void {
  try {
    after(async () => {
      try {
        const db = await connectConsultantDb();
        await dispatchDue(db, { limit: TUNABLES_3A.delivery.kickBatch });
      } catch (e) {
        console.error("[consultant] events.kick failed", errorTag(e));
      }
    });
  } catch {
    // Not inside a request (script / test): the every-minute cron delivers instead.
  }
}

/** Dead event deliveries back to pending (all targets of that event). Returns rows reset. */
export async function retryDeadEvent(db: Sql, eventId: string): Promise<number> {
  const rows = await db`
    update public.consultant_event_deliveries
    set status = 'pending', attempts = 0, next_attempt_at = now(), last_error = null
    where event_id = ${eventId}::uuid and status = 'dead'
    returning 1
  `;
  return rows.length;
}

/** Events that change a leaderboard / metrics number. */
export const METRIC_EVENT_TYPES: readonly EventType[] = [
  "lead.stage_changed",
  "call.completed",
  "meeting.scheduled",
  "meeting.held",
  "meeting.no_show",
  "deal.won",
  "deal.paid",
];

/**
 * Nudge the leaderboard if any metric-affecting event happened recently. Run by the dispatch
 * cron, so stage changes / completed calls made anywhere (board, wrap-up, CRM, scripts) reach
 * open leaderboards within a minute even though those writers don't know about Realtime.
 */
export async function nudgeLeaderboardIfChanged(db: Sql, lookbackSec: number = TUNABLES_3A.realtime.leaderboardLookbackSec): Promise<boolean> {
  const rows = await db<{ hit: boolean }[]>`
    select exists (
      select 1 from public.consultant_events
      where occurred_at > now() - make_interval(secs => ${lookbackSec}) and type = any(${[...METRIC_EVENT_TYPES]}::text[])
    ) as hit
  `;
  if (rows[0]?.hit) await nudge("leaderboard");
  return !!rows[0]?.hit;
}
