import type { Sql } from "postgres";
import { upsertClinicLeadFromEnquiry } from "../consultant/server/clinicLeads";
import { errorTag } from "../consultant/server/http";
import type { ClinicBlueprint } from "./schema";

/**
 * The clinic funnel owns its own table rather than sharing `clients` with the
 * general intake. Its questions do not map onto that schema, and forcing them
 * in would mean either lossy columns or widening a table three other surfaces
 * already read. A separate table also keeps clinic lead data easy to scope and
 * delete on request, which POPIA makes a practical concern rather than a
 * theoretical one.
 *
 * DDL is idempotent and runs on first write so the funnel is reproducible from
 * a clean database with no out-of-band migration step.
 */
export async function ensureClinicBlueprintTable(db: Sql): Promise<void> {
  await db`
    CREATE TABLE IF NOT EXISTS clinic_blueprints (
      id                      bigserial PRIMARY KEY,
      created_at              timestamptz NOT NULL DEFAULT now(),

      practice_name           text        NOT NULL,
      clinic_type             text        NOT NULL,
      clinic_type_other       text        NOT NULL DEFAULT '',
      locations               integer     NOT NULL,
      practitioners           integer     NOT NULL,

      enquiry_volume          text        NOT NULL,
      response_speed          text        NOT NULL,
      after_hours             text        NOT NULL,
      recall_handling         text        NOT NULL,

      avg_appointment_value   numeric     NOT NULL,
      no_show_rate            numeric     NOT NULL,
      timeline                text        NOT NULL,
      roi_snapshot            jsonb,

      contact_name            text        NOT NULL,
      role                    text        NOT NULL DEFAULT '',
      email                   text        NOT NULL,
      whatsapp                text        NOT NULL,
      website_url             text        NOT NULL DEFAULT '',
      consent                 boolean     NOT NULL DEFAULT false,

      source                  text        NOT NULL DEFAULT 'clinics_landing'
    )
  `;

  // Lookup by email is how a returning enquiry gets matched to an existing
  // record; without this it degrades to a sequential scan as the table grows.
  await db`
    CREATE INDEX IF NOT EXISTS clinic_blueprints_email_idx
      ON clinic_blueprints (email)
  `;
}

export async function insertClinicBlueprint(
  db: Sql,
  payload: ClinicBlueprint,
  opts: { source?: string } = {},
): Promise<{ id: number }> {
  await ensureClinicBlueprintTable(db);

  const rows = await db<{ id: number }[]>`
    INSERT INTO clinic_blueprints (
      practice_name, clinic_type, clinic_type_other, locations, practitioners,
      enquiry_volume, response_speed, after_hours, recall_handling,
      avg_appointment_value, no_show_rate, timeline, roi_snapshot,
      contact_name, role, email, whatsapp, website_url, consent, source
    ) VALUES (
      ${payload.practiceName},
      ${payload.clinicType},
      ${payload.clinicTypeOther},
      ${payload.locations},
      ${payload.practitioners},
      ${payload.enquiryVolume},
      ${payload.responseSpeed},
      ${payload.afterHours},
      ${payload.recallHandling},
      ${payload.avgAppointmentValue},
      ${payload.noShowRate},
      ${payload.timeline},
      ${db.json((payload.roiSnapshot ?? null) as never)},
      ${payload.contactName},
      ${payload.role},
      ${payload.email},
      ${payload.whatsapp},
      ${payload.websiteUrl},
      ${payload.consent},
      ${opts.source ?? "clinics_landing"}
    )
    RETURNING id
  `;

  const id = rows[0].id;
  await feedClinicLeadToCrm(db, payload, id, opts.source ?? "clinics_landing");
  return { id };
}

/**
 * Every landing-page enquiry also becomes an UNASSIGNED Clinics lead in the VantageStack CRM
 * (`public.clients`, `vertical = 'clinics'`) so consultants can claim it from the pool.
 * Best-effort by design: the enquiry is already saved above, so a CRM failure is logged
 * (error class only — no contact details) and never fails the landing form.
 */
async function feedClinicLeadToCrm(db: Sql, payload: ClinicBlueprint, blueprintId: number, source: string): Promise<void> {
  try {
    const result = await upsertClinicLeadFromEnquiry(db, {
      practiceName: payload.practiceName,
      contactName: payload.contactName,
      role: payload.role,
      email: payload.email,
      whatsapp: payload.whatsapp,
      websiteUrl: payload.websiteUrl,
      source,
      blueprintId,
    });
    if (result.outcome !== "created" && result.outcome !== "exists") {
      console.warn("[clinics/blueprint] CRM lead not created", result.outcome);
    }
  } catch (err) {
    console.error("[clinics/blueprint] CRM lead feed failed", errorTag(err));
  }
}
