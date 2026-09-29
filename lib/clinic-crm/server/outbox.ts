import type { Sql } from "postgres";
import type { AutomationKind, Channel } from "../types";
import { CRM_CONFIG } from "./config";
import { statusCallbackUrl } from "./messaging";
import {
  backoffMs,
  contentVariables,
  decideChannel,
  formatAppointmentTime,
  greetingName,
  iso,
  newLeadAckKey,
  noShowKey,
  parseDedupeKey,
  reminderDueAt,
  reminderKey,
  reminderKeyPrefix,
  renderTemplate,
  windowOpen,
  type TemplateVars,
} from "./rules";
import { sendMessage, TwilioError } from "./twilio";
import { recordOutbound } from "./repo/messages";
import { setOptedOut } from "./repo/patients";

/**
 * The automation engine (Workato-style recipes over a transactional outbox):
 *
 *   schedule  — idempotent INSERT keyed by dedupe_key ("this message, for this fact").
 *   enqueue   — cron backstop that derives due rows from current data, so enabling an
 *               automation later, or a missed eager schedule, self-heals.
 *   drain     — claims due rows with FOR UPDATE SKIP LOCKED (overlapping crons can't
 *               double-claim), re-validates against live data, picks the channel,
 *               sends, records, and retries with exponential backoff.
 *
 * Delivery is at-least-once: a crash between Twilio accepting a send and the row
 * being marked sent re-sends after the lease expires. The outbox is marked sent
 * BEFORE the message row is written to keep that window as small as possible.
 */

const { outbox: OB } = CRM_CONFIG;

type OutboxStatus = "pending" | "sent" | "failed" | "skipped";

async function schedule(
  sql: Sql,
  row: { clinicId: string; patientId: string; automation: AutomationKind; dueAt: Date; dedupeKey: string },
): Promise<string | null> {
  // A key cancelled by a reschedule/cancellation comes back to life if the fact returns
  // (e.g. rescheduled back to the original slot); a sent/failed key never re-sends.
  const [r] = await sql<{ id: string }[]>`
    INSERT INTO clinic_crm.outbox (clinic_id, patient_id, automation, due_at, dedupe_key)
    VALUES (${row.clinicId}, ${row.patientId}, ${row.automation}, ${row.dueAt}, ${row.dedupeKey})
    ON CONFLICT (dedupe_key) DO UPDATE
       SET status = 'pending', due_at = EXCLUDED.due_at, attempts = 0, last_error = NULL
     WHERE clinic_crm.outbox.status = 'skipped'
       AND clinic_crm.outbox.last_error IN ('rescheduled', 'cancelled')
    RETURNING id`;
  return r?.id ?? null;
}

async function automationSettings(sql: Sql, clinicId: string, kind: AutomationKind) {
  const [a] = await sql<{ enabled: boolean; offset: number }[]>`
    SELECT enabled, "offset" FROM clinic_crm.automations WHERE clinic_id = ${clinicId} AND kind = ${kind}`;
  return a ?? null;
}

/** Cancels pending reminders for an appointment, except the key that is still current. */
export async function cancelReminders(
  sql: Sql,
  clinicId: string,
  appointmentId: string,
  reason: "rescheduled" | "cancelled",
  keepKey: string | null = null,
): Promise<number> {
  const rows = await sql`
    UPDATE clinic_crm.outbox SET status = 'skipped', last_error = ${reason}
     WHERE clinic_id = ${clinicId} AND status = 'pending'
       AND starts_with(dedupe_key, ${reminderKeyPrefix(appointmentId)})
       ${keepKey ? sql`AND dedupe_key <> ${keepKey}` : sql``}
    RETURNING id`;
  return rows.length;
}

/**
 * (Re)schedules the reminder for an appointment's current start time. A reschedule
 * produces a new key; every other pending reminder for the appointment is cancelled.
 */
export async function scheduleReminder(
  sql: Sql,
  clinicId: string,
  appt: { id: string; patientId: string; startsAt: string; status: string },
  now: Date = new Date(),
): Promise<string | null> {
  const key = reminderKey(appt.id, appt.startsAt);
  if (appt.status === "cancelled") {
    await cancelReminders(sql, clinicId, appt.id, "cancelled");
    return null;
  }
  await cancelReminders(sql, clinicId, appt.id, "rescheduled", key);
  if (appt.status !== "booked" && appt.status !== "confirmed") return null;
  const a = await automationSettings(sql, clinicId, "appointment_reminder");
  if (!a?.enabled) return null; // the cron backstop picks it up if enabled later
  const due = reminderDueAt(new Date(appt.startsAt), a.offset, now);
  if (!due) return null;
  return schedule(sql, { clinicId, patientId: appt.patientId, automation: "appointment_reminder", dueAt: due, dedupeKey: key });
}

