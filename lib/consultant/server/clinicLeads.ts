import type { Sql } from "postgres";
import { consultantConfig } from "../config";
import { CLINICS_VERTICAL, normalizeE164, type LeadSource } from "../types";
import { CRM_FEED } from "./constants";
import { logActivity } from "./crmFeed";
import { txSql } from "./http";
import { clientIdByEmail, lockPhone, placeholderEmail } from "./repo/leads";

/**
 * `clients.lead_source` for every landing-page enquiry (an INBOUND source: the clinic contacted
 * us through the form). The form's own campaign/source tag is kept in `created_by` and the
 * activity log.
 */
export const LANDING_PAGE_SOURCE: LeadSource = "landing_page";

/** What a clinic landing-page enquiry contributes to an unassigned Clinics lead. */
export type ClinicEnquiry = {
  practiceName: string;
  contactName: string;
  role: string;
  email: string;
  whatsapp: string;
  websiteUrl: string;
  source: string;
  blueprintId: number;
};

export type ClinicLeadResult =
  | { outcome: "created"; leadId: string }
  | { outcome: "exists"; leadId: string }
  | { outcome: "email_in_other_vertical" }
  | { outcome: "invalid_phone" };

/**
 * Upsert an UNASSIGNED Clinics lead for a landing-page enquiry (consultants claim it from the
 * pool). Deduped against existing Clinics leads by phone OR email, under the same per-phone
 * advisory lock the portal uses, so a landing submit and a consultant create can't both win.
 *
 * `public.clients.email` is unique across every vertical. If the email already belongs to a
 * non-Clinics CRM client we do NOT create a second row for the same business (it would
 * cross-contaminate verticals) — the caller logs `email_in_other_vertical` and moves on.
 */
export async function upsertClinicLeadFromEnquiry(db: Sql, e: ClinicEnquiry): Promise<ClinicLeadResult> {
  const phone = normalizeE164(e.whatsapp);
  if (!phone) return { outcome: "invalid_phone" };
  const email = e.email.trim().toLowerCase() || null;
  const name = e.practiceName.trim();
  const cfg = consultantConfig();

  return db.begin(async (tx) => {
    const t = txSql(tx);
    await lockPhone(t, phone);
    const existing = await t<{ id: string }[]>`
      select id::text from public.clients
      where vertical = ${CLINICS_VERTICAL}
        and (phone = ${phone} or (${email}::text is not null and lower(email) = ${email}))
      order by created_at asc
      limit 1
    `;
    if (existing[0]) return { outcome: "exists" as const, leadId: existing[0].id };
    if (email && (await clientIdByEmail(t, email))) return { outcome: "email_in_other_vertical" as const };

    const rows = await t<{ id: string }[]>`
      insert into public.clients (
        name, company, email, website_url, contact_name, contact_role, phone, lead_source,
        vertical, sales_stage, sales_stage_changed_at, status, created_by
      ) values (
        ${name}, ${name}, ${email ?? placeholderEmail()}, ${e.websiteUrl.trim() || null},
        ${e.contactName.trim() || null}, ${e.role.trim() || null}, ${phone}, ${LANDING_PAGE_SOURCE},
        ${CLINICS_VERTICAL}, 'new', now(), ${cfg.pipeline.newLeadStatus}, ${e.source || CRM_FEED.landingLeadSource}
      )
      returning id::text
    `;
    await logActivity(t, CRM_FEED.activity.leadCreated, rows[0].id, "system", {
      source: e.source || CRM_FEED.landingLeadSource,
      clinic_blueprint_id: e.blueprintId,
      consultant_id: null,
    });
    return { outcome: "created" as const, leadId: rows[0].id };
  });
}
