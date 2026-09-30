/**
 * Pure helpers for live transcript polling (unit-tested; used by useLiveTranscript).
 */

import type { TranscriptSegment } from "../types";

/**
 * Append `incoming` to `existing`, de-duplicated by `seq`, ascending.
 * Returns the SAME array reference when nothing new arrived, so React can
 * skip the re-render (no transcript jitter on empty polls).
 */
export function mergeSegments(existing: TranscriptSegment[], incoming: TranscriptSegment[]): TranscriptSegment[] {
  if (!incoming || incoming.length === 0) return existing;
  const last = existing.length ? existing[existing.length - 1].seq : -Infinity;
  // Fast path: strictly-increasing tail append (the normal case).
  let inOrder = true;
  let prev = last;
  for (const s of incoming) {
    if (s.seq <= prev) {
      inOrder = false;
      break;
    }
    prev = s.seq;
  }
  if (inOrder) return existing.concat(incoming);

  const seen = new Set(existing.map((s) => s.seq));
  const fresh: TranscriptSegment[] = [];
  for (const s of incoming) {
    if (seen.has(s.seq)) continue;
    seen.add(s.seq);
    fresh.push(s);
  }
  if (fresh.length === 0) return existing;
  return existing.concat(fresh).sort((a, b) => a.seq - b.seq);
}

/** Highest seq in a list (0 when empty). */
export function maxSeq(segments: TranscriptSegment[], fallback = 0): number {
  let m = fallback;
  for (const s of segments) if (s.seq > m) m = s.seq;
  return m;
}

/** Exponential backoff for poll errors: base·2^failures, capped. */
export function backoffDelay(baseMs: number, failures: number, capMs = 15_000): number {
  if (failures <= 0) return baseMs;
  return Math.min(capMs, baseMs * 2 ** Math.min(failures, 10));
}

/** HTTP statuses where polling again cannot help. */
export function isFatalPollStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 404;
}
