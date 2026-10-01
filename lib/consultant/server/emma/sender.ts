import { after } from "next/server";
import type { Sql } from "postgres";
import { findTemplate, type EmmaTemplate } from "../../../../ai-configs/emma/templates";
import { consultantConfig } from "../../config";
import { TUNABLES_3A } from "../../metrics/tunables";
import {
  CLINICS_VERTICAL,
  EMMA_AUDIENCES,
  EMMA_MESSAGE_STATUSES,
  normalizeZaPhone,
  type EmmaAudience,
  type EmmaMessage,
  type EmmaMessageStatus,
} from "../../types";
import { audit, type AuditActorKind } from "../audit";
import { afterFailure } from "../events/backoff";
import { mapLimit } from "../events/dispatch";
import { connectConsultantDb, errorTag, logError } from "../http";
import { iso } from "../util";
import { mayMessageLead, optOut } from "./consent";
import { greetingName, renderTemplate, TemplateError } from "./render";
import { channelAddress, sendTwilioMessage } from "./twilio";

/**
 * Emma's outbox (Jeff Lawson / Twilio lens): every WhatsApp/SMS is a `consultant_messages` row
 * first, then sent by a worker with retries and a dead-letter state. Nothing is fire-and-forget:
 *
 *   enqueue (idempotency_key) → queued ─claim (SKIP LOCKED, lease)→ sending ─Twilio 2xx→ sent
 *                                   ↑                                   │         └status cb→ delivered/read
 *                                   └── failed (backoff) ←─ retryable ──┤
 *                                          dead ←─ permanent / max attempts (trigger emits emma.message_dead)
 *   skipped = deliberately not sent (no consent, opted out, no valid +27 phone, no recipient) — visible + audited.
 *
 * A crash mid-send leaves the row `sending` with an expired lease → reclaimed and retried
 * (at-least-once). Every send / skip / failure is written to the audit log (no bodies, no phones).
 */

export type Channel = "whatsapp" | "sms";
export type SkipReason = "no_consent" | "opted_out" | "no_valid_phone" | "no_recipient" | "no_consultant_phone" | "no_owner_recipient";

export type EnqueueInput = {
  audience: EmmaAudience;
  template: string;
  leadId?: string | null;
  consultantId?: string | null;
  channel?: Channel;
  variables?: Record<string, string>;
  idempotencyKey?: string | null;
  sendAt?: Date | null;
  actor: { id: string | null; kind: AuditActorKind };
};

export type EnqueueResult = { id: string; status: EmmaMessageStatus; created: boolean; skipped: SkipReason | null };

export { TemplateError };

/** Template must exist and be meant for this audience. Throws TemplateError. */
export function templateFor(id: string, audience: EmmaAudience): EmmaTemplate {
  const t = findTemplate(id);
  if (!t) throw new TemplateError("unknown_template");
  if (t.audience !== audience) throw new TemplateError("wrong_audience");
  return t;
}

type LeadCtx = {
  id: string;
  clinic_name: string;
  contact_name: string | null;
  phone: string | null;
  lead_source: string | null;
  consultant_id: string | null;
  opted_in_at: Date | null;
  opted_out_at: Date | null;
};

async function leadContext(db: Sql, leadId: string): Promise<LeadCtx | null> {
  const rows = await db<LeadCtx[]>`
    select c.id::text, coalesce(nullif(c.company, ''), c.name)::text as clinic_name, c.contact_name, c.phone,
      c.lead_source, c.consultant_id::text as consultant_id, k.opted_in_at, k.opted_out_at
    from public.clients c
    left join public.consultant_contact_consent k on k.client_id = c.id
    where c.id = ${leadId}::uuid and c.vertical = ${CLINICS_VERTICAL}
  `;
  return rows[0] ?? null;
}

type ConsultantCtx = { id: string; name: string; phone: string | null };

/**
 * A consultant's WhatsApp number. `team_members` has no phone column in the current schema
 * (contract request CR-3A-4); `to_jsonb(m)->>'phone'` reads it once it exists without breaking
 * before then — until then consultant messages are `skipped` (no_consultant_phone), visibly.
 */