export async function scheduleNoShow(
  sql: Sql,
  clinicId: string,
  appt: { id: string; patientId: string },
  now: Date = new Date(),
): Promise<string | null> {
  const a = await automationSettings(sql, clinicId, "no_show_followup");
  if (!a?.enabled) return null;
  const due = new Date(now.getTime() + a.offset * 3_600_000);
  return schedule(sql, { clinicId, patientId: appt.patientId, automation: "no_show_followup", dueAt: due, dedupeKey: noShowKey(appt.id) });
}

export async function scheduleNewLeadAck(sql: Sql, clinicId: string, patientId: string): Promise<string | null> {
  const a = await automationSettings(sql, clinicId, "new_lead_ack");
  if (!a?.enabled) return null;
  return schedule(sql, { clinicId, patientId, automation: "new_lead_ack", dueAt: new Date(), dedupeKey: newLeadAckKey(patientId) });
}

/** On opt-out: nothing queued for this person may go out. */
export async function skipPendingForPatient(sql: Sql, clinicId: string, patientId: string, reason: string): Promise<void> {
  await sql`
    UPDATE clinic_crm.outbox SET status = 'skipped', last_error = ${reason}
     WHERE clinic_id = ${clinicId} AND patient_id = ${patientId} AND status = 'pending'`;
}

// ── Cron backstop ───────────────────────────────────────────────────────────

export interface EnqueueCounts {
  reminders: number;
  noShows: number;
  recalls: number;
}

/** Derives every due row from live data across all clinics. Idempotent via dedupe_key. */
export async function enqueueDue(sql: Sql): Promise<EnqueueCounts> {
  const reminders = await sql`
    INSERT INTO clinic_crm.outbox (clinic_id, patient_id, automation, due_at, dedupe_key)
    SELECT a.clinic_id, a.patient_id, 'appointment_reminder',
           greatest(now(), a.starts_at - make_interval(hours => au."offset")),
           'reminder:' || a.id::text || ':' || to_char(a.starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      FROM clinic_crm.appointments a
      JOIN clinic_crm.automations au
        ON au.clinic_id = a.clinic_id AND au.kind = 'appointment_reminder' AND au.enabled
     WHERE a.status IN ('booked', 'confirmed')
       AND a.starts_at > now() + make_interval(mins => ${OB.reminderMinLeadMinutes})
       AND a.starts_at - make_interval(hours => au."offset") <= now()
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING 1`;

  const noShows = await sql`
    INSERT INTO clinic_crm.outbox (clinic_id, patient_id, automation, due_at, dedupe_key)
    SELECT a.clinic_id, a.patient_id, 'no_show_followup',
           a.status_at + make_interval(hours => au."offset"), 'no_show:' || a.id::text
      FROM clinic_crm.appointments a
      JOIN clinic_crm.automations au
        ON au.clinic_id = a.clinic_id AND au.kind = 'no_show_followup' AND au.enabled
     WHERE a.status = 'no_show'
       AND a.status_at + make_interval(hours => au."offset") <= now()
       AND a.status_at >= now() - make_interval(days => ${OB.noShowLookbackDays})
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING 1`;

  const recalls = await sql`
    WITH last_visit AS (
      SELECT DISTINCT ON (a.clinic_id, a.patient_id) a.clinic_id, a.patient_id, a.id, a.starts_at
        FROM clinic_crm.appointments a
       WHERE a.status = 'attended'
       ORDER BY a.clinic_id, a.patient_id, a.starts_at DESC
    )
    INSERT INTO clinic_crm.outbox (clinic_id, patient_id, automation, due_at, dedupe_key)
    SELECT lv.clinic_id, lv.patient_id, 'recall', now(), 'recall:' || lv.patient_id::text || ':' || lv.id::text
      FROM last_visit lv
      JOIN clinic_crm.automations au ON au.clinic_id = lv.clinic_id AND au.kind = 'recall' AND au.enabled
      JOIN clinic_crm.patients p
        ON p.id = lv.patient_id AND p.clinic_id = lv.clinic_id
       AND p.opted_out_at IS NULL AND p.consent_at IS NOT NULL
     WHERE lv.starts_at + make_interval(days => au."offset") <= now()
       AND lv.starts_at + make_interval(days => au."offset") >= now() - make_interval(days => ${OB.recallLookbackDays})
       AND NOT EXISTS (
         SELECT 1 FROM clinic_crm.appointments f
          WHERE f.clinic_id = lv.clinic_id AND f.patient_id = lv.patient_id
            AND f.status IN ('booked', 'confirmed') AND f.starts_at > now())
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING 1`;

  return { reminders: reminders.length, noShows: noShows.length, recalls: recalls.length };
}

