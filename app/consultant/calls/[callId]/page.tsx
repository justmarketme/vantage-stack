"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { api } from "../../../../lib/consultant/client/api";
import { useQuery } from "../../../../hooks/consultant/useQuery";
import type { CallDetail } from "../../../../lib/consultant/types";
import { useMe } from "../../../../components/consultant/MeProvider";
import { NoteList } from "../../../../components/consultant/notes/NoteList";
import { SummaryView } from "../../../../components/consultant/call/SummaryView";
import { TranscriptList } from "../../../../components/consultant/call/TranscriptList";
import { useOutboxSynced } from "../../../../components/consultant/hooks";
import { Button, ErrorState, SectionTitle, Skeleton, SURFACE, buttonClass } from "../../../../components/consultant/ui";
import { cx, describeError, DISPOSITION_LABELS, errorStatus, fmtClock, fmtDateTime, FOCUS } from "../../../../components/consultant/utils";

export default function CallReviewPage({ params }: { params: Promise<{ callId: string }> }) {
  const { callId } = use(params);
  const { me } = useMe();
  const [pollMs, setPollMs] = useState(0);
  const detail = useQuery<CallDetail>(`call:${callId}`, () => api.calls.get(callId), { refreshMs: pollMs });
  const [retrying, setRetrying] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  useOutboxSynced(() => void detail.refresh());

  const call = detail.data?.call;
  const writing = call?.summaryStatus === "pending" || call?.summaryStatus === "processing";
  useEffect(() => setPollMs(writing ? 4000 : 0), [writing]);

  if (detail.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[64px] rounded-2xl" />
        <Skeleton className="h-[180px] rounded-2xl" />
        <Skeleton className="h-[220px] rounded-2xl" />
      </div>
    );
  }
  if (!detail.data || !call) {
    const status = errorStatus(detail.error);
    return (
      <ErrorState
        message={status === 404 || status === 403 ? "This call isn't available to you." : describeError(detail.error, "load")}
        onRetry={status === 404 || status === 403 ? undefined : () => void detail.refresh()}
      />
    );
  }

  const { lead, transcript, notes } = detail.data;

  const rerun = async () => {
    setRetrying(true);
    try {
      await api.calls.summarise(callId);
      await detail.refresh();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/consultant/leads/${lead.id}`} className={buttonClass("ghost", "md", "-ml-3 mb-2")}>
          <ArrowLeft size={16} aria-hidden /> {lead.clinicName}
        </Link>
        <h1 className="font-heading text-2xl font-medium text-[--cp-text]">Call review</h1>
        <p className="mt-1 text-sm text-[--cp-muted]">
          <time dateTime={call.startedAt}>{fmtDateTime(call.startedAt)}</time>
          {call.durationSec ? ` · ${fmtClock(call.durationSec)}` : ""}
          {call.disposition ? ` · ${DISPOSITION_LABELS[call.disposition]}` : ""}
          {call.consultantName ? ` · ${call.consultantName}` : ""}
        </p>
      </div>

      <section aria-label="Recording" className={cx(SURFACE, "p-4")}>
        {call.hasRecording ? (
          <audio controls preload="metadata" src={api.calls.recordingUrl(call.id)} className="h-11 w-full">
            Your browser can't play this recording.
          </audio>
        ) : (
          <p className="text-sm text-[--cp-muted]">No recording for this call.</p>
        )}
      </section>

      {call.summary && call.summaryStatus === "ready" ? (
        <SummaryView summary={call.summary} />
      ) : (
        <section aria-live="polite" className={cx(SURFACE, "cp-edge-guide p-4")}>
          {writing ? (
            <>
              <p className="mb-3 text-sm text-[--cp-muted]">Coach Alex is writing the summary…</p>
              <Skeleton className="mb-2 h-3.5 w-full" />
              <Skeleton className="mb-2 h-3.5 w-11/12" />
              <Skeleton className="h-3.5 w-2/3" />
            </>
          ) : call.summaryStatus === "skipped" ? (
            <p className="text-sm text-[--cp-muted]">No summary — the call was too short to coach.</p>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[--cp-muted]">Coach Alex couldn't summarise this call.</p>
              {me?.canCall && (
                <Button variant="secondary" onClick={() => void rerun()} disabled={retrying}>
                  {retrying ? "Retrying…" : "Try again"}
                </Button>
              )}
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="tx-h">
        <button
          type="button"
          aria-expanded={showTranscript}
          onClick={() => setShowTranscript((v) => !v)}
          className={cx("flex min-h-11 w-full items-center justify-between rounded-xl text-left", FOCUS)}
        >
          <span id="tx-h" className="font-heading text-sm font-medium uppercase tracking-[0.14em] text-[--cp-muted]">
            Transcript · {transcript.length} lines
          </span>
          <ChevronDown size={18} aria-hidden className={cx("text-[--cp-muted] transition-transform", showTranscript && "rotate-180")} />
        </button>
        {showTranscript && (
          <div className={cx(SURFACE, "mt-2 h-[min(60vh,560px)] p-3")}>
            <TranscriptList segments={transcript} live={false} className="h-full" />
          </div>
        )}
      </section>

      <section aria-labelledby="notes-h">
        <SectionTitle>
          <span id="notes-h">Notes</span>
        </SectionTitle>
        <NoteList leadId={lead.id} callId={call.id} notes={notes} readOnly={!me?.canCall} />
      </section>
    </div>
  );
}
