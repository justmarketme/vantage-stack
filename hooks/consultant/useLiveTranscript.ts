"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiClientError } from "../../lib/consultant/client/api";
import { backoffDelay, isFatalPollStatus, liveBackstopMs, maxSeq, mergeSegments } from "../../lib/consultant/client/live";
import type { RealtimeStatus } from "../../lib/consultant/client/realtime";
import type { CallStatus, TranscriptSegment } from "../../lib/consultant/types";
import { useRealtimeNudge } from "./useRealtimeNudge";

/**
 * Polls `GET calls/[id]/live?after=<seq>` and accumulates transcript segments.
 *
 * - Default interval 1000ms (`pollMs` option; the server's `cfg.live.pollMs`
 *   can be passed through). setTimeout chain — polls never overlap.
 * - Segments de-duplicated by seq; empty polls don't re-render.
 * - When the server says `ended`, one final fetch (after `finalDelayMs`, so
 *   late transcription callbacks land) and then polling stops.
 * - Errors back off exponentially (cap 15s); 401/403/404 stop polling.
 * - Hidden tab: pauses ONLY when `active` is false. A live call keeps polling
 *   in the background so coaching is current the moment the rep looks back.
 *
 * Wave 2 — realtime nudges: the hook also listens on `<prefix>:call:<id>`.
 * A nudge ("new segment") triggers a fetch IMMEDIATELY (never overlapping one
 * already on the wire — it queues exactly one follow-up instead). While the
 * socket is live, polling slows to a backstop (`backstopMs`, default 5× pollMs,
 * min 5s) in case a nudge is lost; if realtime is unavailable or drops, polling
 * returns to `pollMs` at once.
 */

export interface UseLiveTranscriptOptions {
  pollMs?: number;
  finalDelayMs?: number;
  /** Poll interval while realtime nudges are live. Default max(5s, 5 × pollMs). */
  backstopMs?: number;
}

export interface UseLiveTranscriptResult {
  segments: TranscriptSegment[];
  status: CallStatus | null;
  ended: boolean;
  /** Additive: last poll error message (cleared on the next success). */
  error: string | null;
  /** Additive (wave 2): realtime nudge state — "live" means polling is only a backstop. */
  realtime: RealtimeStatus;
}

export function useLiveTranscript(
  callId: string | null,
  active: boolean,
  opts: UseLiveTranscriptOptions = {},
): UseLiveTranscriptResult {
  const pollMs = Math.max(250, opts.pollMs ?? 1000);
  const finalDelayMs = opts.finalDelayMs ?? 2000;
  const backstopMs = liveBackstopMs(pollMs, opts.backstopMs);

  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [status, setStatus] = useState<CallStatus | null>(null);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeRef = useRef(active);
  activeRef.current = active;
  const resumeRef = useRef<(() => void) | null>(null);
  /** Set by the polling effect: "fetch now" (used by nudges + realtime drops). */
  const kickRef = useRef<(() => void) | null>(null);

  const realtime = useRealtimeNudge(callId ? { callId } : null, () => kickRef.current?.());
  const liveRef = useRef(realtime === "live");
  liveRef.current = realtime === "live";

  useEffect(() => {
    setSegments([]);
    setStatus(null);
    setEnded(false);
    setError(null);
    if (!callId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let ctrl: AbortController | null = null;
    let after = 0;
    let failures = 0;
    let endedSeen = false;
    let paused = false;
    let inflight = false;
    let pendingKick = false;

    /** Normal cadence: slow backstop while nudges are live, else pollMs. */
    const interval = () => (liveRef.current ? backstopMs : pollMs);

    const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";

    const schedule = (ms: number) => {
      if (cancelled) return;
      timer = setTimeout(poll, ms);
    };

    const poll = async () => {
      timer = null;
      if (cancelled) return;
      if (!activeRef.current && hidden() && !endedSeen) {
        paused = true; // resumed by visibilitychange
        return;
      }
      ctrl = new AbortController();
      inflight = true;
      try {
        const res = await api.calls.live(callId, after, { signal: ctrl.signal, timeoutMs: 10_000 });
        inflight = false;
        if (cancelled) return;
        failures = 0;
        setError(null);
        if (res.segments?.length) {
          setSegments((prev) => mergeSegments(prev, res.segments));
        }
        after = Math.max(after, res.lastSeq ?? 0, maxSeq(res.segments ?? []));
        setStatus((s) => (s === res.status ? s : res.status));
        if (res.ended) {
          if (endedSeen) {
            setEnded(true);
            return; // final fetch done → stop
          }
          endedSeen = true;
          pendingKick = false;
          schedule(finalDelayMs);
          return;
        }
        // A nudge that arrived mid-request may describe a segment this response missed.
        const again = pendingKick;
        pendingKick = false;
        schedule(again ? 0 : interval());
      } catch (e) {
        inflight = false;
        pendingKick = false;
        if (cancelled) return;
        const status = e instanceof ApiClientError ? e.status : 0;
        if (e instanceof ApiClientError) setError(e.error);
        if (isFatalPollStatus(status)) return;
        if (endedSeen) {
          // Final fetch failed; still mark ended rather than poll forever.
          setEnded(true);
          return;
        }
        failures += 1;
        schedule(backoffDelay(pollMs, failures));
      }
    };

    const onVisibility = () => {
      if (!hidden() && paused && !cancelled) {
        paused = false;
        schedule(0);
      }
    };
    const onOnline = () => {
      if (timer && failures > 0) {
        clearTimeout(timer);
        failures = 0;
        schedule(0);
      }
    };
    resumeRef.current = () => {
      if (paused && !cancelled) {
        paused = false;
        schedule(0);
      }
    };
    kickRef.current = () => {
      // Ignored while paused (hidden + inactive), after the final fetch, or
      // during error backoff (the backoff owns the timing then).
      if (cancelled || paused || endedSeen || failures > 0) return;
      if (inflight) {
        pendingKick = true;
        return;
      }
      if (timer) clearTimeout(timer);
      timer = null;
      schedule(0);
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    schedule(0);

    return () => {
      cancelled = true;
      resumeRef.current = null;
      kickRef.current = null;
      if (timer) clearTimeout(timer);
      ctrl?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [callId, pollMs, finalDelayMs, backstopMs]);

  // Realtime dropped → the next poll may be a slow backstop away; fetch now and
  // fall back to the normal cadence from there.
  const prevRealtime = useRef(realtime);
  useEffect(() => {
    if (prevRealtime.current === "live" && realtime !== "live") kickRef.current?.();
    prevRealtime.current = realtime;
  }, [realtime]);

  // A call becoming active while the tab is hidden must resume polling.
  useEffect(() => {
    if (active) resumeRef.current?.();
  }, [active]);

  return { segments, status, ended, error, realtime };
}