async function consultantContext(db: Sql, consultantId: string): Promise<ConsultantCtx | null> {
  const rows = await db<ConsultantCtx[]>`
    select m.id::text, coalesce(nullif(m.full_name, ''), m.username)::text as name, to_jsonb(m)->>'phone' as phone
    from public.team_members m where m.id = ${consultantId}::uuid and m.status = 'active'
  `;
  return rows[0] ?? null;
}

export async function enqueueMessage(db: Sql, input: EnqueueInput): Promise<EnqueueResult> {
  const tpl = templateFor(input.template, input.audience);
  const channel: Channel = input.channel ?? tpl.channel;
  let consultantId = input.consultantId ?? null;
  let skipped: SkipReason | null = null;

  if (input.audience === "lead") {
    if (!input.leadId) throw new TemplateError("wrong_audience");
    const lead = await leadContext(db, input.leadId);
    if (!lead) skipped = "no_recipient";
    else {
      consultantId = consultantId ?? lead.consultant_id;
      if (!tpl.transactional) {
        const gate = mayMessageLead(lead, lead.lead_source);
        if (!gate.ok) skipped = gate.reason;
      }
    }
  } else if (input.audience === "consultant" && !consultantId) {
    throw new TemplateError("wrong_audience");
  }

  const status: EmmaMessageStatus = skipped ? "skipped" : "queued";
  const inserted = await db<{ id: string; status: string }[]>`
    insert into public.consultant_messages
      (audience, client_id, consultant_id, channel, template, variables, idempotency_key, status, last_error, next_attempt_at)
    values (${input.audience}, ${input.leadId ?? null}::uuid, ${consultantId}::uuid, ${channel}, ${tpl.id},
      ${db.json((input.variables ?? {}) as never)}, ${input.idempotencyKey ?? null}, ${status}, ${skipped},
      ${input.sendAt ?? new Date()})
    on conflict (idempotency_key) do nothing
    returning id::text, status
  `;
  if (!inserted[0]) {
    const existing = await db<{ id: string; status: string; last_error: string | null }[]>`
      select id::text, status, last_error from public.consultant_messages where idempotency_key = ${input.idempotencyKey ?? null}
    `;
    const e = existing[0];
    return { id: e.id, status: e.status as EmmaMessageStatus, created: false, skipped: e.status === "skipped" ? (e.last_error as SkipReason) : null };
  }
  await audit(db, {
    actorId: input.actor.id,
    actorKind: input.actor.kind,
    action: skipped ? "emma.skipped" : "emma.queued",
    entity: "message",
    entityId: inserted[0].id,
    meta: { template: tpl.id, audience: input.audience, channel, leadId: input.leadId ?? null, reason: skipped },
  });
  return { id: inserted[0].id, status, created: true, skipped };
}

// ── Sending ─────────────────────────────────────────────────────────────────

export type SendReport = { claimed: number; sent: number; retried: number; dead: number; skipped: number; notSending: string[] };

type ClaimedMsg = {
  id: string;
  audience: string;
  client_id: string | null;
  consultant_id: string | null;
  channel: Channel;
  template: string;
  variables: Record<string, string> | null;
  attempts: number;
};

/** Channels that can send right now (Twilio creds + a sender number, or dry-run). Pure. */
export function readyChannels(cfg: ReturnType<typeof consultantConfig>): { channels: Channel[]; notSending: string[] } {
  const notSending: string[] = [];
  if (!cfg.emma.dryRun && !(cfg.twilio.accountSid && cfg.twilio.authToken)) return { channels: [], notSending: ["twilio_not_configured"] };
  const channels: Channel[] = [];
  if (cfg.emma.whatsappFrom || cfg.emma.dryRun) channels.push("whatsapp");
  else notSending.push("whatsapp_sender_not_configured");
  if (cfg.emma.smsFrom || cfg.emma.dryRun) channels.push("sms");
  else notSending.push("sms_sender_not_configured");
  return { channels, notSending };
}

