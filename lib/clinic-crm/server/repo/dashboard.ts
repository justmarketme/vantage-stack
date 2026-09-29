import type { Sql } from "postgres";
import type { Dashboard } from "../../types";
import { CRM_CONFIG } from "../config";
import { toAppointment, type AppointmentRow } from "./appointments";

const DAYS = CRM_CONFIG.metrics.windowDays;

/**
 * Speed-to-lead: for each contact whose FIRST EVER inbound landed in the window,
 * minutes until the first outbound after it (human or automated). Median across
 * contacts that got a reply. Pure SQL so it scales with the table, not the process.
 */
export async function speedToLeadMinutes(sql: Sql, clinicId: string): Promise<number | null> {
  const [r] = await sql<{ median: number | null }[]>`
    WITH first_in AS (
      SELECT patient_id, min(created_at) AS at
        FROM clinic_crm.messages
       WHERE clinic_id = ${clinicId} AND direction = 'in'
       GROUP BY patient_id
    ), replied AS (
      SELECT f.at,
             (SELECT min(m.created_at) FROM clinic_crm.messages m
               WHERE m.clinic_id = ${clinicId} AND m.patient_id = f.patient_id
                 AND m.direction = 'out' AND m.created_at > f.at) AS reply_at
        FROM first_in f
       WHERE f.at >= now() - make_interval(days => ${DAYS})
    )
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM reply_at - at) / 60.0)::float8 AS median
      FROM replied WHERE reply_at IS NOT NULL`;
  return r?.median === null || r?.median === undefined ? null : Math.round(r.median * 10) / 10;
}

export async function getDashboard(sql: Sql, clinicId: string): Promise<Dashboard> {
  const [today, counts, speed] = await Promise.all([
    sql<AppointmentRow[]>`
      WITH tz AS (SELECT timezone AS z FROM clinic_crm.clinics WHERE id = ${clinicId}),
           day AS (SELECT (date_trunc('day', now() AT TIME ZONE tz.z) AT TIME ZONE tz.z) AS s FROM tz)
      SELECT a.id, a.patient_id, trim(p.first_name || ' ' || p.last_name) AS patient_name, a.starts_at,
             a.duration_min, a.practitioner, a.service, a.status
        FROM clinic_crm.appointments a
        JOIN clinic_crm.patients p ON p.id = a.patient_id AND p.clinic_id = a.clinic_id, day
       WHERE a.clinic_id = ${clinicId} AND a.starts_at >= day.s AND a.starts_at < day.s + interval '1 day'
       ORDER BY a.starts_at`,
    sql<{ unread: number; no_show: number; attended: number; reminders: number; open_leads: number }[]>`
      SELECT
        (SELECT count(DISTINCT patient_id)::int FROM clinic_crm.messages
          WHERE clinic_id = ${clinicId} AND direction = 'in' AND read_at IS NULL) AS unread,
        (SELECT count(*)::int FROM clinic_crm.appointments
          WHERE clinic_id = ${clinicId} AND status = 'no_show'
            AND starts_at >= now() - make_interval(days => ${DAYS}) AND starts_at < now()) AS no_show,
        (SELECT count(*)::int FROM clinic_crm.appointments
          WHERE clinic_id = ${clinicId} AND status = 'attended'
            AND starts_at >= now() - make_interval(days => ${DAYS}) AND starts_at < now()) AS attended,
        (SELECT count(*)::int FROM clinic_crm.messages
          WHERE clinic_id = ${clinicId} AND direction = 'out' AND automation = 'appointment_reminder'
            AND status NOT IN ('failed', 'undelivered', 'canceled')
            AND created_at >= now() - make_interval(days => ${DAYS})) AS reminders,
        (SELECT count(*)::int FROM clinic_crm.patients
          WHERE clinic_id = ${clinicId} AND lead_stage IN ('new', 'contacted')) AS open_leads`,
    speedToLeadMinutes(sql, clinicId),
  ]);
  const c = counts[0];
  const denom = c.no_show + c.attended;
  return {
    today: today.map(toAppointment),
    unreadConversations: c.unread,
    speedToLeadMin: speed,
    noShowRate: denom === 0 ? null : c.no_show / denom,
    remindersSent30d: c.reminders,
    openLeads: c.open_leads,
  };
}
