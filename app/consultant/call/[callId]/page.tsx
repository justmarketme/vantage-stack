"use client";

import Link from "next/link";
import { use, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../../../lib/consultant/client/api";
import { useQuery } from "../../../../hooks/consultant/useQuery";
import { useNoteDraft } from "../../../../hooks/consultant/useNoteDraft";
import { useWakeLock } from "../../../../hooks/consultant/useWakeLock";
import type { CallDetail } from "../../../../lib/consultant/types";
import {
  useCall,
  useCallDuration,
  useTranscript,
  useTranscriptStatus,
  useWatchCall,
} from "../../../../components/consultant/VoiceCallProvider";
import { CoachFocus } from "../../../../components/consultant/coach/CoachFocus";
import { CoachPanel } from "../../../../components/consultant/coach/CoachPanel";
import { CallControls } from "../../../../components/consultant/call/CallControls";
import { CallTopBar } from "../../../../components/consultant/call/CallTopBar";
import type { VoiceState } from "../../../../components/consultant/call/CallStatus";
import { LeadBrief } from "../../../../components/consultant/call/LeadBrief";
import { TranscriptList } from "../../../../components/consultant/call/TranscriptList";
import { TRANSCRIPT_PEEK_PX, TranscriptSheet } from "../../../../components/consultant/call/TranscriptSheet";
import { callNoteKey, WrapUpSheet } from "../../../../components/consultant/call/WrapUpSheet";
import { useIsDesktop } from "../../../../components/consultant/hooks";
import { NoteEditor } from "../../../../components/consultant/notes/NoteEditor";
import { Sheet } from "../../../../components/consultant/Sheet";
import { Button, buttonClass, SURFACE } from "../../../../components/consultant/ui";
import { cx } from "../../../../components/consultant/utils";

/** Phone controls bar: 8px top + 64px buttons + 12px bottom (+ home indicator). */
const CONTROLS_H = "calc(84px + var(--cp-safe-bottom))";

/*
 * LIVE CALL — the heart of the portal.
 *
 * Render budget: this page subscribes only to voice state (changes a handful
 * of times per call) and transcript *status*. Transcript lines, Coach Alex
 * cards and the timer each re-render only their own component.
 */
export default function LiveCallPage({ params }: { params: Promise<{ callId: string }> }) {
  const { callId } = use(params);
  const router = useRouter();
  const voice = useCall();
  const tStatus = useTranscriptStatus();
  const isDesktop = useIsDesktop();

  const isThisCall = voice.call?.id === callId;
  const busyElsewhere = voice.live && !!voice.call && !isThisCall;
  // Not dialled from this tab (reload / other tab): follow its transcript read-only.
  useWatchCall(isThisCall || busyElsewhere ? null : callId);

  const detail = useQuery<CallDetail>(`call:${callId}`, () => api.calls.get(callId));
  const lead = detail.data?.lead;

  const watchedEnded = !isThisCall && (tStatus.ended || tStatus.status === "completed" || tStatus.status === "failed");
  const state: VoiceState = isThisCall
    ? voice.state
    : watchedEnded
      ? "ended"
      : tStatus.status === "in_progress"
        ? "in_progress"
        : tStatus.status === "ringing"
          ? "ringing"
          : "connecting";
  const live = isThisCall ? voice.live : !watchedEnded;
  const canControl = isThisCall && voice.live;

  useWakeLock(live);

  const [noteOpen, setNoteOpen] = useState(false);
  const [wrapOpenManual, setWrapOpenManual] = useState(false);
  const [wrapDismissed, setWrapDismissed] = useState(false);
  // Opens by itself on hang-up; can be closed and reopened from the Wrap up button.
  const wrapOpen = isThisCall && voice.needsWrapUp && ((voice.state === "ended" && !wrapDismissed) || wrapOpenManual);
  const closeWrap = useCallback(() => {
    setWrapDismissed(true);
    setWrapOpenManual(false);
  }, []);

  const finishWrap = useCallback(
    (next: "today" | "review") => {
      voice.markWrapped(callId);
      router.push(next === "today" ? "/consultant" : `/consultant/calls/${callId}`);
    },
    [voice, callId, router],
  );

  const openNote = useCallback(() => setNoteOpen(true), []);
  const closeNote = useCallback(() => setNoteOpen(false), []);

  if (busyElsewhere && voice.call) {
    return (
      <Centered>
        <p className="text-[--cp-text]">You're on another call right now.</p>
        <Link href={`/consultant/call/${voice.call.id}`} className={buttonClass("primary", "lg")}>
          Back to the live call
        </Link>
      </Centered>
    );
  }
  if (detail.error && !detail.data && !isThisCall) {
    return (
      <Centered>
        <p className="text-[--cp-text]">This call couldn't be found.</p>
        <Link href="/consultant" className={buttonClass("secondary", "lg")}>
          Back to Today
        </Link>
      </Centered>
    );
  }

  const controls = (
    <CallControls
      muted={voice.muted}
      canControl={canControl}
      onMute={voice.toggleMute}
      onNote={openNote}
      onHangup={voice.hangup}
      layout={isDesktop ? "inline" : "bar"}
    />
  );

  const failed = isThisCall && voice.state === "error";
  const afterCall = (withWrapUp: boolean) => (
    <AfterCall
      failed={failed}
      error={voice.error}
      watched={!isThisCall}
      callId={callId}
      leadId={lead?.id ?? null}
      onWrapUp={withWrapUp && isThisCall && voice.needsWrapUp ? () => setWrapOpenManual(true) : undefined}
      onRetry={
        failed && lead
          ? () => {
              voice.markWrapped(callId);
              void voice.startAndOpen(lead.id);
            }
          : undefined
      }
    />
  );

  const topBar = (
    <CallTopBar
      clinicName={lead?.clinicName ?? null}
      leadHref={lead ? `/consultant/leads/${lead.id}` : null}
      state={state}
      reconnecting={isThisCall && voice.reconnecting}
      recording={state === "in_progress"}
      showTimer={isThisCall && state !== "idle" && state !== "connecting"}
      controls={isDesktop && canControl ? controls : undefined}
    />
  );

  return (
    <>
      {isDesktop ? (
        <div className="flex h-[100dvh] flex-col">
          {topBar}
          {!isThisCall && live && <WatchNotice />}
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(240px,300px)_minmax(0,1fr)_minmax(340px,420px)] gap-4 p-4">
            <LeadBrief lead={lead} />
            <section aria-labelledby="tx-h" className={cx(SURFACE, "flex min-h-0 flex-col p-3")}>
              <h2 id="tx-h" className="px-1 pb-2 text-xs font-medium uppercase tracking-[0.12em] text-[--cp-muted]">
                Live transcript
              </h2>
              <LiveTranscript live={live} className="flex-1" />
              {!live && <div className="border-t border-[--cp-border] pt-3">{afterCall(true)}</div>}
            </section>
            <aside className="min-h-0">
              <CoachPanel />
            </aside>
          </div>
        </div>
      ) : (
        <div className="fixed inset-0 flex flex-col bg-[--cp-bg]">
          {topBar}
          {!isThisCall && live && <WatchNotice />}
          {/* Reserved Coach Alex area: fixed between the call bar and the transcript peek. */}
          <main className="min-h-0 flex-1 px-3 pt-3" style={{ paddingBottom: TRANSCRIPT_PEEK_PX + 12 }}>
            {live ? <CoachFocus /> : afterCall(false)}
          </main>
          <PhoneTranscript live={live} bottomOffset={CONTROLS_H} />
          <div
            className="relative z-50 border-t border-[--cp-border] bg-[--cp-bg] px-3 pt-2"
            style={{ height: CONTROLS_H, paddingBottom: "calc(12px + var(--cp-safe-bottom))" }}
          >
            {canControl ? (
              controls
            ) : isThisCall && voice.needsWrapUp ? (
              <Button variant="primary" size="xl" className="h-16 w-full" onClick={() => setWrapOpenManual(true)}>
                Wrap up
              </Button>
            ) : (
              <Link href={`/consultant/calls/${callId}`} className={buttonClass("secondary", "xl", "h-16 w-full")}>
                Open call review
              </Link>
            )}
          </div>
        </div>
      )}

      <QuickNote callId={callId} open={noteOpen} onClose={closeNote} />
      {isThisCall && (
        <WrapUpSheetWithDuration open={wrapOpen} callId={callId} detail={detail.data} onDone={finishWrap} onClose={closeWrap} />
      )}
    </>
  );
}

