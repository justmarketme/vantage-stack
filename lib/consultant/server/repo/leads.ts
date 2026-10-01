import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import type { ConsultantSession } from "../../auth/session";
import { consultantConfig, crmStatusForStage } from "../../config";
import { CLINICS_VERTICAL, SALES_STAGES, type Lead, type LeadInput, type LeadPatch, type SalesStage } from "../../types";
import { CRM_FEED, MESSAGES } from "../constants";
import { logActivity, syncClinicsDeal } from "../crmFeed";
import { fail, isUniqueViolation, txSql } from "../http";
import { isPlaceholderEmail, toLead, type LeadRow } from "../mappers";
import { attachLeadInsights } from "../scoring/leadInsights";
import { leadVisible, writerId, type Scope } from "./scope";

/**
 * A Lead IS a `public.clients` row with `vertical = 'clinics'`:
 *   clinicName → name + company · consultant_id (authoritative owner) · assigned_to (username,
 *   for CRM display) · sales_stage (portal pipeline) · status (CRM delivery status, moved only
 *   at proposal / won via crmStatusForStage).
 */

type Session = Pick<ConsultantSession, "memberId" | "isManager" | "username">;

function leadSelect(db: Sql) {
  return db`
    select
      c.id::text as id,
      coalesce(nullif(c.company, ''), c.name)::text as clinic_name,
      c.contact_name, c.contact_role, c.phone, c.email::text as email, c.website_url, c.city,
      c.lead_source, c.sales_stage, c.sales_stage_changed_at, c.lost_reason,
      c.referred_by, c.social_platform, c.social_handle, c.source_url, c.sourced_at,
      c.next_action, c.next_action_at, c.consultant_id::text as consultant_id,
      coalesce(nullif(m.full_name, ''), m.username)::text as consultant_name,
      c.created_at, k.last_call_at, coalesce(k.call_count, 0)::int as call_count, d.deal_value
    from public.clients c
    left join public.team_members m on m.id = c.consultant_id
    left join lateral (
      select max(cc.started_at) as last_call_at, count(*)::int as call_count
      from public.consultant_calls cc where cc.client_id = c.id
    ) k on true
    left join lateral (
      select dl.deal_value from public.deals dl
      where dl.client_id = c.id and dl.vertical = ${CLINICS_VERTICAL}
      order by dl.created_at desc limit 1
    ) d on true
  `;
}

export async function getLead(db: Sql, s: Scope, id: string): Promise<Lead | null> {
  const rows = await db<LeadRow[]>`
    ${leadSelect(db)}
    where c.id = ${id}::uuid and c.vertical = ${CLINICS_VERTICAL} and ${leadVisible(db, s)}
  `;
  if (!rows[0]) return null;
  // Wave 2 (3A, additive): score + deal + messaging consent on single-lead reads.
  return attachLeadInsights(db, toLead(rows[0], consultantConfig().pipeline));
}

export async function requireLead(db: Sql, s: Scope, id: string): Promise<Lead> {
  const lead = await getLead(db, s, id);
  if (!lead) fail(404, MESSAGES.leadNotFound);
  return lead;
}

export type LeadListQuery = { stage?: SalesStage; q?: string; scope?: "mine" | "pool" | "all" };

/** Parse `?stage=&q=&scope=` strictly; unknown values are a 400, not silently ignored. */
export function parseLeadListQuery(sp: URLSearchParams): LeadListQuery {
  const stage = sp.get("stage") || undefined;
  const scope = sp.get("scope") || undefined;
  const q = (sp.get("q") || "").trim();
  const fields: Record<string, string> = {};
  if (stage && !(SALES_STAGES as readonly string[]).includes(stage)) fields.stage = "Unknown stage";
  if (scope && !["mine", "pool", "all"].includes(scope)) fields.scope = "Unknown scope";
  if (q.length > 100) fields.q = "Search is too long";
  if (Object.keys(fields).length) fail(400, MESSAGES.badRequest, fields);
  return { stage: stage as SalesStage | undefined, scope: scope as LeadListQuery["scope"], q: q || undefined };
}

