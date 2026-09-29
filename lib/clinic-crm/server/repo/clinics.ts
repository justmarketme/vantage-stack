import type { Sql } from "postgres";
import type { Channel } from "../../types";

export interface ClinicRow {
  id: string;
  name: string;
  timezone: string;
  whatsapp_from: string;
  sms_from: string;
}

export async function getClinic(sql: Sql, clinicId: string): Promise<ClinicRow | null> {
  const [r] = await sql<ClinicRow[]>`
    SELECT id, name, timezone, whatsapp_from, sms_from FROM clinic_crm.clinics WHERE id = ${clinicId}`;
  return r ?? null;
}

/**
 * Webhook tenancy: the clinic is whoever owns the Twilio number the message was sent TO.
 * Returns null unless exactly one clinic matches (a shared number is a misconfiguration,
 * and guessing would leak one practice's patients into another's inbox).
 */
export async function clinicByNumber(sql: Sql, channel: Channel, e164: string): Promise<ClinicRow | null> {
  const rows =
    channel === "whatsapp"
      ? await sql<ClinicRow[]>`
          SELECT id, name, timezone, whatsapp_from, sms_from FROM clinic_crm.clinics
           WHERE lower(whatsapp_from) IN (${"whatsapp:" + e164}, ${e164}) LIMIT 2`
      : await sql<ClinicRow[]>`
          SELECT id, name, timezone, whatsapp_from, sms_from FROM clinic_crm.clinics
           WHERE sms_from = ${e164} LIMIT 2`;
  return rows.length === 1 ? rows[0] : null;
}
