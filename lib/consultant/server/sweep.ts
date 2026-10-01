import type { Sql } from "postgres";
import { consultantConfig } from "../config";
import { TIMINGS } from "./constants";
import { logError } from "./http";
import { closeStaleCalls } from "./repo/callLifecycle";
import { summariseCall } from "./summarise";
import { deleteRecording } from "./voice";

export type SweepReport = {
  closedCalls: number;
  releasedSummaries: number;
  summarised: Record<string, number>;
  recordingsDeleted: number;
  recordingDeleteFailures: number;
  transcriptsPurged: number;
};

/**
 * The consultant-sweep cron (every 5 min). Each step is idempotent and bounded per run:
 *  1. close calls that never received a final Twilio callback;
 *  2. release summaries stuck in `processing` (crashed worker) back to `failed`;
 *  3. retention — delete Twilio recordings older than cfg.retention.recordingDays (then null
 *     recording_sid), and transcript segments older than cfg.retention.transcriptDays.
 *     Summaries and notes stay;
 *  4. summarise ended calls still `pending` / `failed` under cfg.ai.maxSummaryAttempts, within
 *     a time budget so the run finishes inside the route's maxDuration.
 */
export async function runConsultantSweep(db: Sql): Promise<SweepReport> {
  const cfg = consultantConfig();
  const report: SweepReport = {
    closedCalls: 0,
    releasedSummaries: 0,
    summarised: {},
    recordingsDeleted: 0,
    recordingDeleteFailures: 0,
    transcriptsPurged: 0,
  };

  report.closedCalls = (await closeStaleCalls(db)).length;

  const released = await db`
    update public.consultant_calls set summary_status = 'failed', updated_at = now()
    where summary_status = 'processing' and updated_at < now() - make_interval(secs => ${TIMINGS.processingTimeoutSec})
    returning id
  `;
  report.releasedSummaries = released.length;

  const oldRecordings = await db<{ id: string; recording_sid: string }[]>`
    select id::text, recording_sid from public.consultant_calls
    where recording_sid is not null
      and coalesce(ended_at, started_at) < now() - make_interval(days => ${cfg.retention.recordingDays})
    order by coalesce(ended_at, started_at) asc
    limit ${TIMINGS.retentionRecordingBatch}
  `;
  for (const r of oldRecordings) {
    try {
      if (await deleteRecording(cfg, r.recording_sid)) {
        await db`
          update public.consultant_calls set recording_sid = null, updated_at = now()
          where id = ${r.id}::uuid and recording_sid = ${r.recording_sid}
        `;
        report.recordingsDeleted++;
      } else {
        report.recordingDeleteFailures++;
      }
    } catch (e) {
      report.recordingDeleteFailures++;
      logError("sweep.deleteRecording", e);
    }
  }

  const purged = await db<{ call_id: string }[]>`
    delete from public.consultant_call_segments s
    where s.call_id in (
      select k.id from public.consultant_calls k
      where coalesce(k.ended_at, k.started_at) < now() - make_interval(days => ${cfg.retention.transcriptDays})
        and exists (select 1 from public.consultant_call_segments x where x.call_id = k.id)
      limit ${TIMINGS.retentionTranscriptBatch}
    )
    returning s.call_id::text
  `;
  report.transcriptsPurged = new Set(purged.map((p) => p.call_id)).size;

  const due = await db<{ id: string }[]>`
    select id::text from public.consultant_calls
    where summary_status in ('pending', 'failed') and summary_attempts < ${cfg.ai.maxSummaryAttempts}
      and ended_at is not null and ended_at < now() - make_interval(secs => ${TIMINGS.summariseGraceMs / 1000})
    order by ended_at asc
    limit ${TIMINGS.sweepBatch}
  `;
  const started = Date.now();
  for (const { id } of due) {
    if (Date.now() - started > TIMINGS.sweepSummariseBudgetMs) break;
    const status = await summariseCall(db, id);
    const key = status ?? "not_claimed";
    report.summarised[key] = (report.summarised[key] ?? 0) + 1;
  }

  return report;
}
