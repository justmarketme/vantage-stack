"use client";

import { memo, useCallback, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import type { TranscriptSegment } from "../../../lib/consultant/types";
import { cx, FOCUS } from "../utils";

const NEAR_BOTTOM_PX = 56;

const Row = memo(function Row({ seg }: { seg: TranscriptSegment }) {
  const prospect = seg.speaker === "prospect";
  return (
    <li className={cx("flex", prospect ? "justify-start" : "justify-end")}>
      <div
        className={cx(
          "max-w-[85%] rounded-2xl px-3.5 py-2",
          prospect ? "rounded-bl-md bg-[--cp-surface-2] text-[--cp-text]" : "rounded-br-md bg-[--cp-accent-soft] text-[--cp-text]",
        )}
      >
        <p className="mb-0.5 text-[11px] font-medium uppercase tracking-[0.1em] text-[--cp-muted]">{prospect ? "Clinic" : "You"}</p>
        <p className="text-[15px] leading-snug">{seg.text}</p>
      </div>
    </li>
  );
});

/**
 * Chat-style transcript: clinic left, you right. Follows the live edge while
 * you're at the bottom; scroll up to read back and a "Jump to live" button
 * appears. Rows are memoised by seq so a new line renders one row, not all.
 */
export const TranscriptList = memo(function TranscriptList({
  segments,
  live,
  className,
  emptyText = "Waiting for the first words…",
}: {
  segments: TranscriptSegment[];
  live: boolean;
  className?: string;
  emptyText?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const lastCount = useRef(segments.length);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    setFollowing(near);
    if (near) setUnseen(0);
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    const added = segments.length - lastCount.current;
    lastCount.current = segments.length;
    if (!el) return;
    if (following) el.scrollTop = el.scrollHeight;
    else if (added > 0) setUnseen((n) => n + added);
  }, [segments.length, following]);

  const jump = () => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setFollowing(true);
    setUnseen(0);
  };

  return (
    <div className={cx("relative min-h-0", className)}>
      <div ref={ref} onScroll={onScroll} className="cp-scroll-y h-full px-1" tabIndex={0} aria-label="Call transcript">
        {segments.length === 0 ? (
          <p className="py-6 text-center text-sm text-[--cp-muted]">{live ? emptyText : "No transcript for this call."}</p>
        ) : (
          <ol role="log" aria-live={live ? "polite" : "off"} aria-relevant="additions" className="space-y-2 py-2">
            {segments.map((s) => (
              <Row key={s.seq} seg={s} />
            ))}
          </ol>
        )}
      </div>
      {live && !following && (
        <button
          type="button"
          onClick={jump}
          className={cx(
            "absolute bottom-3 left-1/2 flex min-h-11 -translate-x-1/2 items-center gap-1.5 rounded-full bg-[--cp-surface-3] px-4 text-sm font-medium text-[--cp-text] shadow-[0_8px_20px_rgba(0,0,0,0.45)]",
            FOCUS,
          )}
        >
          <ArrowDown size={16} aria-hidden /> Jump to live{unseen > 0 ? ` · ${unseen} new` : ""}
        </button>
      )}
    </div>
  );
});
