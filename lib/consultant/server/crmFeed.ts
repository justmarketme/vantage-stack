import type { Sql } from "postgres";
import { consultantConfig } from "../config";
import { CLINICS_VERTICAL, type CallDisposition, type CallStatus, type CallSummary, type SalesStage } from "../types";
import { CRM_FEED } from "./constants";
import { callCommunication, dealStatusForStage } from "./format";
import { txSql } from "./http";

/**
 * The Consultant Portal → VantageStack CRM feed (Zapier lens: every write lands in the
 * existing CRM tables, idempotently, and is tagged `vertical = 'clinics'`).
 *
 * - `client_communications` — one row per call (channel `call`), keyed by
 *   `metadata.consultant_call_id` and refreshed as the call progresses (status → summary).
 * - `crm_activity` — `consultant_call` (once per call), `consultant_stage_change`,
 *   `consultant_note`, `consultant_lead_created`, `consultant_lead_claimed`.
 * - `deals` — one Clinics deal per lead, mirrored from the sales stage (won → accepted).
 *
 * Details written to crm_activity never include phone numbers, emails or transcript text.
 */

export async function logActivity(
  db: Sql,
  actionType: string,
  clientId: string | null,
  actor: string,
  details: Record<string, unknown>,
): Promise<void> {
  await db`
    insert into public.crm_activity (action_type, client_id, user_actor, details)
    values (${actionType}, ${clientId}::uuid, ${actor}, ${db.json({ vertical: CLINICS_VERTICAL, ...details } as never)})
  `;
}

/**
 * Keep the lead's single Clinics deal in step with its stage and value. The caller must hold
 * the lead's row lock (`select … for update` on public.clients) so two concurrent PATCHes
 * can't both insert — there is no unique index on deals(client_id, vertical) (contract request CR-4).
 *
 * A deal row is created only when the stage reaches proposal / won or a value is set; once it
 * exists it follows every later stage change (e.g. back to proposal clears accepted_at).
 */
export async function syncClinicsDeal(
  db: Sql,
  input: { clientId: string; stage: SalesStage; dealValue?: number | null; consultantId: string | null },
): Promise<void> {
  const cfg = consultantConfig();
  const status = dealStatusForStage(input.stage);
  // `paid` is past `won`: keep accepted_at (clearing it would un-win a paid deal).
  const won = input.stage === "won" || input.stage === "paid";
  const sent = input.stage === "proposal" || won;
  const existing = await db<{ id: string }[]>`
    select id::text from public.deals
    where client_id = ${input.clientId}::uuid and vertical = ${CLINICS_VERTICAL}
    order by created_at desc limit 1
  `;
  const valueGiven = input.dealValue !== undefined;
  const value = input.dealValue ?? 0;

  if (existing.length) {
    await db`
      update public.deals set
        proposal_status = ${status},
        deal_value = case when ${valueGiven} then ${value}::int else deal_value end,
        consultant_id = ${input.consultantId}::uuid,
        sent_at = case when ${sent} then coalesce(sent_at, now()) else sent_at end,
        accepted_at = case when ${won} then coalesce(accepted_at, now()) else null end,
        -- won_at feeds the deal.won event (outbox trigger) and the "won" metric.
        won_at = case when ${won} then coalesce(won_at, now()) else null end
      where id = ${existing[0].id}::uuid
    `;
    return;
  }
  if (!sent && !(valueGiven && input.dealValue != null)) return;
  await db`
    insert into public.deals (client_id, proposal_status, deal_value, service_type, vertical, consultant_id, sent_at, accepted_at, won_at)
    values (
      ${input.clientId}::uuid, ${status}, ${value}::int, ${cfg.pipeline.dealServiceType}, ${CLINICS_VERTICAL},
      ${input.consultantId}::uuid,
      ${sent ? new Date() : null}, ${won ? new Date() : null}, ${won ? new Date() : null}
    )
  `;
}

type CallFeedRow = {
  id: string;
  client_id: string;
  consultant_id: string;
  consultant_username: string | null;
  status: CallStatus;
  disposition: CallDisposition | null;
  talk_sec: number | null;
  duration_sec: number | null;
  summary_status: string;
  summary: CallSummary | null;
  has_recording: boolean;
  started_at: Date;
  ended_at: Date | null;
};

/**
 * Upsert the CRM communication row for a call and log `consultant_call` once. Safe to call
 * any number of times (completion, summary ready, wrap-up): the call row lock serialises
 * concurrent callers, and the lookup-then-write is keyed by the call id.
 */
export async function recordCallInCrm(db: Sql, callId: string): Promise<void> {
  await db.begin(async (tx) => {
    const t = txSql(tx);
    const rows = await t<CallFeedRow[]>`
      select k.id::text, k.client_id::text, k.consultant_id::text, m.username::text as consultant_username,
        k.status, k.disposition, k.duration_sec, k.summary_status, k.summary,
        (k.recording_sid is not null) as has_recording, k.started_at, k.ended_at,
        case when k.answered_at is not null and k.ended_at is not null
          then greatest(0, extract(epoch from (k.ended_at - k.answered_at)))::int
          else 0 end as talk_sec
      from public.consultant_calls k
      left join public.team_members m on m.id = k.consultant_id
      where k.id = ${callId}::uuid
      for update of k
    `;
    const call = rows[0];
    if (!call || !call.ended_at) return; // only ended calls are CRM communications

    const talkSec = call.talk_sec ?? 0;
    const summary = call.summary_status === "ready" ? call.summary : null;
    const { subject, preview } = callCommunication({ status: call.status, disposition: call.disposition, talkSec, summary });
    const metadata = {
      consultant_call_id: call.id,
      vertical: CLINICS_VERTICAL,
      direction: "outbound",
      consultant_id: call.consultant_id,
      status: call.status,
      disposition: call.disposition,
      talk_sec: talkSec,
      duration_sec: call.duration_sec,
      summary_status: call.summary_status,
      has_recording: call.has_recording,
    };

    const existing = await t<{ id: string }[]>`
      select id::text from public.client_communications
      where client_id = ${call.client_id}::uuid and channel = 'call' and metadata->>'consultant_call_id' = ${call.id}
      limit 1
    `;
    if (existing.length) {
      await t`
        update public.client_communications
        set subject = ${subject}, body_preview = ${preview}, metadata = ${t.json(metadata as never)}
        where id = ${existing[0].id}::uuid
      `;
    } else {
      await t`
        insert into public.client_communications (client_id, channel, subject, body_preview, sent_at, metadata)
        values (${call.client_id}::uuid, 'call', ${subject}, ${preview}, ${call.started_at}, ${t.json(metadata as never)})
      `;
      await t`update public.clients set last_active_at = now() where id = ${call.client_id}::uuid`;
    }

    await t`
      insert into public.crm_activity (action_type, client_id, user_actor, details)
      select ${CRM_FEED.activity.call}, ${call.client_id}::uuid, ${call.consultant_username ?? "consultant"},
        ${t.json({ vertical: CLINICS_VERTICAL, call_id: call.id, status: call.status, talk_sec: talkSec } as never)}
      where not exists (
        select 1 from public.crm_activity
        where action_type = ${CRM_FEED.activity.call} and client_id = ${call.client_id}::uuid
          and details->>'call_id' = ${call.id}
      )
    `;
  });
}