// ── Drain ───────────────────────────────────────────────────────────────────

interface ClaimedRow {
  id: string;
  clinic_id: string;
  patient_id: string;
  automation: AutomationKind;
  dedupe_key: string;
  attempts: number;
}

export interface DrainCounts {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  retried: number;
  released: number;
}

/**
 * Claims up to `limit` due rows. The single UPDATE … WHERE id IN (SELECT … FOR UPDATE
 * SKIP LOCKED) is its own transaction: rows another drain holds are skipped, and each
 * claimed row is leased (due_at pushed out) so no network call happens inside a
 * held transaction on the shared pooled connection.
 */
async function claim(sql: Sql, limit: number, ids?: string[]): Promise<ClaimedRow[]> {
  return sql<ClaimedRow[]>`
    UPDATE clinic_crm.outbox o
       SET attempts = o.attempts + 1, due_at = now() + make_interval(secs => ${OB.leaseSeconds})
     WHERE o.id IN (
       SELECT id FROM clinic_crm.outbox
        WHERE status = 'pending' AND due_at <= now()
          ${ids ? sql`AND id = ANY(${sql.array(ids)}::uuid[])` : sql``}
        ORDER BY due_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)
    RETURNING o.id, o.clinic_id, o.patient_id, o.automation, o.dedupe_key, o.attempts`;
}

async function finish(sql: Sql, id: string, status: OutboxStatus, reason: string | null): Promise<void> {
  await sql`UPDATE clinic_crm.outbox SET status = ${status}, last_error = ${reason} WHERE id = ${id}`;
}

async function retryOrFail(sql: Sql, row: ClaimedRow, reason: string): Promise<"retried" | "failed"> {
  if (row.attempts >= OB.maxAttempts) {
    await finish(sql, row.id, "failed", reason);
    return "failed";
  }
  const delaySec = Math.round(backoffMs(row.attempts) / 1000);
  await sql`
    UPDATE clinic_crm.outbox
       SET status = 'pending', due_at = now() + make_interval(secs => ${delaySec}), last_error = ${reason}
     WHERE id = ${row.id}`;
  return "retried";
}

interface SendContext {
  first_name: string;
  phone: string;
  preferred_channel: Channel;
  consent_at: Date | null;
  opted_out_at: Date | null;
  clinic_name: string;
  timezone: string;
  whatsapp_from: string;
  sms_from: string;
  enabled: boolean | null;
  body: string | null;
  content_sid: string | null;
  last_wa_in: Date | null;
}

type Outcome = "sent" | "skipped" | "failed" | "retried";