function LiveTranscript({ live, className }: { live: boolean; className?: string }) {
  const { segments } = useTranscript();
  return <TranscriptList segments={segments} live={live} className={className} />;
}

function PhoneTranscript({ live, bottomOffset }: { live: boolean; bottomOffset: string }) {
  const { segments } = useTranscript();
  return <TranscriptSheet segments={segments} live={live} bottomOffset={bottomOffset} />;
}

function WrapUpSheetWithDuration({
  open,
  callId,
  detail,
  onDone,
  onClose,
}: {
  open: boolean;
  callId: string;
  detail: CallDetail | undefined;
  onDone: (next: "today" | "review") => void;
  onClose: () => void;
}) {
  const sec = useCallDuration();
  return <WrapUpSheet open={open} callId={callId} lead={detail?.lead} durationSec={sec} onDone={onDone} onClose={onClose} />;
}

/** Mid-call note: writes to the same on-device draft the wrap-up sheet saves. */
function QuickNote({ callId, open, onClose }: { callId: string; open: boolean; onClose: () => void }) {
  const { draft, setDraft, savedAt } = useNoteDraft(callNoteKey(callId));
  return (
    <Sheet
      open={open}
      title="Quick note"
      onClose={onClose}
      footer={
        <Button variant="primary" size="lg" className="w-full" onClick={onClose}>
          Done
        </Button>
      }
    >
      <NoteEditor
        value={draft}
        onChange={setDraft}
        autoFocus
        rows={5}
        label="Quick note"
        placeholder="Decision maker, pain points, prices mentioned…"
        status={draft && savedAt ? "Saved on this device · added to your wrap-up" : "Added to your wrap-up when you hang up"}
      />
    </Sheet>
  );
}