export async function sendDueMessages(db: Sql, opts: { limit?: number; fetchImpl?: typeof fetch } = {}): Promise<SendReport> {
  const cfg = consultantConfig();
  const { channels, notSending } = readyChannels(cfg);
  const report: SendReport = { claimed: 0, sent: 0, retried: 0, dead: 0, skipped: 0, notSending };
  if (!channels.length) return report;

  const claimed = await db<ClaimedMsg[]>`
    with due as (
      select id from public.consultant_messages
      where status in ('queued', 'failed', 'sending') and next_attempt_at <= now() and channel = any(${channels}::text[])
      order by next_attempt_at
      limit ${Math.max(1, opts.limit ?? TUNABLES_3A.emma.batch)}
      for update skip locked
    )
    update public.consultant_messages m
    set status = 'sending', attempts = m.attempts + 1, updated_at = now(),
        next_attempt_at = now() + make_interval(secs => ${TUNABLES_3A.emma.leaseSec})
    from due where m.id = due.id
    returning m.id::text, m.audience, m.client_id::text as client_id, m.consultant_id::text as consultant_id,
      m.channel, m.template, m.variables, m.attempts
  `;
  report.claimed = claimed.length;

  await mapLimit(claimed, 4, async (msg) => {
    try {
      const outcome = await sendOne(db, msg, opts.fetchImpl);
      report[outcome]++;
    } catch (e) {
      logError("emma.send", e); // the lease expires and the row is retried
    }
  });
  return report;
}

type Outcome = "sent" | "retried" | "dead" | "skipped";

async function sendOne(db: Sql, msg: ClaimedMsg, fetchImpl?: typeof fetch): Promise<Outcome> {
  const cfg = consultantConfig();
  const tpl = findTemplate(msg.template);
  if (!tpl || tpl.audience !== msg.audience) return settleDead(db, msg, "unknown_template");

  const lead = msg.client_id ? await leadContext(db, msg.client_id) : null;
  const consultant = msg.consultant_id ? await consultantContext(db, msg.consultant_id) : null;

  // Resolve the recipient; enforce consent AGAIN at send time (it may have changed since enqueue).
  let to: string | null = null;
  if (msg.audience === "lead") {
    if (!lead) return settleSkipped(db, msg, "no_recipient");
    if (!tpl.transactional) {
      const gate = mayMessageLead(lead, lead.lead_source);
      if (!gate.ok) return settleSkipped(db, msg, gate.reason);
    }
    to = lead.phone ? normalizeZaPhone(lead.phone) : null;
    if (!to) return settleSkipped(db, msg, "no_valid_phone");
  } else if (msg.audience === "consultant") {
    if (!consultant) return settleSkipped(db, msg, "no_recipient");
    to = consultant.phone ? normalizeZaPhone(consultant.phone) : null;
    if (!to) return settleSkipped(db, msg, "no_consultant_phone");
  } else {
    return settleSkipped(db, msg, "no_owner_recipient");
  }

  let rendered;
  try {
    rendered = renderTemplate(tpl, {
      clinicName: lead?.clinic_name ?? "",
      contactName: greetingName(lead?.contact_name),
      consultantName: greetingName(consultant?.name, "the VantageStack team"),
      ...(msg.variables ?? {}),
    });
  } catch (e) {
    if (e instanceof TemplateError) return settleDead(db, msg, e.code);
    throw e;
  }

  if (cfg.emma.dryRun) return settleSent(db, msg, `DRYRUN-${msg.id}`, true);

  const contentSid = msg.channel === "whatsapp" && tpl.contentSidEnv ? (process.env[tpl.contentSidEnv] ?? "").trim() || null : null;
  const from = msg.channel === "whatsapp" ? cfg.emma.whatsappFrom : cfg.emma.smsFrom;
  const result = await sendTwilioMessage(
    {
      accountSid: cfg.twilio.accountSid,
      authToken: cfg.twilio.authToken,
      from: channelAddress(msg.channel, from),
      to: channelAddress(msg.channel, to),
      body: rendered.body,
      contentSid,
      contentVariables: contentSid ? rendered.contentVariables : null,
      statusCallback: cfg.publicUrl ? `${cfg.publicUrl}/api/webhooks/emma-status` : null,
    },
    fetchImpl,
  );
  if (result.ok) return settleSent(db, msg, result.sid, false);
  if (result.kind === "opted_out") {
    if (msg.client_id && msg.audience === "lead") await optOut(db, msg.client_id, "carrier");
    return settleSkipped(db, msg, "opted_out");
  }
  if (result.kind === "permanent") return settleDead(db, msg, result.error);
  return settleFailure(db, msg, result.error);
}

