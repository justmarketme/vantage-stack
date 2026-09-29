import type { Sql } from "postgres";
import type { z } from "zod";
import type { Channel, LeadStage, Message, Patient, PatientInput, PatientPatch, Appointment } from "../../types";
import { CRM_CONFIG } from "../config";
import { iso, likePattern, phoneSearchDigits } from "../rules";
import { toAppointment, type AppointmentRow } from "./appointments";
import { toMessage, type MessageRow } from "./messages";

export interface PatientRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  preferred_channel: Channel;
  consent_at: Date | null;
  lead_stage: LeadStage | null;
  opted_out_at: Date | null;
  notes: string;
  tags: string[];
  created_at: Date;
}

export function toPatient(r: PatientRow): Patient {
  return {
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    phone: r.phone,
    email: r.email,
    preferredChannel: r.preferred_channel,
    consentAt: iso(r.consent_at),
    leadStage: r.lead_stage,
    optedOutAt: iso(r.opted_out_at),
    notes: r.notes,
    tags: r.tags ?? [],
    createdAt: iso(r.created_at),
  };
}

/** GET patients?q= matches NAME fragments only — phone/email search goes via POST patients/search (no PII in URLs). */
export async function listPatients(sql: Sql, clinicId: string, opts: { q?: string; leadsOnly?: boolean }): Promise<Patient[]> {
  const q = (opts.q ?? "").trim().slice(0, 80);
  const pattern = likePattern(q);
  const rows = await sql<PatientRow[]>`
    SELECT id, first_name, last_name, phone, email, preferred_channel, consent_at, lead_stage,
           opted_out_at, notes, tags, created_at
      FROM clinic_crm.patients
     WHERE clinic_id = ${clinicId}
       ${opts.leadsOnly ? sql`AND lead_stage IS NOT NULL` : sql``}
       ${q ? sql`AND (first_name ILIKE ${pattern} OR last_name ILIKE ${pattern}
                      OR (first_name || ' ' || last_name) ILIKE ${pattern})` : sql``}
     ORDER BY created_at DESC
     LIMIT ${CRM_CONFIG.api.maxPatients}`;
  return rows.map(toPatient);
}

/** POST patients/search: name/email ILIKE, or phone by digit suffix (so any local/intl format matches). */
export async function searchPatients(sql: Sql, clinicId: string, q: string): Promise<Patient[]> {
  const pattern = likePattern(q.trim());
  const digits = phoneSearchDigits(q);
  const rows = await sql<PatientRow[]>`
    SELECT id, first_name, last_name, phone, email, preferred_channel, consent_at, lead_stage,
           opted_out_at, notes, tags, created_at
      FROM clinic_crm.patients
     WHERE clinic_id = ${clinicId}
       AND (first_name ILIKE ${pattern} OR last_name ILIKE ${pattern}
            OR (first_name || ' ' || last_name) ILIKE ${pattern} OR email ILIKE ${pattern}
            ${digits ? sql`OR regexp_replace(phone, '[^0-9]', '', 'g') LIKE ${"%" + digits}` : sql``})
     ORDER BY created_at DESC
     LIMIT ${CRM_CONFIG.api.maxSearchResults}`;
  return rows.map(toPatient);
}

export async function getPatient(sql: Sql, clinicId: string, id: string): Promise<Patient | null> {
  const [r] = await sql<PatientRow[]>`
    SELECT id, first_name, last_name, phone, email, preferred_channel, consent_at, lead_stage,
           opted_out_at, notes, tags, created_at
      FROM clinic_crm.patients WHERE clinic_id = ${clinicId} AND id = ${id}`;
  return r ? toPatient(r) : null;
}

/** Unique (clinic_id, phone) violations surface as this so routes can answer 409 with a field error. */
export class DuplicatePhoneError extends Error {
  constructor() {
    super("duplicate phone");
  }
}

function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string })?.code === "23505";
}

export async function createPatient(sql: Sql, clinicId: string, staffId: string, input: z.infer<typeof PatientInput>): Promise<Patient> {
  try {
    const [r] = await sql<PatientRow[]>`
      INSERT INTO clinic_crm.patients
        (clinic_id, first_name, last_name, phone, email, preferred_channel, consent_at, consent_by, notes, tags)
      VALUES (${clinicId}, ${input.firstName}, ${input.lastName}, ${input.phone}, ${input.email ?? ""},
              ${input.preferredChannel}, now(), ${staffId}, ${input.notes}, ${sql.array(input.tags)})
      RETURNING id, first_name, last_name, phone, email, preferred_channel, consent_at, lead_stage,
                opted_out_at, notes, tags, created_at`;
    return toPatient(r);
  } catch (e) {
    if (isUniqueViolation(e)) throw new DuplicatePhoneError();
    throw e;
  }
}

