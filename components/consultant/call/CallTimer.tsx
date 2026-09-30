"use client";

import { useCallDuration } from "../VoiceCallProvider";
import { fmtClock } from "../utils";

/** The only component that re-renders every second during a call. */
export function CallTimer({ className }: { className?: string }) {
  const sec = useCallDuration();
  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }} aria-label={`Call time ${fmtClock(sec)}`} role="timer">
      {fmtClock(sec)}
    </span>
  );
}
