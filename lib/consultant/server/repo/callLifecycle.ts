import type { Sql } from "postgres";
import { consultantConfig } from "../../config";
import { normalizeE164, type CallStatus } from "../../types";
import { TIMINGS } from "../constants";
import { isUniqueViolation, txSql } from "../http";
import { isFinalStatus, statusRank } from "../voice";

/**
 * Twilio-driven call lifecycle. Every function here is called from a signature-verified
 * webhook and is idempotent: callbacks are retried and arrive out of order, so a status only
 * moves forward (statusRank), timestamps are set once (coalesce), and every write is matched
 * on BOTH our opaque callId and the Twilio parent CallSid we bound in the TwiML step — a
 * valid-but-foreign callback can't touch another call.
 */

/**
 * TwiML step: bind the Twilio parent CallSid to a call row the caller owns and that is still
 * `initiated`, and return the number to dial — the phone stored on the lead, never a value
 * from the request. A Twilio retry with the same CallSid is accepted. null → refuse the call.
 */
export async function bindTwimlCall(
  db: Sql,
  input: { callId: string; memberId: string; callSid: string },
): Promise<{ to: string } | null> {
  try {
    const rows = await db<{ phone: string | null }[]>`
      update public.consultant_calls k
      set twilio_call_sid = ${input.callSid}, to_number = c.phone, updated_at = now()
      from public.clients c
      where k.id = ${input.callId}::uuid and k.consultant_id = ${input.memberId}::uuid
        and c.id = k.client_id and c.phone is not null
        and k.status = 'initiated'
        and (k.twilio_call_sid is null or k.twilio_call_sid = ${input.callSid})
        and k.started_at > now() - make_interval(secs => ${TIMINGS.initiatedStaleSec})
      returning c.phone
    `;
    const to = rows[0]?.phone ? normalizeE164(rows[0].phone) : null;
    return to ? { to } : null;
  } catch (e) {
    if (isUniqueViolation(e)) return null; // CallSid already bound to a different call
    throw e;
  }
}

export type LifecycleResult = { found: boolean; endedNow: boolean };

/**
 * Apply a status to the call matched by (callId, parent CallSid). Final statuses stamp
 * ended_at and duration once; `in_progress` stamps answered_at once. Returns whether this
 * update is the one that ended the call (so the caller schedules the summary exactly once).
 */
export async function applyCallStatus(
  db: Sql,
  input: {
    callId: string;
    parentSid: string;
    status: CallStatus;
    childSid?: string | null;
    durationSec?: number | null;
  },
): Promise<LifecycleResult> {
  return db.begin(async (tx) => {
    const t = txSql(tx);
    const rows = await t<{ status: CallStatus; ended_at: Date | null; answered_at: Date | null }[]>`
      select status, ended_at, answered_at from public.consultant_calls
      where id = ${input.callId}::uuid and twilio_call_sid = ${input.parentSid}
      for update
    `;
    const cur = rows[0];
    if (!cur) return { found: false, endedNow: false };

    const final = isFinalStatus(input.status);
    const forward = statusRank(input.status) > statusRank(cur.status);
    const endedNow = final && !cur.ended_at;
    const answered = input.status === "in_progress";
    const duration = input.durationSec != null && Number.isFinite(input.durationSec) ? Math.max(0, Math.round(input.durationSec)) : null;

    await t`
      update public.consultant_calls set
        status = ${forward ? input.status : cur.status},
        twilio_child_sid = coalesce(twilio_child_sid, ${input.childSid ?? null}),
        answered_at = case when ${answered} then coalesce(answered_at, now()) else answered_at end,
        ended_at = case when ${final} then coalesce(ended_at, now()) else ended_at end,
        duration_sec = coalesce(duration_sec, ${final ? duration : null}::int),
        summary_status = case
          when ${final} and answered_at is null and not ${answered} and summary_status = 'pending' then 'skipped'
          -- an "answered" callback that arrives after "completed" revives the summary
          when ${answered} and answered_at is null and ended_at is not null and summary_status = 'skipped' then 'pending'
          else summary_status end,
        updated_at = now()
      where id = ${input.callId}::uuid
    `;
    return { found: true, endedNow };
  });
}

/** Recording status callback: keep the RecordingSid only once the recording is complete. */
export async function applyRecording(
  db: Sql,
  input: { callId: string; callSid: string; recordingSid: string; durationSec: number | null },
): Promise<boolean> {
  const rows = await db`
    update public.consultant_calls set
      recording_sid = ${input.recordingSid},
      recording_duration_sec = ${input.durationSec}::int,
      updated_at = now()
    where id = ${input.callId}::uuid
      and (twilio_call_sid = ${input.callSid} or twilio_child_sid = ${input.callSid})
    returning id
  `;
  return rows.length > 0;
}

/** Is (callId, CallSid) a real pairing? Used before accepting transcription events. */
export async function callMatchesSid(db: Sql, callId: string, callSid: string): Promise<boolean> {
  const rows = await db`
    select 1 from public.consultant_calls
    where id = ${callId}::uuid and (twilio_call_sid = ${callSid} or twilio_child_sid = ${callSid})
  `;
  return rows.length > 0;
}

/**
 * Sweep: force-close calls that never got a final callback (Twilio outage, lost webhook).
 * Unanswered ones are `failed`; answered ones `completed`, ended at most maxCallSec after
 * answer. Their summaries then flow through the normal pending → sweep path.
 */
export async function closeStaleCalls(db: Sql): Promise<string[]> {
  const cfg = consultantConfig();
  const windowSec = cfg.twilio.dialTimeoutSec + cfg.twilio.maxCallSec + TIMINGS.callCloseSlackSec;
  const rows = await db<{ id: string }[]>`
    update public.consultant_calls set
      status = case when answered_at is null then 'failed' else 'completed' end,
      ended_at = coalesce(ended_at, least(now(), coalesce(answered_at, started_at) + make_interval(secs => ${cfg.twilio.maxCallSec}))),
      summary_status = case when answered_at is null and summary_status = 'pending' then 'skipped' else summary_status end,
      updated_at = now()
    where status in ('initiated', 'ringing', 'in_progress')
      and (
        started_at < now() - make_interval(secs => ${windowSec})
        or (status = 'initiated' and twilio_call_sid is null and started_at < now() - make_interval(secs => ${TIMINGS.initiatedStaleSec}))
      )
    returning id::text
  `;
  return rows.map((r) => r.id);
}
