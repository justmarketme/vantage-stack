import type { Sql } from "postgres";
import { consultantConfig, crmStatusForStage } from "../../config";
import { commissionFor, storedRate } from "../../metrics/commission";
import { MESSAGES_3A } from "../../metrics/tunables";
import { CLINICS_VERTICAL, type Deal, type DealStatus, type PaymentConfirmInput, type SalesStage } from "../../types";
import { audit } from "../audit";
import { CRM_FEED } from "../constants";
import { logActivity } from "../crmFeed";
import { fail, txSql } from "../http";
import { isOwnedPath } from "../storage";
import { iso } from "../util";

/**
 * Clinics deals: read model + payment confirmation + commission.
 *
 * Decisions: a sale counts when it is PAID; payment is confirmed by a manager with proof;
 * commission = cfg.commission.rate × the amount paid, rounded half-up to whole rand and FROZEN
 * on the deal (a later rate change never rewrites history).
 *
 * ── PaymentSource seam ─────────────────────────────────────────────────────────────────────
 * Every way money can be confirmed produces the same `PaymentConfirmation`, and everything
 * after that (`recordPayment`: deal columns, commission, stage `paid`, CRM status, audit, the
 * `deal.paid` outbox event) is shared. Today there is one source, "manual" (a manager with
 * proof of payment). To add Paystack later:
 *   1. add "paystack" to PaymentSourceKind;
 *   2. implement `PaymentSource<PaystackChargeSuccess>` whose `toConfirmation` maps the
 *      verified webhook (amount in cents → whole rand, `reference`, `paid_at`) with
 *      `confirmedBy: null` and `proofPath: null`;
 *   3. in a signed `/api/webhooks/paystack` route (verify `x-paystack-signature`, HMAC-SHA512),
 *      resolve the lead from the charge metadata and call `recordPayment(db, leadId, c, actor)`.
 * `recordPayment` is idempotent on (reference, amount), so webhook redelivery is safe.
 */

export type PaymentSourceKind = "manual";

export type PaymentConfirmation = {
  source: PaymentSourceKind;
  amount: number; // whole rand
  reference: string;
  paidAt: Date;
  proofPath: string | null;
  note: string | null;
  /** The confirming manager; null for an automated source (e.g. a gateway webhook). */
  confirmedBy: string | null;
};

export interface PaymentSource<I> {
  readonly kind: PaymentSourceKind;
  toConfirmation(input: I, actor: { memberId: string | null }): PaymentConfirmation;
}

/** Allowed clock skew for "paid in the future" (device clocks, SAST date pickers). */
const PAID_AT_SKEW_MS = 5 * 60 * 1000;

export const manualPaymentSource: PaymentSource<PaymentConfirmInput> = {
  kind: "manual",
  toConfirmation(input, actor) {
    const paidAt = new Date(input.paidAt);
    if (paidAt.getTime() > Date.now() + PAID_AT_SKEW_MS) fail(400, MESSAGES_3A.paidAtFuture, { paidAt: MESSAGES_3A.paidAtFuture });
    // The proof must be an upload THIS manager was issued for payment_proof (3B's path shape).
    if (input.proofPath && !isOwnedPath(input.proofPath, "payment_proof", actor.memberId)) {
      fail(400, MESSAGES_3A.badProofPath, { proofPath: MESSAGES_3A.badProofPath });
    }
    return {
      source: "manual",
      amount: input.amount,
      reference: input.reference.trim(),
      paidAt,
      proofPath: input.proofPath ?? null,
      note: input.note ?? null,
      confirmedBy: actor.memberId,
    };
  },
};

type DealRow = {
  id: string;
  client_id: string;
  consultant_id: string | null;
  deal_value: number | null;
  proposal_status: string | null;
  won_at: Date | string | null;
  accepted_at: Date | string | null;
  paid_at: Date | string | null;
  payment_amount: number | null;
  payment_reference: string | null;
  payment_proof_path: string | null;
  confirmed_by_name: string | null;
  commission_rate: string | number | null;
  commission_amount: number | null;
};

