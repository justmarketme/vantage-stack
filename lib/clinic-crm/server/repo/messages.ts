import type { Sql } from "postgres";
import type { AutomationKind, Channel, Conversation, Message } from "../../types";
import { CRM_CONFIG } from "../config";
import { iso, statusesBelow } from "../rules";

export interface MessageRow {
  id: string;
  patient_id: string;
  direction: "in" | "out";
  channel: Channel;
  body: string;
  status: string;
  created_at: Date;
  automation: AutomationKind | null;
}

export function toMessage(r: MessageRow): Message {
  return {
    id: r.id,
    patientId: r.patient_id,
    direction: r.direction,
    channel: r.channel,
    body: r.body,
    status: r.status,
    createdAt: iso(r.created_at),
    automation: r.automation,
  };
}

const WINDOW_HOURS = CRM_CONFIG.whatsapp.serviceWindowHours;

export async function listConversations(sql: Sql, clinicId: string): Promise<Conversation[]> {
  const rows = await sql<
    { patient_id: string; patient_name: string; body: string; created_at: Date; unread: number; window_open: boolean }[]
  >`
    WITH last AS (
      SELECT DISTINCT ON (patient_id) patient_id, body, created_at
        FROM clinic_crm.messages WHERE clinic_id = ${clinicId}
       ORDER BY patient_id, created_at DESC
    ), unread AS (
      SELECT patient_id, count(*)::int AS n FROM clinic_crm.messages
       WHERE clinic_id = ${clinicId} AND direction = 'in' AND read_at IS NULL GROUP BY patient_id
    ), wa AS (
      SELECT patient_id, max(created_at) AS at FROM clinic_crm.messages
       WHERE clinic_id = ${clinicId} AND direction = 'in' AND channel = 'whatsapp' GROUP BY patient_id
    )
    SELECT l.patient_id, trim(p.first_name || ' ' || p.last_name) AS patient_name, l.body, l.created_at,
           coalesce(u.n, 0) AS unread,
           coalesce(wa.at > now() - make_interval(hours => ${WINDOW_HOURS}), false) AS window_open
      FROM last l
      JOIN clinic_crm.patients p ON p.id = l.patient_id AND p.clinic_id = ${clinicId}
      LEFT JOIN unread u ON u.patient_id = l.patient_id
      LEFT JOIN wa ON wa.patient_id = l.patient_id
     ORDER BY l.created_at DESC
     LIMIT ${CRM_CONFIG.api.maxConversations}`;
  return rows.map((r) => ({
    patientId: r.patient_id,
    patientName: r.patient_name,
    lastMessage: r.body,
    lastAt: iso(r.created_at),
    unread: r.unread,
    windowOpen: r.window_open,
  }));
}

/** The thread, oldest first (latest N), marking inbound messages read. Null if the patient isn't in this clinic. */
export async function readThread(sql: Sql, clinicId: string, patientId: string): Promise<Message[] | null> {
  const [exists] = await sql`SELECT 1 FROM clinic_crm.patients WHERE clinic_id = ${clinicId} AND id = ${patientId}`;
  if (!exists) return null;
  const rows = await sql<MessageRow[]>`
    SELECT * FROM (
      SELECT id, patient_id, direction, channel, body, status, created_at, automation
        FROM clinic_crm.messages WHERE clinic_id = ${clinicId} AND patient_id = ${patientId}
       ORDER BY created_at DESC LIMIT ${CRM_CONFIG.api.maxThreadMessages}
    ) t ORDER BY created_at`;
  await sql`
    UPDATE clinic_crm.messages SET read_at = now()
     WHERE clinic_id = ${clinicId} AND patient_id = ${patientId} AND direction = 'in' AND read_at IS NULL`;
  return rows.map(toMessage);
}

export async function lastInboundWhatsapp(sql: Sql, clinicId: string, patientId: string): Promise<Date | null> {
  const [r] = await sql<{ at: Date | null }[]>`
    SELECT max(created_at) AS at FROM clinic_crm.messages
     WHERE clinic_id = ${clinicId} AND patient_id = ${patientId} AND direction = 'in' AND channel = 'whatsapp'`;
  return r?.at ?? null;
}

export async function recordOutbound(
  sql: Sql,
  m: {
    clinicId: string;
    patientId: string;
    channel: Channel;
    body: string;
    status: string;
    twilioSid: string;
    automation: AutomationKind | null;
    sentBy: string | null;
  },
): Promise<Message> {
  const [r] = await sql<MessageRow[]>`
    INSERT INTO clinic_crm.messages (clinic_id, patient_id, direction, channel, body, status, twilio_sid, automation, sent_by)
    VALUES (${m.clinicId}, ${m.patientId}, 'out', ${m.channel}, ${m.body}, ${m.status}, ${m.twilioSid},
            ${m.automation}, ${m.sentBy})
    ON CONFLICT (twilio_sid) DO UPDATE SET twilio_sid = EXCLUDED.twilio_sid
    RETURNING id, patient_id, direction, channel, body, status, created_at, automation`;
  return toMessage(r);
}

/** Idempotent by MessageSid: returns null when Twilio retried a webhook we already stored. */
export async function recordInbound(
  sql: Sql,
  m: { clinicId: string; patientId: string; channel: Channel; body: string; twilioSid: string },
): Promise<{ id: string } | null> {
  const [r] = await sql<{ id: string }[]>`
    INSERT INTO clinic_crm.messages (clinic_id, patient_id, direction, channel, body, status, twilio_sid)
    VALUES (${m.clinicId}, ${m.patientId}, 'in', ${m.channel}, ${m.body}, 'received', ${m.twilioSid})
    ON CONFLICT (twilio_sid) DO NOTHING
    RETURNING id`;
  return r ?? null;
}

export async function inboundCount(sql: Sql, clinicId: string, patientId: string): Promise<number> {
  const [r] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM clinic_crm.messages
     WHERE clinic_id = ${clinicId} AND patient_id = ${patientId} AND direction = 'in'`;
  return r?.n ?? 0;
}

/**
 * Status callback: moves a message forward only (race-safe — the guard is in the WHERE clause,
 * so concurrent/out-of-order callbacks can't regress it). Returns the row when it changed.
 */
export async function applyDeliveryStatus(
  sql: Sql,
  twilioSid: string,
  status: string,
  errorCode: string | null,
): Promise<{ clinic_id: string; patient_id: string } | null> {
  const below = statusesBelow(status);
  if (below.length === 0) return null;
  const [r] = await sql<{ clinic_id: string; patient_id: string }[]>`
    UPDATE clinic_crm.messages
       SET status = ${status}, error_code = coalesce(${errorCode}, error_code)
     WHERE twilio_sid = ${twilioSid} AND direction = 'out' AND status = ANY(${sql.array(below)})
    RETURNING clinic_id, patient_id`;
  return r ?? null;
}
