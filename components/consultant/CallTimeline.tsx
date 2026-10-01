"use client";

import Link from "next/link";
import { memo } from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import { api } from "../../lib/consultant/client/api";
import type { Call } from "../../lib/consultant/types";
import { cx, DISPOSITION_LABELS, fmtClock, fmtDateTime, FOCUS } from "./utils";

const SUMMARY_STATE: Record<Call["summaryStatus"], string> = {
  pending: "Coach Alex is writing the summary…",
  processing: "Coach Alex is writing the summary…",
  ready: "",
  failed: "Summary failed — open the call to retry.",
  skipped: "No summary (call too short).",
};

/** Calls on a lead, newest first: disposition, duration, AI summary, recording. */
export const CallTimeline = memo(function CallTimeline({ calls }: { calls: Call[] }) {
  if (calls.length === 0) return <p className="text-sm text-[--cp-muted]">No calls yet.</p>;
  const sorted = [...calls].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  return (
    <ol className="space-y-2">
      {sorted.map((c) => (
        <li key={c.id} className="rounded-2xl border border-[--cp-border] bg-[--cp-surface]">
          <Link href={`/consultant/calls/${c.id}`} className={cx("flex items-start gap-3 rounded-2xl p-4", FOCUS)}>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 text-sm">
                <span className="font-medium text-[--cp-text]">
                  {c.disposition ? DISPOSITION_LABELS[c.disposition] : c.status === "failed" ? "Didn't connect" : "No outcome logged"}
                </span>
                <span className="text-[--cp-muted]">
                  · <time dateTime={c.startedAt}>{fmtDateTime(c.startedAt)}</time>
                  {c.durationSec ? ` · ${fmtClock(c.durationSec)}` : ""}
                  {c.consultantName ? ` · ${c.consultantName}` : ""}
                </span>
              </p>
              {c.summary?.summary ? (
                <p className="mt-1.5 line-clamp-3 text-sm text-[--cp-text]">
                  <Sparkles size={13} aria-hidden className="mr-1 inline text-[--cp-coach]" />
                  {c.summary.summary}
                </p>
              ) : SUMMARY_STATE[c.summaryStatus] ? (
                <p className="mt-1.5 text-sm text-[--cp-muted]">{SUMMARY_STATE[c.summaryStatus]}</p>
              ) : null}
            </div>
            <ChevronRight size={18} aria-hidden className="mt-0.5 shrink-0 text-[--cp-muted]" />
          </Link>
          {c.hasRecording && (
            <div className="px-4 pb-4">
              <audio controls preload="none" src={api.calls.recordingUrl(c.id)} className="h-11 w-full" aria-label={`Recording of call on ${fmtDateTime(c.startedAt)}`}>
                Your browser can't play this recording.
              </audio>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
});
