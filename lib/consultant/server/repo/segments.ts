import type { Sql } from "postgres";
import { consultantConfig } from "../../config";
import type { Speaker, TranscriptSegment } from "../../types";
import { txSql } from "../http";
import { toSegment, type SegmentRow } from "../mappers";
import { nudgeLater } from "../realtime";

export async function listSegments(db: Sql, callId: string, after: number): Promise<TranscriptSegment[]> {
  const rows = await db<SegmentRow[]>`
    select seq, speaker, text, at from public.consultant_call_segments
    where call_id = ${callId}::uuid and seq > ${after}
    order by seq asc
    limit ${consultantConfig().limits.listMax}
  `;
  return rows.map(toSegment);
}

/**
 * Append one final utterance with a server-assigned, gap-free, monotonic `seq`.
 *
 * Race safety: Twilio can deliver several transcription webhooks for the same call
 * concurrently. Each append runs in its own transaction that first takes the call row's lock
 * (`select … for update`), so appends for one call are serialised and the
 * `coalesce(max(seq), 0) + 1` computed inside the INSERT … SELECT always sees the previous
 * append's committed row. Appends for different calls don't contend. The (call_id, seq)
 * primary key is the backstop.
 *
 * Idempotency: Twilio retries a webhook that timed out; a retry carries the same Timestamp,
 * track and text, so an identical (speaker, at, text) row is not inserted twice.
 *
 * The (callId, Twilio CallSid) pair must match the call bound in the TwiML step.
 * Returns the new seq, or null if there is no such call / the segment was a duplicate.
 */
export async function appendSegment(
  db: Sql,
  callId: string,
  callSid: string,
  seg: { speaker: Speaker; text: string; at: Date },
): Promise<number | null> {
  const seq = await db.begin(async (tx) => {
    const t = txSql(tx);
    const locked = await t`
      select 1 from public.consultant_calls
      where id = ${callId}::uuid and (twilio_call_sid = ${callSid} or twilio_child_sid = ${callSid})
      for update
    `;
    if (!locked.length) return null;
    const rows = await t<{ seq: number }[]>`
      insert into public.consultant_call_segments (call_id, seq, speaker, text, at)
      select ${callId}::uuid, coalesce(max(s.seq), 0) + 1, ${seg.speaker}, ${seg.text}, ${seg.at}
      from public.consultant_call_segments s
      where s.call_id = ${callId}::uuid
      having not exists (
        select 1 from public.consultant_call_segments d
        where d.call_id = ${callId}::uuid and d.speaker = ${seg.speaker} and d.at = ${seg.at} and d.text = ${seg.text}
      )
      returning seq
    `;
    return rows[0]?.seq ?? null;
  });
  // Wave 2 (3A): tell the live-call view a new segment exists (a nudge only — no text).
  if (seq !== null) nudgeLater({ callId });
  return seq;
}

export async function countSegments(db: Sql, callId: string): Promise<number> {
  const rows = await db<{ n: number }[]>`
    select count(*)::int as n from public.consultant_call_segments where call_id = ${callId}::uuid
  `;
  return rows[0]?.n ?? 0;
}
