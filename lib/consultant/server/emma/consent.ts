import type { Sql } from "postgres";
import { isInboundSource, LEAD_SOURCES, type LeadSource, type MessagingConsent } from "../../types";
import { audit } from "../audit";
import { CRM_FEED } from "../constants";

/**
 * Electronic-messaging consent (POPIA s.69 — Decision 8). Pure rules + the SQL around
 * `consultant_contact_consent`.
 *
 * Emma may message a LEAD only when:
 *   NOT opted out  AND  (explicit opt-in  OR  the lead came to us — an INBOUND source).
 * - Explicit opt-in: the consultant ticked "agreed to WhatsApp follow-up" on a call, or the
 *   clinic replied START.
 * - Inbound sources (`isInboundSource`): landing_page, social_inbound, inbound_call — they asked
 *   us to follow up. Wave-1 landing enquiries were stored as `clinics_landing`, which is treated
 *   as `landing_page`.
 * - Outbound sources (public_scrape, referral, event, consultant_portal, other, unknown) need
 *   the explicit opt-in.
 * - An opt-out is honoured forever; only the clinic replying START reverses it (a consultant's
 *   call consent never overrides it).
 * Consultant / owner audiences are internal and not consent-gated.
 */

export type ConsentRow = { opted_in_at: Date | string | null; opted_out_at: Date | string | null } | null | undefined;

/** Map a stored `clients.lead_source` (possibly legacy) onto the contract vocabulary. */
export function normaliseLeadSource(raw: string | null | undefined): LeadSource | null {
  if (!raw) return null;
  if (raw === CRM_FEED.landingLeadSource) return "landing_page";
  return (LEAD_SOURCES as readonly string[]).includes(raw) ? (raw as LeadSource) : null;
}

export function messagingConsent(row: ConsentRow): MessagingConsent {
  if (row?.opted_out_at) return "opted_out";
  if (row?.opted_in_at) return "opted_in";
  return "none";
}

/** The send-time gate. Pure and unit-tested. */
export function mayMessageLead(row: ConsentRow, leadSource: string | null | undefined): { ok: true } | { ok: false; reason: "opted_out" | "no_consent" } {
  const state = messagingConsent(row);
  if (state === "opted_out") return { ok: false, reason: "opted_out" };
  if (state === "opted_in" || isInboundSource(normaliseLeadSource(leadSource))) return { ok: true };
  return { ok: false, reason: "no_consent" };
}

export async function getConsentRow(db: Sql, leadId: string): Promise<ConsentRow> {
  const rows = await db<{ opted_in_at: Date | null; opted_out_at: Date | null }[]>`
    select opted_in_at, opted_out_at from public.consultant_contact_consent where client_id = ${leadId}::uuid
  `;
  return rows[0] ?? null;
}

export async function leadMessagingConsent(db: Sql, leadId: string): Promise<MessagingConsent> {
  return messagingConsent(await getConsentRow(db, leadId));
}

/**
 * The consultant recorded on a call that the clinic agreed to WhatsApp follow-ups.
 * Does NOT reverse an opt-out. Returns whether consent is now recorded as opted in.
 */
export async function recordCallConsent(db: Sql, input: { leadId: string; callId: string; memberId: string | null }): Promise<boolean> {
  const rows = await db<{ client_id: string }[]>`
    insert into public.consultant_contact_consent (client_id, opted_in_at, source, opted_in_call_id, updated_at)
    values (${input.leadId}::uuid, now(), 'call', ${input.callId}::uuid, now())
    on conflict (client_id) do update
      set opted_in_at = now(), source = 'call', opted_in_call_id = excluded.opted_in_call_id, updated_at = now()
      where public.consultant_contact_consent.opted_out_at is null
    returning client_id::text
  `;
  const applied = rows.length > 0;
  await audit(db, {
    actorId: input.memberId,
    actorKind: "member",
    action: applied ? "consent.opt_in_call" : "consent.opt_in_ignored_opted_out",
    entity: "lead",
    entityId: input.leadId,
    meta: { callId: input.callId },
  });
  return applied;
}

/**
 * STOP: opt out (idempotent). Returns true only on the transition (so we confirm ONCE).
 * `coalesce` keeps the ORIGINAL opt-out time, so the row's opted_out_at equals this
 * transaction's now() exactly when this statement set it.
 */
export async function optOut(db: Sql, leadId: string, source: string): Promise<boolean> {
  const rows = await db<{ changed: boolean }[]>`
    insert into public.consultant_contact_consent (client_id, opted_out_at, source, updated_at)
    values (${leadId}::uuid, now(), ${source}, now())
    on conflict (client_id) do update
      set opted_out_at = coalesce(public.consultant_contact_consent.opted_out_at, now()), source = excluded.source, updated_at = now()
    returning (opted_out_at = now()) as changed
  `;
  return rows[0]?.changed === true;
}

/** START from the clinic: the only thing that reverses an opt-out. */
export async function optIn(db: Sql, leadId: string, source: string): Promise<void> {
  await db`
    insert into public.consultant_contact_consent (client_id, opted_in_at, opted_out_at, source, updated_at)
    values (${leadId}::uuid, now(), null, ${source}, now())
    on conflict (client_id) do update set opted_in_at = now(), opted_out_at = null, source = excluded.source, updated_at = now()
  `;
}
