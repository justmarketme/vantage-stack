import type { Sql } from "postgres";
import type { z } from "zod";
import type { Appointment, AppointmentInput, AppointmentPatch, AppointmentStatus } from "../../types";
import { iso } from "../rules";

export interface AppointmentRow {
  id: string;
  patient_id: string;
  patient_name: string;
  starts_at: Date;
  duration_min: number;
  practitioner: string;
  service: string;
  status: AppointmentStatus;
}

export function toAppointment(r: AppointmentRow): Appointment {
  return {
    id: r.id,
    patientId: r.patient_id,
    patientName: r.patient_name,
    startsAt: iso(r.starts_at),
    durationMin: r.duration_min,
    practitioner: r.practitioner,
    service: r.service,
    status: r.status,
  };
}

export async function listAppointments(sql: Sql, clinicId: string, from: Date, to: Date): Promise<Appointment[]> {
  const rows = await sql<AppointmentRow[]>`
    SELECT a.id, a.patient_id, trim(p.first_name || ' ' || p.last_name) AS patient_name, a.starts_at,
           a.duration_min, a.practitioner, a.service, a.status
      FROM clinic_crm.appointments a
      JOIN clinic_crm.patients p ON p.id = a.patient_id AND p.clinic_id = a.clinic_id
     WHERE a.clinic_id = ${clinicId} AND a.starts_at >= ${from} AND a.starts_at < ${to}
     ORDER BY a.starts_at`;
  return rows.map(toAppointment);
}

export async function getAppointment(sql: Sql, clinicId: string, id: string): Promise<Appointment | null> {
  const [r] = await sql<AppointmentRow[]>`
    SELECT a.id, a.patient_id, trim(p.first_name || ' ' || p.last_name) AS patient_name, a.starts_at,
           a.duration_min, a.practitioner, a.service, a.status
      FROM clinic_crm.appointments a
      JOIN clinic_crm.patients p ON p.id = a.patient_id AND p.clinic_id = a.clinic_id
     WHERE a.clinic_id = ${clinicId} AND a.id = ${id}`;
  return r ? toAppointment(r) : null;
}

/** Returns null when the patient isn't in this clinic (tenancy: never trust the body's patientId). */
export async function createAppointment(
  sql: Sql,
  clinicId: string,
  input: z.infer<typeof AppointmentInput>,
): Promise<Appointment | null> {
  const [r] = await sql<AppointmentRow[]>`
    WITH ins AS (
      INSERT INTO clinic_crm.appointments (clinic_id, patient_id, starts_at, duration_min, practitioner, service)
      SELECT ${clinicId}, p.id, ${new Date(input.startsAt)}, ${input.durationMin}, ${input.practitioner}, ${input.service}
        FROM clinic_crm.patients p WHERE p.clinic_id = ${clinicId} AND p.id = ${input.patientId}
      RETURNING *
    )
    SELECT ins.id, ins.patient_id, trim(p.first_name || ' ' || p.last_name) AS patient_name, ins.starts_at,
           ins.duration_min, ins.practitioner, ins.service, ins.status
      FROM ins JOIN clinic_crm.patients p ON p.id = ins.patient_id`;
  if (!r) return null;
  // An enquiry that books has progressed; registered patients (lead_stage NULL) are untouched.
  await sql`
    UPDATE clinic_crm.patients SET lead_stage = 'booked', updated_at = now()
     WHERE clinic_id = ${clinicId} AND id = ${input.patientId} AND lead_stage IN ('new', 'contacted')`;
  return toAppointment(r);
}

export interface AppointmentUpdate {
  before: Appointment;
  after: Appointment;
}

export async function updateAppointment(
  sql: Sql,
  clinicId: string,
  id: string,
  patch: z.infer<typeof AppointmentPatch>,
): Promise<AppointmentUpdate | null> {
  const before = await getAppointment(sql, clinicId, id);
  if (!before) return null;
  const set: Record<string, unknown> = {};
  if (patch.startsAt !== undefined) set.starts_at = new Date(patch.startsAt);
  if (patch.durationMin !== undefined) set.duration_min = patch.durationMin;
  if (patch.practitioner !== undefined) set.practitioner = patch.practitioner;
  if (patch.service !== undefined) set.service = patch.service;
  if (patch.status !== undefined && patch.status !== before.status) {
    set.status = patch.status;
    set.status_at = new Date();
  }
  if (Object.keys(set).length === 0) return { before, after: before };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await sql`UPDATE clinic_crm.appointments SET ${sql(set as any, ...Object.keys(set))}
             WHERE clinic_id = ${clinicId} AND id = ${id}`;
  const after = await getAppointment(sql, clinicId, id);
  return after ? { before, after } : null;
}