function auditMsg(db: Sql, msg: Pick<ClaimedMsg, "id" | "template" | "audience" | "channel" | "attempts" | "client_id">, action: string, extra: Record<string, string | number | boolean | null> = {}) {
  return audit(db, {
    actorId: null,
    actorKind: "system",
    action,
    entity: "message",
    entityId: msg.id,
    meta: { template: msg.template, audience: msg.audience, channel: msg.channel, attempts: msg.attempts, leadId: msg.client_id, ...extra },
  });
}

async function settleSent(db: Sql, msg: ClaimedMsg, sid: string, dryRun: boolean): Promise<Outcome> {
  await db`
    update public.consultant_messages
    set status = 'sent', twilio_sid = ${sid}, sent_at = now(), last_error = null, updated_at = now()
    where id = ${msg.id}::uuid and status = 'sending'
  `;
  await auditMsg(db, msg, "emma.sent", { dryRun });
  return "sent";
}

async function settleSkipped(db: Sql, msg: ClaimedMsg, reason: SkipReason): Promise<Outcome> {
  await db`
    update public.consultant_messages set status = 'skipped', last_error = ${reason}, updated_at = now()
    where id = ${msg.id}::uuid and status = 'sending'
  `;
  await auditMsg(db, msg, "emma.skipped", { reason });
  return "skipped";
}

async function settleDead(db: Sql, msg: ClaimedMsg, error: string): Promise<Outcome> {
  // status → dead fires the outbox trigger: emma.message_dead reaches n8n + EMMA.
  await db`
    update public.consultant_messages set status = 'dead', last_error = ${error}, updated_at = now()
    where id = ${msg.id}::uuid and status = 'sending'
  `;
  await auditMsg(db, msg, "emma.dead", { error });
  console.warn("[consultant] emma message dead", msg.template, error);
  return "dead";
}

async function settleFailure(db: Sql, msg: ClaimedMsg, error: string): Promise<Outcome> {
  const cfg = consultantConfig();
  const decision = afterFailure(msg.attempts, cfg.emma);
  if (decision.status === "dead") return settleDead(db, msg, error);
  await db`
    update public.consultant_messages
    set status = 'failed', last_error = ${error}, updated_at = now(),
        next_attempt_at = now() + make_interval(secs => ${decision.delaySec})
    where id = ${msg.id}::uuid and status = 'sending'
  `;
  await auditMsg(db, msg, "emma.failed", { error });
  return "retried";
}

// ── Status callbacks ────────────────────────────────────────────────────────

const PROGRESS: Record<string, number> = { sending: 0, sent: 1, delivered: 2, read: 3 };

/**
 * Twilio MessageStatus → our row. Delivery progress only moves forward (sent → delivered →
 * read; a late "sent" never downgrades "read"). failed / undelivered after Twilio accepted the
 * message → retry with backoff (or dead at max attempts) so an undelivered message is never
 * silently lost. Returns false when no message has that SID.
 */
