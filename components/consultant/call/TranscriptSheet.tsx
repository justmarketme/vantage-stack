"use client";

import { memo, useState } from "react";
import { motion, useReducedMotion, type PanInfo } from "framer-motion";
import { ChevronUp } from "lucide-react";
import type { TranscriptSegment } from "../../../lib/consultant/types";
import { cx, FOCUS } from "../utils";
import { TranscriptList } from "./TranscriptList";

/** Height of the collapsed sheet — the call page reserves exactly this much. */
export const TRANSCRIPT_PEEK_PX = 92;

/**
 * Phone transcript: a bottom sheet that peeks the last two lines. Tap the
 * handle (or drag up) to expand to most of the screen; drag down / tap to close.
 */
export const TranscriptSheet = memo(function TranscriptSheet({
  segments,
  live,
  bottomOffset,
}: {
  segments: TranscriptSegment[];
  live: boolean;
  /** CSS length: the controls bar height below the sheet. */
  bottomOffset: string;
}) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const last = segments.slice(-2);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y < -32) setOpen(true);
    else if (info.offset.y > 32) setOpen(false);
  };

  return (
    <motion.section
      aria-label="Live transcript"
      className="absolute inset-x-0 z-30 flex flex-col rounded-t-3xl border-t border-[--cp-border-strong] bg-[--cp-surface]"
      style={{ bottom: bottomOffset }}
      initial={false}
      animate={{ height: open ? "min(68dvh, 560px)" : TRANSCRIPT_PEEK_PX }}
      transition={{ duration: reduce ? 0 : 0.24, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <motion.button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        drag={reduce ? false : "y"}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.2}
        onDragEnd={onDragEnd}
        className={cx("flex w-full touch-none flex-col items-stretch px-4 pt-2 text-left", FOCUS)}
      >
        <span className="mx-auto mb-1.5 h-1 w-10 rounded-full bg-[--cp-surface-3]" aria-hidden />
        <span className="flex items-center justify-between text-xs font-medium uppercase tracking-[0.12em] text-[--cp-muted]">
          Transcript
          <ChevronUp size={16} aria-hidden className={cx("transition-transform", open && "rotate-180")} />
        </span>
        <span className="sr-only">{open ? "Collapse transcript" : "Expand transcript"}</span>
        {!open && (
          <span className="mt-1 block space-y-0.5" aria-hidden>
            {last.length === 0 ? (
              <span className="block truncate text-sm text-[--cp-muted]">{live ? "Waiting for the first words…" : "No transcript"}</span>
            ) : (
              last.map((s) => (
                <span key={s.seq} className="block truncate text-sm text-[--cp-text]">
                  <span className="text-[--cp-muted]">{s.speaker === "prospect" ? "Clinic: " : "You: "}</span>
                  {s.text}
                </span>
              ))
            )}
          </span>
        )}
      </motion.button>
      {open ? (
        <TranscriptList segments={segments} live={live} className="flex-1 px-3 pb-2" />
      ) : (
        <p className="sr-only" aria-live={live ? "polite" : "off"}>
          {last.length ? `${last[last.length - 1].speaker === "prospect" ? "Clinic" : "You"}: ${last[last.length - 1].text}` : ""}
        </p>
      )}
    </motion.section>
  );
});
