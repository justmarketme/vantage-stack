"use client";

import { memo } from "react";
import { Mic, MicOff, NotebookPen, PhoneOff } from "lucide-react";
import { cx, FOCUS } from "../utils";

/**
 * Mute · Note · Hang up. Phone: a fixed bar in the thumb zone with Hang up the
 * widest, red target. Desktop: the same three, inline in the top bar.
 */
export const CallControls = memo(function CallControls({
  muted,
  canControl,
  onMute,
  onNote,
  onHangup,
  layout,
}: {
  muted: boolean;
  canControl: boolean;
  onMute: () => void;
  onNote: () => void;
  onHangup: () => void;
  layout: "bar" | "inline";
}) {
  const bar = layout === "bar";
  const base = cx(
    "inline-flex items-center justify-center gap-2 font-medium transition-[filter,background-color] disabled:opacity-50",
    FOCUS,
    bar ? "min-h-16 flex-col rounded-2xl text-xs" : "min-h-11 rounded-xl px-4 text-sm",
  );
  const secondary = "bg-[--cp-surface-2] text-[--cp-text] hover:bg-[--cp-surface-3]";

  return (
    <div className={bar ? "grid grid-cols-[1fr_1fr_1.7fr] gap-2" : "flex items-center gap-2"}>
      <button
        type="button"
        onClick={onMute}
        disabled={!canControl}
        aria-pressed={muted}
        className={cx(base, muted ? "bg-[--cp-accent-soft] text-[--cp-accent-text]" : secondary)}
      >
        {muted ? <MicOff size={bar ? 24 : 18} aria-hidden /> : <Mic size={bar ? 24 : 18} aria-hidden />}
        {muted ? "Unmute" : "Mute"}
      </button>
      <button type="button" onClick={onNote} className={cx(base, secondary)}>
        <NotebookPen size={bar ? 24 : 18} aria-hidden />
        Note
      </button>
      <button
        type="button"
        onClick={onHangup}
        disabled={!canControl}
        className={cx(base, "bg-[--cp-risk-strong] text-[--cp-on-strong] hover:brightness-110", bar ? "text-sm" : "px-5")}
      >
        <PhoneOff size={bar ? 28 : 18} aria-hidden />
        Hang up
      </button>
    </div>
  );
});