/** CRM proposal_status + payment columns → contract DealStatus. Pure. */
export function dealStatusOf(r: Pick<DealRow, "paid_at" | "proposal_status">): DealStatus {
  if (r.paid_at) return "paid";
  switch (r.proposal_status) {
    case CRM_FEED.dealStatus.won:
      return "accepted";
    case CRM_FEED.dealStatus.proposal:
      return "sent";
    case CRM_FEED.dealStatus.lost:
      return "lost";
    default:
      return "draft";
  }
}

export function toDeal(r: DealRow): Deal {
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    id: r.id,
    leadId: r.client_id,
    consultantId: r.consultant_id,
    saleValue: num(r.deal_value),
    status: dealStatusOf(r),
    wonAt: iso(r.won_at ?? r.accepted_at),
    paidAt: iso(r.paid_at),
    paymentAmount: num(r.payment_amount),
    paymentReference: r.payment_reference,
    hasProof: !!r.payment_proof_path,
    confirmedByName: r.confirmed_by_name,
    commissionRate: num(r.commission_rate),
    commissionAmount: num(r.commission_amount),
  };
}

function dealSelect(db: Sql) {
  return db`
    select d.id::text, d.client_id::text as client_id, d.consultant_id::text as consultant_id, d.deal_value,
      d.proposal_status, d.won_at, d.accepted_at, d.paid_at, d.payment_amount, d.payment_reference,
      d.payment_proof_path, d.commission_rate, d.commission_amount,
      coalesce(nullif(m.full_name, ''), m.username)::text as confirmed_by_name
    from public.deals d
    left join public.team_members m on m.id = d.payment_confirmed_by
  `;
}

/** The lead's single Clinics deal (caller has already checked the lead is visible). */
export async function getDeal(db: Sql, leadId: string): Promise<Deal | null> {
  const rows = await db<DealRow[]>`
    ${dealSelect(db)}
    where d.client_id = ${leadId}::uuid and d.vertical = ${CLINICS_VERTICAL}
    order by d.created_at desc limit 1
  `;
  return rows[0] ? toDeal(rows[0]) : null;
}

/**
 * Record a payment (any PaymentSource). One transaction:
 *  1. lock the Clinics lead (404 if none; 409 if lost);
 *  2. lock / create its deal; if already paid with the SAME reference and amount → no-op
 *     (idempotent replay); already paid otherwise → 409;
 *  3. write paid_at, amount, reference, proof, confirmer, frozen commission rate + amount, and
 *     won_at if it was never set (a paid deal was necessarily won) — the deals trigger emits
 *     `deal.paid` (and `deal.won` if new) into the outbox;
 *  4. move the lead to stage `paid` + CRM status via crmStatusForStage (trigger emits
 *     `lead.stage_changed`), log CRM activity, audit.
 */