export async function applyStatusCallback(db: Sql, input: { sid: string; status: string; errorCode: string | null }): Promise<boolean> {
  const rows = await db<(ClaimedMsg & { status: string })[]>`
    select id::text, audience, client_id::text as client_id, consultant_id::text as consultant_id, channel, template,
      variables, attempts, status
    from public.consultant_messages where twilio_sid = ${input.sid}
  `;
  const msg = rows[0];
  if (!msg) return false;
  const s = input.status.toLowerCase();

  if (s === "delivered" || s === "read") {
    await db`
      update public.consultant_messages set status = ${s}, updated_at = now()
      where id = ${msg.id}::uuid and status in ('sending', 'sent', 'delivered')
        and ${PROGRESS[s]} > (case status when 'sending' then 0 when 'sent' then 1 when 'delivered' then 2 else 3 end)
    `;
    await auditMsg(db, msg, "emma.status", { status: s });
    return true;
  }
  if (s === "failed" || s === "undelivered") {
    if (!["sent", "sending"].includes(msg.status)) return true; // already delivered/read/dead: ignore stale
    const error = input.errorCode ? `twilio_${input.errorCode.replace(/\D/g, "").slice(0, 8)}` : `twilio_${s}`;
    if (input.errorCode === "21610" && msg.client_id && msg.audience === "lead") {
      await optOut(db, msg.client_id, "carrier");
      await db`update public.consultant_messages set status = 'skipped', last_error = 'opted_out', updated_at = now() where id = ${msg.id}::uuid`;
      await auditMsg(db, msg, "emma.skipped", { reason: "opted_out" });
      return true;
    }
    // Make it claimable by settleFailure's predicate, then apply the retry policy.
    await db`update public.consultant_messages set status = 'sending' where id = ${msg.id}::uuid and status = 'sent'`;
    await settleFailure(db, msg, error);
    return true;
  }
  return true; // queued / accepted / sending / sent: nothing to change (we mark sent on API accept)
}

// ── Admin + reads ───────────────────────────────────────────────────────────

export async function retryDeadMessage(db: Sql, id: string): Promise<boolean> {
  const rows = await db`
    update public.consultant_messages
    set status = 'queued', attempts = 0, next_attempt_at = now(), last_error = null, updated_at = now()
    where id = ${id}::uuid and status = 'dead'
    returning 1
  `;
  return rows.length > 0;
}

type MessageRow = {
  id: string;
  audience: string;
  client_id: string | null;
  consultant_id: string | null;
  channel: string;
  template: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: Date | string;
  sent_at: Date | string | null;
};

export function toEmmaMessage(r: MessageRow): EmmaMessage {
  return {
    id: r.id,
    audience: (EMMA_AUDIENCES as readonly string[]).includes(r.audience) ? (r.audience as EmmaAudience) : "lead",
    leadId: r.client_id,
    consultantId: r.consultant_id,
    channel: r.channel === "sms" ? "sms" : "whatsapp",
    template: r.template,
    status: (EMMA_MESSAGE_STATUSES as readonly string[]).includes(r.status) ? (r.status as EmmaMessageStatus) : "queued",
    attempts: Number(r.attempts),
    lastError: r.last_error, // generic codes only (http_503, twilio_63016, no_consent…)
    createdAt: iso(r.created_at) ?? new Date(0).toISOString(),
    sentAt: iso(r.sent_at),
  };
}

const MESSAGE_COLUMNS = (db: Sql) => db`
  id::text, audience, client_id::text as client_id, consultant_id::text as consultant_id, channel, template,
  status, attempts, last_error, created_at, sent_at
`;

export async function listMessagesForLead(db: Sql, leadId: string): Promise<EmmaMessage[]> {
  const rows = await db<MessageRow[]>`
    select ${MESSAGE_COLUMNS(db)} from public.consultant_messages
    where client_id = ${leadId}::uuid order by created_at desc limit ${consultantConfig().limits.listMax}
  `;
  return rows.map(toEmmaMessage);
}

export async function listDeadMessages(db: Sql, limit: number): Promise<EmmaMessage[]> {
  const rows = await db<MessageRow[]>`
    select ${MESSAGE_COLUMNS(db)} from public.consultant_messages
    where status = 'dead' order by updated_at desc limit ${limit}
  `;
  return rows.map(toEmmaMessage);
}

/** Send a few due messages after the current response. Never throws. */
export function kickEmma(): void {
  try {
    after(async () => {
      try {
        await sendDueMessages(await connectConsultantDb(), { limit: TUNABLES_3A.emma.kickBatch });
      } catch (e) {
        console.error("[consultant] emma.kick failed", errorTag(e));
      }
    });
  } catch {
    // outside a request: the dispatch cron sends it within a minute
  }
}