export async function updatePatient(
  sql: Sql,
  clinicId: string,
  staffId: string,
  id: string,
  patch: z.infer<typeof PatientPatch>,
): Promise<Patient | null> {
  const set: Record<string, unknown> = {};
  if (patch.firstName !== undefined) set.first_name = patch.firstName;
  if (patch.lastName !== undefined) set.last_name = patch.lastName;
  if (patch.phone !== undefined) set.phone = patch.phone;
  if (patch.email !== undefined) set.email = patch.email ?? "";
  if (patch.preferredChannel !== undefined) set.preferred_channel = patch.preferredChannel;
  if (patch.notes !== undefined) set.notes = patch.notes;
  if (patch.leadStage !== undefined) set.lead_stage = patch.leadStage;
  if (patch.consent === true) {
    set.consent_at = new Date();
    set.consent_by = staffId;
  }
  const keys = Object.keys(set);
  if (keys.length === 0 && patch.tags === undefined) return getPatient(sql, clinicId, id);
  set.updated_at = new Date();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [r] = await sql<PatientRow[]>`
      UPDATE clinic_crm.patients
         SET ${sql(set as any, ...Object.keys(set))}
             ${patch.tags !== undefined ? sql`, tags = ${sql.array(patch.tags)}` : sql``}
       WHERE clinic_id = ${clinicId} AND id = ${id}
      RETURNING id, first_name, last_name, phone, email, preferred_channel, consent_at, lead_stage,
                opted_out_at, notes, tags, created_at`;
    return r ? toPatient(r) : null;
  } catch (e) {
    if (isUniqueViolation(e)) throw new DuplicatePhoneError();
    throw e;
  }
}

/** POPIA erasure: hard delete; appointments, messages and outbox rows cascade. */
export async function deletePatient(sql: Sql, clinicId: string, id: string): Promise<boolean> {
  const rows = await sql`DELETE FROM clinic_crm.patients WHERE clinic_id = ${clinicId} AND id = ${id} RETURNING id`;
  if (rows.length === 0) return false;
  // Unsent message drafts (continuity key `draft:<patientId>`) hold the patient's conversation
  // text and are not FK-linked, so they don't cascade — erase them explicitly.
  await sql`
    DELETE FROM clinic_crm.staff_state
     WHERE key = ${"draft:" + id}
       AND staff_id IN (SELECT id FROM clinic_crm.staff WHERE clinic_id = ${clinicId})`;
  return true;
}

export interface PatientExport {
  exportedAt: string;
  patient: Patient & { consentBy: string | null };
  appointments: Appointment[];
  messages: Message[];
  scheduledMessages: { automation: string; dueAt: string; status: string }[];
}

/** POPIA s.23 access request: everything held on one patient. */
export async function exportPatient(sql: Sql, clinicId: string, id: string): Promise<PatientExport | null> {
  const [p] = await sql<(PatientRow & { consent_by: string | null })[]>`
    SELECT id, first_name, last_name, phone, email, preferred_channel, consent_at, consent_by, lead_stage,
           opted_out_at, notes, tags, created_at
      FROM clinic_crm.patients WHERE clinic_id = ${clinicId} AND id = ${id}`;
  if (!p) return null;
  const [appts, msgs, outbox] = await Promise.all([
    sql<AppointmentRow[]>`
      SELECT a.id, a.patient_id, trim(p.first_name || ' ' || p.last_name) AS patient_name, a.starts_at,
             a.duration_min, a.practitioner, a.service, a.status
        FROM clinic_crm.appointments a JOIN clinic_crm.patients p ON p.id = a.patient_id
       WHERE a.clinic_id = ${clinicId} AND a.patient_id = ${id}
       ORDER BY a.starts_at`,
    sql<MessageRow[]>`
      SELECT id, patient_id, direction, channel, body, status, created_at, automation
        FROM clinic_crm.messages WHERE clinic_id = ${clinicId} AND patient_id = ${id}
       ORDER BY created_at`,
    sql<{ automation: string; due_at: Date; status: string }[]>`
      SELECT automation, due_at, status FROM clinic_crm.outbox
       WHERE clinic_id = ${clinicId} AND patient_id = ${id} ORDER BY due_at`,
  ]);
  return {
    exportedAt: new Date().toISOString(),
    patient: { ...toPatient(p), consentBy: p.consent_by },
    appointments: appts.map(toAppointment),
    messages: msgs.map(toMessage),
    scheduledMessages: outbox.map((o) => ({ automation: o.automation, dueAt: iso(o.due_at), status: o.status })),
  };
}

// ── Used by the inbound webhook (clinic resolved from the Twilio `To` number) ──

export interface InboundContact {
  id: string;
  firstName: string;
  optedOutAt: Date | null;
  created: boolean;
}

/** Finds the contact by (clinic, phone) or creates them as a new lead without consent. */
export async function upsertInboundContact(
  sql: Sql,
  clinicId: string,
  phone: string,
  profileName: string,
  channel: Channel,
): Promise<InboundContact> {
  const name = profileName.trim().slice(0, 80) || CRM_CONFIG.inbound.unknownContactName;
  const [r] = await sql<{ id: string; first_name: string; opted_out_at: Date | null; created: boolean }[]>`
    INSERT INTO clinic_crm.patients (clinic_id, first_name, phone, preferred_channel, lead_stage)
    VALUES (${clinicId}, ${name}, ${phone}, ${channel}, 'new')
    ON CONFLICT (clinic_id, phone) DO UPDATE SET clinic_id = EXCLUDED.clinic_id
    RETURNING id, first_name, opted_out_at, (xmax = 0) AS created`;
  return { id: r.id, firstName: r.first_name, optedOutAt: r.opted_out_at, created: r.created };
}

export async function setOptedOut(sql: Sql, clinicId: string, patientId: string, optedOut: boolean): Promise<void> {
  await sql`
    UPDATE clinic_crm.patients
       SET opted_out_at = ${optedOut ? sql`coalesce(opted_out_at, now())` : sql`NULL`}, updated_at = now()
     WHERE clinic_id = ${clinicId} AND id = ${patientId}`;
}