function WatchNotice() {
  return (
    <p className="relative z-50 bg-[--cp-surface] px-4 py-2 text-xs text-[--cp-muted]">
      This call's audio is in another tab or was interrupted by a reload — you can follow the transcript and coaching here.
    </p>
  );
}

function AfterCall({
  failed,
  error,
  watched,
  callId,
  leadId,
  onWrapUp,
  onRetry,
}: {
  failed: boolean;
  error: string | null;
  watched: boolean;
  callId: string;
  leadId: string | null;
  onWrapUp?: () => void;
  onRetry?: () => void;
}) {
  return (
    <div className="flex h-full flex-col justify-center gap-3 py-4">
      {failed ? (
        <div role="alert" className="rounded-2xl bg-[--cp-risk-soft] p-4">
          <p className="font-medium text-[--cp-text]">The call didn't connect</p>
          <p className="mt-1 text-sm text-[--cp-text]">{error ?? "Try again in a moment."}</p>
        </div>
      ) : (
        <p className="text-center text-[--cp-muted]">{watched ? "This call has ended." : "Call ended."}</p>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        {onRetry && (
          <Button variant="primary" size="lg" onClick={onRetry}>
            Try again
          </Button>
        )}
        {onWrapUp && (
          <Button variant={failed ? "secondary" : "primary"} size="lg" onClick={onWrapUp}>
            {failed ? "Log outcome" : "Wrap up"}
          </Button>
        )}
        {watched && (
          <Link href={`/consultant/calls/${callId}`} className={buttonClass("secondary", "lg")}>
            Open call review
          </Link>
        )}
        {leadId && (
          <Link href={`/consultant/leads/${leadId}`} className={buttonClass("ghost", "lg")}>
            Back to clinic
          </Link>
        )}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 p-6 text-center">{children}</div>;
}
