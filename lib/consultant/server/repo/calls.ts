import type { Sql } from "postgres";
import type { ConsultantSession } from "../../auth/session";
import { consultantConfig } from "../../config";
import { CLINICS_VERTICAL, type Call, type CallDetail, type CallPatch, type LiveCallState } from "../../types";
import { CRM_FEED, MESSAGES, TIMINGS } from "../constants";
import { logActivity, recordCallInCrm } from "../crmFeed";
import { fail, txSql } from "../http";
import { isLiveStatus, toCall, type CallRow } from "../mappers";
import { requireLead, applyLeadPatch, lockLead } from "./leads";
import { listNotes } from "./notes";
import { listSegments } from "./segments";
import { leadVisible, writerId, type Scope } from "./scope";

type Session = Pick<ConsultantSession, "memberId" | "isManager" | "username">;

function callSelect(db: Sql) {
  return db`
    select
      k.id::text as id, k.client_id::text as client_id, k.consultant_id::text as consultant_id,
      coalesce(nullif(m.full_name, ''), m.username)::text as consultant_name,
      k.to_number, k.status, k.started_at, k.answered_at, k.ended_at, k.duration_sec, k.recording_sid,
      k.disposition, k.next_action, k.next_action_at, k.summary_status, k.summary
    from public.consultant_calls k
    join public.clients c on c.id = k.client_id and c.vertical = ${CLINICS_VERTICAL}
    left join public.team_members m on m.id = k.consultant_id
  `;
}

/** A call is visible exactly when its lead is. */
export async function getCallRow(db: Sql, s: Scope, id: string): Promise<CallRow | null> {
  const rows = await db<CallRow[]>`${callSelect(db)} where k.id = ${id}::uuid and ${leadVisible(db, s)}`;
  return rows[0] ?? null;
}

export async function requireCall(db: Sql, s: Scope, id: string): Promise<Call> {
  const row = await getCallRow(db, s, id);
  if (!row) fail(404, MESSAGES.callNotFound);
  return toCall(row);
}

/** Only the consultant on the call (or a manager) may change it. */
export function assertOwnCall(s: Scope, call: Pick<Call, "consultantId">): void {
  if (!s.isManager && call.consultantId !== s.memberId) fail(403, MESSAGES.notYourCall);
}

export async function listCallsForLead(db: Sql, leadId: string): Promise<Call[]> {
  const rows = await db<CallRow[]>`
    ${callSelect(db)} where k.client_id = ${leadId}::uuid
    order by k.started_at desc
    limit ${consultantConfig().limits.listMax}
  `;
  return rows.map(toCall);
}

/**
 * POST calls: create the call row the browser's `Device.connect({ params: { CallId } })`
 * will reference. The number to dial is copied from the lead — never from the request.
 * One live call per consultant (serialised by an advisory lock on the member id); calling an
 * unassigned lead claims it so two consultants can't phone the same clinic.
 */
export async function startCall(db: Sql, s: Session, leadId: string): Promise<Call> {
  const memberId = writerId(s);
  const cfg = consultantConfig();
  const liveWindowSec = cfg.twilio.dialTimeoutSec + cfg.twilio.maxCallSec + TIMINGS.callCloseSlackSec;

  const id = await db.begin(async (tx) => {
    const t = txSql(tx);
    await t`select pg_advisory_xact_lock(hashtext(${`consultant-call:${memberId}`}))`;

    // Calls the browser never connected are dead — release them before the live-call check.
    await t`
      update public.consultant_calls
      set status = 'failed', ended_at = coalesce(ended_at, now()), summary_status = 'skipped', updated_at = now()
      where consultant_id = ${memberId}::uuid and status = 'initiated' and twilio_call_sid is null
        and started_at < now() - make_interval(secs => ${TIMINGS.initiatedStaleSec})
    `;
    const live = await t`
      select 1 from public.consultant_calls
      where consultant_id = ${memberId}::uuid and status in ('initiated', 'ringing', 'in_progress')
        and started_at > now() - make_interval(secs => ${liveWindowSec})
      limit 1
    `;
    if (live.length) fail(409, MESSAGES.liveCallExists);

    const lead = await lockLead(t, s, leadId);
    if (!lead.phone) fail(400, MESSAGES.leadHasNoPhone, { phone: MESSAGES.leadHasNoPhone });
    if (!lead.consultant_id) {
      await t`
        update public.clients set consultant_id = ${memberId}::uuid, assigned_to = ${s.username}, updated_at = now()
        where id = ${leadId}::uuid
      `;
      await logActivity(t, CRM_FEED.activity.leadClaimed, leadId, s.username, { consultant_id: memberId, via: "call" });
    }
    const rows = await t<{ id: string }[]>`
      insert into public.consultant_calls (client_id, consultant_id, to_number)
      values (${leadId}::uuid, ${memberId}::uuid, ${lead.phone})
      returning id::text
    `;
    return rows[0].id;
  });
  return requireCall(db, s, id);
}

export async function getCallDetail(db: Sql, s: Scope, id: string): Promise<CallDetail> {
  const call = await requireCall(db, s, id);
  const [lead, transcript, notes] = await Promise.all([
    requireLead(db, s, call.leadId),
    listSegments(db, id, 0),
    listNotes(db, { callId: id }),
  ]);
  return { call, lead, transcript, notes };
}

export async function getLiveState(db: Sql, s: Scope, id: string, after: number): Promise<LiveCallState> {
  const call = await requireCall(db, s, id);
  const segments = await listSegments(db, id, after);
  const lastSeq = segments.length ? segments[segments.length - 1].seq : after;
  return {
    status: call.status,
    segments,
    lastSeq,
    ended: !isLiveStatus(call.status),
    pollMs: consultantConfig().live.pollMs,
  };
}

/** Wrap-up. `nextAction*` also becomes the lead's next action; `salesStage` moves the lead. */
export async function patchCall(db: Sql, s: Session, id: string, patch: CallPatch): Promise<Call> {
  writerId(s);
  const call = await requireCall(db, s, id);
  assertOwnCall(s, call);

  await db.begin(async (tx) => {
    const t = txSql(tx);
    await t`select id from public.consultant_calls where id = ${id}::uuid for update`;
    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (patch.disposition !== undefined) updates.disposition = patch.disposition;
    if (patch.nextAction !== undefined) updates.next_action = patch.nextAction || null;
    if (patch.nextActionAt !== undefined) updates.next_action_at = patch.nextActionAt ? new Date(patch.nextActionAt) : null;
    await t`update public.consultant_calls set ${t(updates)} where id = ${id}::uuid`;

    const leadPatch = {
      ...(patch.salesStage !== undefined ? { salesStage: patch.salesStage } : {}),
      ...(patch.nextAction !== undefined ? { nextAction: patch.nextAction } : {}),
      ...(patch.nextActionAt !== undefined ? { nextActionAt: patch.nextActionAt } : {}),
    };
    if (Object.keys(leadPatch).length) {
      await applyLeadPatch(t, s, call.leadId, leadPatch, { source: "call", callId: id });
    }
  });

  await recordCallInCrm(db, id);
  return requireCall(db, s, id);
}
