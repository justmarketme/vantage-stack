"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useVoiceCall } from "../../hooks/consultant/useVoiceCall";
import { useLiveTranscript } from "../../hooks/consultant/useLiveTranscript";
import { useCoachCards } from "../../hooks/consultant/useCoachCards";
import type { TranscriptSegment, CallStatus } from "../../lib/consultant/types";

/*
 * Why this lives in the consultant LAYOUT:
 * the Twilio Device and the live call are owned by `useVoiceCall()`. App Router
 * layouts persist across child navigations, so hosting the hook here means
 * tapping Call on a lead → routing to /consultant/call/[id] → wandering to the
 * pipeline and back never remounts it, and the call never drops. The live
 * transcript poller and the Coach Alex engine live here too, so the floating
 * Coach Alex widget keeps coaching on any portal page mid-call.
 *
 * Re-render budget: the timer ticks every second, so `durationSec` sits in its
 * own context — only <CallTimer> subscribes to it. Voice, transcript and coach
 * each have a memoised context, so a new card doesn't re-render the transcript
 * and a new transcript line doesn't re-render the controls.
 */

type VoiceCall = ReturnType<typeof useVoiceCall>;
export type VoiceControls = Omit<VoiceCall, "durationSec"> & {
  /** Start a call for a lead, then open the live-call screen. */
  startAndOpen: (leadId: string) => Promise<void>;
  /** The call currently shown by the provider (live, or watched by the call page). */
  callId: string | null;
  /** True from dialling until hang-up. */
  live: boolean;
  /** The last call ended and its wrap-up hasn't been saved (or skipped) yet. */
  needsWrapUp: boolean;
  markWrapped: (callId: string) => void;
};

type TranscriptState = {
  callId: string | null;
  segments: TranscriptSegment[];
};

type TranscriptStatus = {
  callId: string | null;
  status: CallStatus | null;
  ended: boolean;
  error: string | null;
};

type CoachState = ReturnType<typeof useCoachCards> & { callId: string | null };

const VoiceContext = createContext<VoiceControls | null>(null);
const DurationContext = createContext<number>(0);
const TranscriptContext = createContext<TranscriptState | null>(null);
const TranscriptStatusContext = createContext<TranscriptStatus | null>(null);
const CoachContext = createContext<CoachState | null>(null);
const WatchContext = createContext<(id: string | null) => void>(() => undefined);

export const LIVE_STATES = new Set(["connecting", "ringing", "in_progress"]);

export function VoiceCallProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const voice = useVoiceCall();
  const { durationSec, ...rest } = voice;

  // The call page "watches" a call id when this tab isn't the one dialling it
  // (e.g. opened after a reload) so its transcript still streams.
  const [watchId, setWatchId] = useState<string | null>(null);
  const live = LIVE_STATES.has(voice.state);
  // A live call always wins (its coaching must never be hijacked); otherwise
  // the call page's watched id, else the last call this tab placed.
  const callId = (live ? voice.call?.id : null) ?? watchId ?? voice.call?.id ?? null;

  const transcript = useLiveTranscript(callId, live);

  const [wrapped, setWrapped] = useState<ReadonlySet<string>>(() => new Set());
  const markWrapped = useCallback((id: string) => setWrapped((prev) => new Set(prev).add(id)), []);
  const needsWrapUp =
    !!voice.call && (voice.state === "ended" || voice.state === "error") && !wrapped.has(voice.call.id);
  const coach = useCoachCards(callId, transcript.segments);

  // Open the live-call screen as soon as the call row exists.
  const openOnStart = useRef(false);
  const currentId = voice.call?.id ?? null;
  useEffect(() => {
    if (openOnStart.current && currentId) {
      openOnStart.current = false;
      router.push(`/consultant/call/${currentId}`);
    }
  }, [currentId, router]);

  const start = voice.start;
  const startAndOpen = useCallback(
    async (leadId: string) => {
      openOnStart.current = true;
      const created = await start(leadId); // never throws; failures land in `error`
      if (!openOnStart.current) return; // the effect above already navigated
      openOnStart.current = false;
      if (created) router.push(`/consultant/call/${created.id}`);
    },
    [start, router],
  );

  // Leaving the site mid-call is guarded by the Twilio Device's own
  // `closeProtection` prompt (useVoiceCall) — no second beforeunload here.

  const voiceValue = useMemo<VoiceControls>(
    () => ({ ...rest, startAndOpen, callId, live, needsWrapUp, markWrapped }),
    // `rest` is a fresh object each render; depend on its fields instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [voice.ready, voice.state, voice.call, voice.muted, voice.error, voice.hangup, voice.toggleMute, voice.start, voice.reconnecting, voice.supported, startAndOpen, callId, live, needsWrapUp, markWrapped],
  );

  const transcriptValue = useMemo<TranscriptState>(
    () => ({ callId, segments: transcript.segments }),
    [callId, transcript.segments],
  );
  const transcriptStatusValue = useMemo<TranscriptStatus>(
    () => ({ callId, status: transcript.status, ended: transcript.ended, error: transcript.error }),
    [callId, transcript.status, transcript.ended, transcript.error],
  );

  const coachValue = useMemo<CoachState>(
    () => ({ ...coach, callId }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coach.active, coach.queue, coach.stage, coach.markUsed, coach.dismiss, coach.history, coach.critical, callId],
  );

  return (
    <WatchContext.Provider value={setWatchId}>
      <VoiceContext.Provider value={voiceValue}>
        <DurationContext.Provider value={durationSec}>
          <TranscriptStatusContext.Provider value={transcriptStatusValue}>
            <TranscriptContext.Provider value={transcriptValue}>
              <CoachContext.Provider value={coachValue}>{children}</CoachContext.Provider>
            </TranscriptContext.Provider>
          </TranscriptStatusContext.Provider>
        </DurationContext.Provider>
      </VoiceContext.Provider>
    </WatchContext.Provider>
  );
}

function must<T>(v: T | null, name: string): T {
  if (v === null) throw new Error(`${name} must be used inside <VoiceCallProvider>`);
  return v;
}

export function useCall(): VoiceControls {
  return must(useContext(VoiceContext), "useCall");
}

/** Seconds on the call. Only the timer should subscribe — it changes every second. */
export function useCallDuration(): number {
  return useContext(DurationContext);
}

export function useTranscript(): TranscriptState {
  return must(useContext(TranscriptContext), "useTranscript");
}

/** Poll status only (rarely changes) — for components that don't render lines. */
export function useTranscriptStatus(): TranscriptStatus {
  return must(useContext(TranscriptStatusContext), "useTranscriptStatus");
}

export function useCoach(): CoachState {
  return must(useContext(CoachContext), "useCoach");
}

/** The call page asks the provider to stream a call this tab isn't dialling. */
export function useWatchCall(callId: string | null): void {
  const setWatch = useContext(WatchContext);
  useEffect(() => {
    setWatch(callId);
    return () => setWatch(null);
  }, [callId, setWatch]);
}