export async function listLeads(db: Sql, s: Scope, query: LeadListQuery): Promise<Lead[]> {
  const cfg = consultantConfig();
  const scopeFilter =
    query.scope === "mine"
      ? s.memberId
        ? db`c.consultant_id = ${s.memberId}::uuid`
        : db`false`
      : query.scope === "pool"
        ? db`c.consultant_id is null`
        : db`true`;
  const stageFilter = query.stage
    ? query.stage === "new"
      ? db`coalesce(c.sales_stage, 'new') = 'new'`
      : db`c.sales_stage = ${query.stage}`
    : db`true`;
  const like = query.q ? `%${query.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null;
  const searchFilter = like
    ? db`(c.name ilike ${like} or coalesce(c.company, '') ilike ${like} or coalesce(c.contact_name, '') ilike ${like}
         or coalesce(c.city, '') ilike ${like} or coalesce(c.phone, '') ilike ${like})`
    : db`true`;
  const rows = await db<LeadRow[]>`
    ${leadSelect(db)}
    where c.vertical = ${CLINICS_VERTICAL} and ${leadVisible(db, s)}
      and ${scopeFilter} and ${stageFilter} and ${searchFilter}
    order by c.next_action_at asc nulls last, coalesce(c.sales_stage_changed_at, c.created_at) desc
    limit ${cfg.limits.listMax}
  `;
  const now = new Date();
  return rows.map((r) => toLead(r, cfg.pipeline, now));
}

/** Serialise every create/edit of a given phone number so the Clinics dedupe can't race. */
export async function lockPhone(t: Sql, phone: string): Promise<void> {
  await t`select pg_advisory_xact_lock(hashtext(${`consultant-lead-phone:${phone}`}))`;
}

export async function clinicsLeadIdByPhone(t: Sql, phone: string, exceptId?: string): Promise<string | null> {
  const rows = await t<{ id: string }[]>`
    select id::text from public.clients
    where vertical = ${CLINICS_VERTICAL} and phone = ${phone}
      and (${exceptId ?? null}::uuid is null or id <> ${exceptId ?? null}::uuid)
    limit 1
  `;
  return rows[0]?.id ?? null;
}

export async function clientIdByEmail(t: Sql, email: string, exceptId?: string): Promise<string | null> {
  const rows = await t<{ id: string }[]>`
    select id::text from public.clients
    where lower(email) = lower(${email}) and (${exceptId ?? null}::uuid is null or id <> ${exceptId ?? null}::uuid)
    limit 1
  `;
  return rows[0]?.id ?? null;
}

export function placeholderEmail(): string {
  return `clinic+${randomUUID()}@${CRM_FEED.placeholderEmailDomain}`;
}

function emailConflict(): never {
  fail(409, MESSAGES.duplicateEmail, { email: MESSAGES.duplicateEmail });
}

export async function createLead(db: Sql, s: Session, input: LeadInput): Promise<Lead> {
  const memberId = writerId(s);
  const cfg = consultantConfig();
  let id: string;
  try {
    id = await db.begin(async (tx) => {
      const t = txSql(tx);
      await lockPhone(t, input.phone);
      if (await clinicsLeadIdByPhone(t, input.phone)) {
        fail(409, MESSAGES.duplicatePhone, { phone: MESSAGES.duplicatePhone });
      }
      if (input.email && (await clientIdByEmail(t, input.email))) emailConflict();
      const rows = await t<{ id: string }[]>`
        insert into public.clients (
          name, company, email, website_url, city, contact_name, contact_role, phone, lead_source,
          vertical, sales_stage, sales_stage_changed_at, status, consultant_id, assigned_to, created_by,
          next_action, next_action_at,
          referred_by, social_platform, social_handle
        ) values (
          ${input.clinicName}, ${input.clinicName}, ${input.email ?? placeholderEmail()}, ${input.website ?? null},
          ${input.city ?? null}, ${input.contactName ?? null}, ${input.contactRole ?? null}, ${input.phone},
          ${input.source ?? CRM_FEED.defaultLeadSource}, ${CLINICS_VERTICAL}, 'new', now(),
          ${cfg.pipeline.newLeadStatus}, ${memberId}::uuid, ${s.username}, ${s.username},
          ${input.nextAction ?? null}, ${input.nextActionAt ?? null}::timestamptz,
          ${input.referredBy ?? null}, ${input.socialPlatform ?? null}, ${input.socialHandle ?? null}
        )
        returning id::text
      `;
      await logActivity(t, CRM_FEED.activity.leadCreated, rows[0].id, s.username, {
        consultant_id: memberId,
        source: input.source ?? CRM_FEED.defaultLeadSource,
      });
      return rows[0].id;
    });
  } catch (e) {
    if (isUniqueViolation(e)) emailConflict();
    throw e;
  }
  return requireLead(db, s, id);
}

type LockedLead = {
  id: string;
  sales_stage: string | null;
  consultant_id: string | null;
  phone: string | null;
  email: string | null;
};

/** Row-lock a visible Clinics lead for the rest of the transaction. */
export async function lockLead(t: Sql, s: Scope, id: string): Promise<LockedLead> {
  const rows = await t<LockedLead[]>`
    select c.id::text, c.sales_stage, c.consultant_id::text, c.phone, c.email::text
    from public.clients c
    where c.id = ${id}::uuid and c.vertical = ${CLINICS_VERTICAL} and ${leadVisible(t, s)}
    for update of c
  `;
  if (!rows[0]) fail(404, MESSAGES.leadNotFound);
  return rows[0];
}

/**
 * Apply a LeadPatch inside the caller's transaction (used by PATCH leads/[id] and the call
 * wrap-up). Stage changes stamp sales_stage_changed_at, move the CRM status via
 * crmStatusForStage, log `consultant_stage_change` and keep the Clinics deal in step.
 */
export async function applyLeadPatch(
  t: Sql,
  s: Session,
  id: string,
  patch: LeadPatch,
  context: { source: "lead" | "call"; callId?: string },
): Promise<void> {
  writerId(s);
  const lead = await lockLead(t, s, id);
  const cfg = consultantConfig();
  const updates: Record<string, unknown> = {};
  let owner = lead.consultant_id;

  if (patch.consultantId !== undefined) {
    if (!s.isManager) fail(403, MESSAGES.managersOnly);
    if (patch.consultantId === null) {
      updates.consultant_id = null;
      updates.assigned_to = null;
    } else {
      const m = await t<{ username: string }[]>`
        select username::text from public.team_members where id = ${patch.consultantId}::uuid and status = 'active'
      `;
      if (!m[0]) fail(400, MESSAGES.badRequest, { consultantId: MESSAGES.unknownConsultant });
      updates.consultant_id = patch.consultantId;
      updates.assigned_to = m[0].username;
    }
    owner = patch.consultantId;
  }

  if (patch.phone !== undefined && patch.phone !== lead.phone) {
    await lockPhone(t, patch.phone);
    if (await clinicsLeadIdByPhone(t, patch.phone, id)) {
      fail(409, MESSAGES.duplicatePhone, { phone: MESSAGES.duplicatePhone });
    }
    updates.phone = patch.phone;
  }

  if (patch.email !== undefined) {
    if (patch.email === null) {
      if (!isPlaceholderEmail(lead.email)) updates.email = placeholderEmail();
    } else if (patch.email.toLowerCase() !== (lead.email ?? "").toLowerCase()) {
      if (await clientIdByEmail(t, patch.email, id)) emailConflict();
      updates.email = patch.email;
    }
  }

  if (patch.clinicName !== undefined) {
    updates.name = patch.clinicName;
    updates.company = patch.clinicName;
  }
  if (patch.contactName !== undefined) updates.contact_name = patch.contactName || null;
  if (patch.contactRole !== undefined) updates.contact_role = patch.contactRole || null;
  if (patch.website !== undefined) updates.website_url = patch.website;
  if (patch.city !== undefined) updates.city = patch.city || null;
  if (patch.nextAction !== undefined) updates.next_action = patch.nextAction || null;
  if (patch.nextActionAt !== undefined) updates.next_action_at = patch.nextActionAt ? new Date(patch.nextActionAt) : null;
  if (patch.lostReason !== undefined) updates.lost_reason = patch.lostReason || null;

  const fromStage = (lead.sales_stage ?? "new") as SalesStage;
  // "Paid" drives commission, so it is set ONLY by a manager's payment confirmation
  // (POST deals/[leadId]/payment) and a paid deal cannot be moved back from here.
  if (patch.salesStage !== undefined && patch.salesStage !== fromStage && (patch.salesStage === "paid" || fromStage === "paid")) {
    fail(409, MESSAGES.paidStageLocked, { salesStage: MESSAGES.paidStageLocked });
  }
  const stageChanged = patch.salesStage !== undefined && patch.salesStage !== fromStage;
  const stage = patch.salesStage ?? fromStage;
  if (stageChanged) {
    updates.sales_stage = stage;
    updates.sales_stage_changed_at = new Date();
    const status = crmStatusForStage(stage, cfg);
    if (status) updates.status = status;
    if (stage !== "lost" && patch.lostReason === undefined) updates.lost_reason = null;
  }

  if (Object.keys(updates).length) {
    updates.updated_at = new Date();
    try {
      await t`update public.clients set ${t(updates)} where id = ${id}::uuid`;
    } catch (e) {
      if (isUniqueViolation(e)) emailConflict();
      throw e;
    }
  }

  if (stageChanged || patch.dealValue !== undefined) {
    await syncClinicsDeal(t, {
      clientId: id,
      stage,
      ...(patch.dealValue !== undefined ? { dealValue: patch.dealValue } : {}),
      consultantId: owner,
    });
  }
  if (stageChanged) {
    await logActivity(t, CRM_FEED.activity.stageChange, id, s.username, {
      from: fromStage,
      to: stage,
      consultant_id: owner,
      source: context.source,
      ...(context.callId ? { call_id: context.callId } : {}),
    });
  }
}

export async function patchLead(db: Sql, s: Session, id: string, patch: LeadPatch): Promise<Lead> {
  await db.begin((tx) => applyLeadPatch(txSql(tx), s, id, patch, { source: "lead" }));
  return requireLead(db, s, id);
}

/** Claim an unassigned lead for the caller. 409 if someone already owns it. */
export async function claimLead(db: Sql, s: Session, id: string): Promise<Lead> {
  const memberId = writerId(s);
  const claimed = await db.begin(async (tx) => {
    const t = txSql(tx);
    const rows = await t<{ id: string }[]>`
      update public.clients set consultant_id = ${memberId}::uuid, assigned_to = ${s.username}, updated_at = now()
      where id = ${id}::uuid and vertical = ${CLINICS_VERTICAL} and consultant_id is null
      returning id::text
    `;
    if (rows[0]) {
      await logActivity(t, CRM_FEED.activity.leadClaimed, id, s.username, { consultant_id: memberId });
    }
    return !!rows[0];
  });
  if (!claimed) {
    if (!(await getLead(db, s, id))) fail(404, MESSAGES.leadNotFound);
    fail(409, MESSAGES.alreadyClaimed);
  }
  return requireLead(db, s, id);
}