export async function recordPayment(
  db: Sql,
  leadId: string,
  c: PaymentConfirmation,
  actor: { memberId: string | null; username: string; kind: "member" | "system" },
): Promise<{ deal: Deal; changed: boolean }> {
  const cfg = consultantConfig();
  const changed = await db.begin(async (tx) => {
    const t = txSql(tx);
    const leads = await t<{ id: string; sales_stage: string | null; consultant_id: string | null }[]>`
      select id::text, sales_stage, consultant_id::text as consultant_id from public.clients
      where id = ${leadId}::uuid and vertical = ${CLINICS_VERTICAL}
      for update
    `;
    const lead = leads[0];
    if (!lead) fail(404, MESSAGES_3A.notClinicsLead);
    if (lead.sales_stage === "lost") fail(409, MESSAGES_3A.lostLeadPayment);

    const existing = await t<{ id: string; paid_at: Date | null; payment_reference: string | null; payment_amount: number | null; consultant_id: string | null }[]>`
      select id::text, paid_at, payment_reference, payment_amount, consultant_id::text as consultant_id from public.deals
      where client_id = ${leadId}::uuid and vertical = ${CLINICS_VERTICAL}
      order by created_at desc limit 1
      for update
    `;
    const deal = existing[0];
    if (deal?.paid_at) {
      if (deal.payment_reference === c.reference && Number(deal.payment_amount) === c.amount) return false;
      fail(409, MESSAGES_3A.alreadyPaid);
    }

    const rate = storedRate(cfg.commission.rate);
    const commission = commissionFor(c.amount, rate);
    const consultantId = deal?.consultant_id ?? lead.consultant_id;
    let dealId = deal?.id;
    if (!dealId) {
      const ins = await t<{ id: string }[]>`
        insert into public.deals (client_id, proposal_status, deal_value, service_type, vertical, consultant_id, sent_at, accepted_at)
        values (${leadId}::uuid, ${CRM_FEED.dealStatus.won}, ${c.amount}, ${cfg.pipeline.dealServiceType}, ${CLINICS_VERTICAL},
          ${consultantId}::uuid, now(), now())
        returning id::text
      `;
      dealId = ins[0].id;
    }
    await t`
      update public.deals set
        paid_at = ${c.paidAt},
        payment_amount = ${c.amount},
        payment_reference = ${c.reference},
        payment_proof_path = ${c.proofPath},
        payment_note = ${c.note},
        payment_confirmed_by = ${c.confirmedBy}::uuid,
        payment_confirmed_at = now(),
        commission_rate = ${rate},
        commission_amount = ${commission},
        consultant_id = coalesce(consultant_id, ${consultantId}::uuid),
        proposal_status = ${CRM_FEED.dealStatus.won},
        accepted_at = coalesce(accepted_at, now()),
        won_at = coalesce(won_at, accepted_at, now()),
        deal_value = case when coalesce(deal_value, 0) = 0 then ${c.amount} else deal_value end
      where id = ${dealId}::uuid
    `;

    const fromStage = (lead.sales_stage ?? "new") as SalesStage;
    const status = crmStatusForStage("paid", cfg);
    const leadUpdate: Record<string, unknown> = { sales_stage: "paid", lost_reason: null, updated_at: new Date() };
    if (fromStage !== "paid") leadUpdate.sales_stage_changed_at = new Date();
    if (status) leadUpdate.status = status;
    await t`update public.clients set ${t(leadUpdate)} where id = ${leadId}::uuid`;
    if (fromStage !== "paid") {
      await logActivity(t, CRM_FEED.activity.stageChange, leadId, actor.username, {
        from: fromStage,
        to: "paid",
        consultant_id: consultantId,
        source: `payment_${c.source}`,
      });
    }
    await logActivity(t, "consultant_payment_confirmed", leadId, actor.username, {
      deal_id: dealId,
      amount: c.amount,
      commission,
      source: c.source,
      has_proof: !!c.proofPath,
    });
    await audit(t, {
      actorId: actor.memberId,
      actorKind: actor.kind,
      action: "payment.confirmed",
      entity: "deal",
      entityId: dealId,
      meta: { leadId, amount: c.amount, commission, source: c.source, hasProof: !!c.proofPath },
    });
    return true;
  });
  const deal = await getDeal(db, leadId);
  if (!deal) fail(404, MESSAGES_3A.dealNotFound);
  return { deal, changed };
}

/** Proof-of-payment storage path + the deal's consultant (for the owner-or-manager check). */
export async function proofFor(db: Sql, leadId: string): Promise<{ path: string | null; consultantId: string | null; leadConsultantId: string | null } | null> {
  const rows = await db<{ path: string | null; consultant_id: string | null; lead_consultant_id: string | null }[]>`
    select d.payment_proof_path as path, d.consultant_id::text as consultant_id, c.consultant_id::text as lead_consultant_id
    from public.clients c
    left join lateral (
      select * from public.deals d where d.client_id = c.id and d.vertical = ${CLINICS_VERTICAL}
      order by d.created_at desc limit 1
    ) d on true
    where c.id = ${leadId}::uuid and c.vertical = ${CLINICS_VERTICAL}
  `;
  const r = rows[0];
  return r ? { path: r.path, consultantId: r.consultant_id, leadConsultantId: r.lead_consultant_id } : null;
}
