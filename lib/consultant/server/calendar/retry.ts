import type { Sql } from "postgres";
import { consultantConfig } from "../../config";
import type { CalendarProvider } from "../../types";
import { errorTag } from "../http";
import { CALENDAR } from "./constants";
import { syncMeetingProvider } from "./sync";

/**
 * 3B → 3A seam: retries calendar syncs that are pending or failed. Called by the dispatch cron
 * (`GET /api/cron/consultant-dispatch`, every minute). Never throws.
 *
 * A row is due when:
 * - it is `pending` and at least `inlineGraceSec` old (the request that queued it had its
 *   chance to sync inline — this is the "process died before syncing" backstop), or
 * - it is `failed`, below `cfg.calendar.maxSyncAttempts`, and its backoff has elapsed:
 *   base × 2^(attempts-1) seconds after the last attempt, capped at retryMaxSec.
 *
 * Due rows are CLAIMED atomically (updated_at bumped under FOR UPDATE SKIP LOCKED), so two
 * overlapping cron runs never work the same row, and a claimed row isn't due again until its
 * next backoff window.
 */
const INLINE_GRACE_SEC = 30;

export async function retryCalendarSync(db: Sql, limit: number): Promise<{ attempted: number; synced: number; failed: number }> {
  const result = { attempted: 0, synced: 0, failed: 0 };
  const max = consultantConfig().calendar.maxSyncAttempts;
  let claimed: { meeting_id: string; provider: CalendarProvider }[];
  try {
    claimed = await db<{ meeting_id: string; provider: CalendarProvider }[]>`
      update public.consultant_meeting_sync s set updated_at = now()
      from (
        select meeting_id, provider from public.consultant_meeting_sync
        where (status = 'pending' and updated_at < now() - make_interval(secs => ${INLINE_GRACE_SEC}))
           or (status = 'failed' and attempts < ${max}
               and updated_at + make_interval(secs => least(${CALENDAR.retryMaxSec}::float8,
                     ${CALENDAR.retryBaseSec}::float8 * power(2, greatest(attempts, 1) - 1))) <= now())
        order by updated_at asc
        limit ${Math.max(1, limit)}
        for update skip locked
      ) due
      where s.meeting_id = due.meeting_id and s.provider = due.provider
      returning s.meeting_id::text, s.provider
    `;
  } catch (e) {
    console.warn("[consultant] calendar retry claim failed", errorTag(e));
    return result;
  }

  for (const row of claimed) {
    result.attempted++;
    const outcome = await syncMeetingProvider(db, row.meeting_id, row.provider);
    if (outcome === "synced") result.synced++;
    else if (outcome === "failed") result.failed++;
  }
  return result;
}
