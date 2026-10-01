import type { Sql } from "postgres";
import { consultantConfig } from "../../config";
import { TUNABLES_3A } from "../../metrics/tunables";
import type { EmmaMessage, SystemHealth } from "../../types";
import { listDeadMessages } from "../emma/sender";
import { iso } from "../util";
import { resolveTargets } from "./dispatch";

/**
 * Systems & Operations view (`view_system_health`). Counts only — no payloads, no PII.
 * `configured: false` on n8n / emmaOwner is how an unconfigured delivery target surfaces: its
 * rows stay `pending` (the dispatcher doesn't claim them), shown here as the pending count.
 */
export async function systemHealth(db: Sql): Promise<SystemHealth> {
  const cfg = consultantConfig();
  const started = Date.now();
  let dbOk = true;
  let latencyMs: number | null = null;
  try {
    await db`select 1`;
    latencyMs = Date.now() - started;
  } catch {
    dbOk = false;
  }
  const { ready } = resolveTargets(cfg);
  const configured = (t: "n8n" | "emma_owner") => ready.some((r) => r.target === t);

  if (!dbOk) {
    const empty = { lastDeliveryAt: null, pending: 0, dead: 0 };
    return {
      checkedAt: new Date().toISOString(),
      database: { ok: false, latencyMs: null },
      twilio: { configured: !!(cfg.twilio.accountSid && cfg.twilio.authToken) },
      anthropic: { configured: cfg.ai.apiKeyPresent },
      n8n: { configured: configured("n8n"), ...empty },
      emmaOwner: { configured: configured("emma_owner"), ...empty },
      emmaMessages: { queued: 0, failed24h: 0, dead: 0 },
      calendars: { connected: 0, errors: 0 },
      summaries: { pending: 0, failed: 0 },
    };
  }

  const [deliveries, messages, calendars, summaries] = await Promise.all([
    db<{ target: string; last_sent: Date | null; pending: number; dead: number }[]>`
      select target, max(sent_at) as last_sent,
        count(*) filter (where status = 'pending')::int as pending,
        count(*) filter (where status = 'dead')::int as dead
      from public.consultant_event_deliveries group by target
    `,
    db<{ queued: number; failed24h: number; dead: number }[]>`
      select count(*) filter (where status in ('queued', 'sending', 'failed'))::int as queued,
        count(*) filter (where status = 'failed' and updated_at > now() - interval '24 hours')::int as "failed24h",
        count(*) filter (where status = 'dead')::int as dead
      from public.consultant_messages
    `,
    db<{ connected: number; errors: number }[]>`
      select count(*) filter (where status = 'connected')::int as connected,
        count(*) filter (where status = 'error')::int as errors
      from public.consultant_calendar_connections
    `,
    db<{ pending: number; failed: number }[]>`
      select count(*) filter (where summary_status in ('pending', 'processing') and ended_at is not null)::int as pending,
        count(*) filter (where summary_status = 'failed')::int as failed
      from public.consultant_calls
    `,
  ]);
  const byTarget = (t: string) => {
    const r = deliveries.find((d) => d.target === t);
    return { lastDeliveryAt: iso(r?.last_sent ?? null), pending: r?.pending ?? 0, dead: r?.dead ?? 0 };
  };
  return {
    checkedAt: new Date().toISOString(),
    database: { ok: true, latencyMs },
    twilio: { configured: !!(cfg.twilio.accountSid && cfg.twilio.authToken) },
    anthropic: { configured: cfg.ai.apiKeyPresent },
    n8n: { configured: configured("n8n"), ...byTarget("n8n") },
    emmaOwner: { configured: configured("emma_owner"), ...byTarget("emma_owner") },
    emmaMessages: messages[0] ?? { queued: 0, failed24h: 0, dead: 0 },
    calendars: calendars[0] ?? { connected: 0, errors: 0 },
    summaries: summaries[0] ?? { pending: 0, failed: 0 },
  };
}

/** A dead event (all its dead deliveries grouped). Not in the contract yet (CR-3A-3). */
export type DeadEvent = {
  kind: "event";
  id: string; // event id — the retry route's [id]
  type: string;
  occurredAt: string;
  targets: string[];
  attempts: number;
  lastError: string | null;
};

export type DeadLetters = { events: DeadEvent[]; messages: EmmaMessage[] };

export async function listDeadLetters(db: Sql, limit: number = TUNABLES_3A.admin.deadLetterLimit): Promise<DeadLetters> {
  const [events, messages] = await Promise.all([
    db<{ id: string; type: string; occurred_at: Date; targets: string[]; attempts: number; last_error: string | null }[]>`
      select e.id::text, e.type, e.occurred_at, array_agg(d.target order by d.target) as targets,
        max(d.attempts)::int as attempts, max(d.last_error) as last_error
      from public.consultant_event_deliveries d
      join public.consultant_events e on e.id = d.event_id
      where d.status = 'dead'
      group by e.id, e.type, e.occurred_at
      order by e.occurred_at desc
      limit ${limit}
    `,
    listDeadMessages(db, limit),
  ]);
  return {
    events: events.map((r) => ({
      kind: "event" as const,
      id: r.id,
      type: r.type,
      occurredAt: iso(r.occurred_at) ?? new Date(0).toISOString(),
      targets: r.targets,
      attempts: Number(r.attempts),
      lastError: r.last_error,
    })),
    messages,
  };
}
