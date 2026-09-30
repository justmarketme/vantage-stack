"use client";

import Link from "next/link";
import { memo, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cx, FOCUS } from "../utils";
import { CallStatusLabel, RecBadge, type VoiceState } from "./CallStatus";
import { CallTimer } from "./CallTimer";

/**
 * Sticky call bar: clinic, status dot, timer, ● REC. On desktop the controls
 * slot in on the right. The back chevron leaves the screen — the call keeps
 * running (it lives in the layout), and an "on call" bar brings you back.
 */
export const CallTopBar = memo(function CallTopBar({
  clinicName,
  leadHref,
  state,
  reconnecting,
  recording,
  showTimer,
  controls,
}: {
  clinicName: string | null;
  leadHref: string | null;
  state: VoiceState;
  reconnecting: boolean;
  recording: boolean;
  showTimer: boolean;
  controls?: ReactNode;
}) {
  return (
    <header
      className="relative z-50 flex items-center gap-2 border-b border-[--cp-border] bg-[--cp-bg] px-2 pb-2 lg:px-4"
      style={{ paddingTop: "calc(0.5rem + var(--cp-safe-top))" }}
    >
      {leadHref && (
        <Link
          href={leadHref}
          aria-label="Open the clinic (the call keeps running)"
          className={cx("inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[--cp-muted] hover:text-[--cp-text]", FOCUS)}
        >
          <ChevronLeft size={22} aria-hidden />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-heading text-base font-medium text-[--cp-text] lg:text-lg">
          {clinicName ?? <span className="cp-skeleton inline-block h-4 w-32 rounded" aria-label="Loading clinic" />}
        </h1>
        <p className="flex items-center gap-2 text-sm">
          <CallStatusLabel state={state} reconnecting={reconnecting} />
          {showTimer && <CallTimer className="text-[--cp-muted]" />}
        </p>
      </div>
      <RecBadge on={recording} />
      {controls && <div className="ml-2 hidden lg:block">{controls}</div>}
    </header>
  );
});