/** Re-validates a claimed row against live data, then sends it. Never throws. */
async function processRow(sql: Sql, row: ClaimedRow, now: Date): Promise<Outcome> {
  const skip = async (reason: string): Promise<Outcome> => {
    await finish(sql, row.id, "skipped", reason);
    return "skipped";
  };
  try {
    const key = parseDedupeKey(row.dedupe_key);
    if (!key || key.kind !== row.automation) return skip("bad_key");

    const [ctx] = await sql<SendContext[]>`
      SELECT p.first_name, p.phone, p.preferred_channel, p.consent_at, p.opted_out_at,
             c.name AS clinic_name, c.timezone, c.whatsapp_from, c.sms_from,
             au.enabled, au.body, au.content_sid,
             (SELECT max(m.created_at) FROM clinic_crm.messages m
               WHERE m.clinic_id = p.clinic_id AND m.patient_id = p.id
                 AND m.direction = 'in' AND m.channel = 'whatsapp') AS last_wa_in
        FROM clinic_crm.patients p
        JOIN clinic_crm.clinics c ON c.id = p.clinic_id
        LEFT JOIN clinic_crm.automations au ON au.clinic_id = p.clinic_id AND au.kind = ${row.automation}
       WHERE p.clinic_id = ${row.clinic_id} AND p.id = ${row.patient_id}`;
    if (!ctx) return skip("patient_missing");
    if (!ctx.enabled || !ctx.body) return skip("automation_disabled");
    // POPIA: business-initiated messages need recorded consent; the lead ack is a reply to them.
    if (row.automation !== "new_lead_ack" && !ctx.consent_at) return skip("no_consent");

    const vars: TemplateVars = { firstName: greetingName(ctx.first_name), clinicName: ctx.clinic_name, time: "" };

    if (key.kind === "appointment_reminder" || key.kind === "no_show_followup") {
      const [appt] = await sql<{ starts_at: Date; status: string }[]>`
        SELECT starts_at, status FROM clinic_crm.appointments
         WHERE clinic_id = ${row.clinic_id} AND id = ${key.appointmentId}`;
      if (!appt) return skip("stale");
      if (key.kind === "appointment_reminder") {
        const current = (appt.status === "booked" || appt.status === "confirmed") && iso(appt.starts_at) === key.startsAt;
        if (!current || appt.starts_at <= now) return skip("stale");
      } else if (appt.status !== "no_show") {
        return skip("stale");
      }
      vars.time = formatAppointmentTime(appt.starts_at, ctx.timezone);
    } else if (key.kind === "recall") {
      const [rebooked] = await sql`
        SELECT 1 FROM clinic_crm.appointments
         WHERE clinic_id = ${row.clinic_id} AND patient_id = ${row.patient_id}
           AND status IN ('booked', 'confirmed') AND starts_at > now() LIMIT 1`;
      if (rebooked) return skip("rebooked");
    }

    const decision = decideChannel({
      requested: ctx.preferred_channel,
      optedOut: !!ctx.opted_out_at,
      whatsappFrom: ctx.whatsapp_from,
      smsFrom: ctx.sms_from,
      windowOpen: windowOpen(ctx.last_wa_in, now),
      contentSid: ctx.content_sid ?? "",
      allowFallback: true,
    });
    if (!decision.ok) return skip(decision.reason);

    const body = renderTemplate(ctx.body, vars);
    let sent: { sid: string; status: string };
    try {
      sent = await sendMessage({
        channel: decision.channel,
        from: decision.from,
        to: ctx.phone,
        body: decision.contentSid ? undefined : body,
        contentSid: decision.contentSid,
        contentVariables: decision.contentSid ? contentVariables(vars) : undefined,
        statusCallback: statusCallbackUrl(),
      });
    } catch (e) {
      if (!(e instanceof TwilioError)) throw e;
      const reason = `twilio:${e.code ?? e.reason}`;
      if (e.reason === "unsubscribed") {
        await setOptedOut(sql, row.clinic_id, row.patient_id, true);
        await finish(sql, row.id, "failed", reason);
        return "failed";
      }
      if (!e.retryable) {
        await finish(sql, row.id, "failed", reason);
        return "failed";
      }
      return retryOrFail(sql, row, reason);
    }

    await finish(sql, row.id, "sent", null);
    await recordOutbound(sql, {
      clinicId: row.clinic_id,
      patientId: row.patient_id,
      channel: decision.channel,
      body,
      status: sent.status,
      twilioSid: sent.sid,
      automation: row.automation,
      sentBy: null,
    }).catch((e) => console.error("[clinic-crm] outbox: message record failed", (e as { code?: string }).code ?? "error"));
    return "sent";
  } catch (e) {
    console.error("[clinic-crm] outbox: row error", row.id, (e as { code?: string }).code ?? (e as Error).name);
    try {
      return await retryOrFail(sql, row, "internal");
    } catch {
      return "retried"; // lease expiry will make it due again
    }
  }
}

/**
 * Drains due rows until none are left or the time budget is spent. Rows claimed but
 * not reached before the deadline are released (attempt refunded, due immediately).
 */
export async function drainOutbox(
  sql: Sql,
  opts: { limit?: number; budgetMs?: number; ids?: string[]; now?: () => Date } = {},
): Promise<DrainCounts> {
  const limit = opts.limit ?? OB.batchSize;
  const deadline = Date.now() + (opts.budgetMs ?? OB.drainBudgetMs);
  const clock = opts.now ?? (() => new Date());
  const counts: DrainCounts = { claimed: 0, sent: 0, skipped: 0, failed: 0, retried: 0, released: 0 };

  while (Date.now() < deadline) {
    const rows = await claim(sql, limit, opts.ids);
    if (rows.length === 0) break;
    counts.claimed += rows.length;
    for (let i = 0; i < rows.length; i++) {
      if (Date.now() >= deadline) {
        const rest = rows.slice(i).map((r) => r.id);
        await sql`
          UPDATE clinic_crm.outbox SET attempts = greatest(attempts - 1, 0), due_at = now()
           WHERE id = ANY(${sql.array(rest)}::uuid[]) AND status = 'pending'`;
        counts.released += rest.length;
        return counts;
      }
      counts[await processRow(sql, rows[i], clock())]++;
    }
    if (opts.ids || rows.length < limit) break;
  }
  return counts;
}
