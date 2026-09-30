"use client";

import { memo } from "react";
import { cx } from "../utils";

export type VoiceState = "idle" | "connecting" | "ringing" | "in_progress" | "ended" | "error";

const LABEL: Record<VoiceState, string> = {
  idle: "Not connected",
  connecting: "Connecting…",
  ringing: "Ringing…",
  in_progress: "Live",
  ended: "Call ended",
  error: "Call failed",
};

/** Status dot + label. Live = progress green; failed = risk red; otherwise neutral. */
export const CallStatusLabel = memo(function CallStatusLabel({
  state,
  reconnecting = false,
  className,
}: {
  state: VoiceState;
  reconnecting?: boolean;
  className?: string;
}) {
  const dot =
    state === "in_progress" && !reconnecting
      ? "bg-[--cp-progress]"
      : state === "error"
        ? "bg-[--cp-risk]"
        : state === "ended" || state === "idle"
          ? "bg-[--cp-muted]"
          : "bg-[--cp-objection]";
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-sm text-[--cp-text]", className)}>
      <span aria-hidden className={cx("h-2 w-2 rounded-full", dot)} />
      {reconnecting ? "Reconnecting…" : LABEL[state]}
    </span>
  );
});

/** ● REC — shown while the call is answered (recording is from answer). */
export function RecBadge({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[--cp-risk-soft] px-2 py-0.5 text-xs font-semibold text-[--cp-risk]">
      <span aria-hidden className="cp-rec h-2 w-2 rounded-full bg-[--cp-risk]" />
      REC
      <span className="sr-only">This call is being recorded</span>
    </span>
  );
}
