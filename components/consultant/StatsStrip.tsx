"use client";

import { memo } from "react";
import type { TodayStats } from "../../lib/consultant/types";
import { cx, fmtTalkTime } from "./utils";

/** Four numbers that matter today. Fixed height — skeleton and data occupy the same box. */
export const StatsStrip = memo(function StatsStrip({ stats }: { stats: TodayStats | undefined }) {
  const items: Array<{ label: string; value: string | null; progress?: boolean }> = [
    { label: "Dials", value: stats ? String(stats.dials) : null },
    { label: "Connects", value: stats ? String(stats.connects) : null },
    { label: "Talk time", value: stats ? fmtTalkTime(stats.talkTimeSec) : null },
    { label: "Booked", value: stats ? String(stats.discoveryBooked + stats.demosBooked) : null, progress: true },
  ];
  return (
    <dl className="grid grid-cols-4 gap-2" aria-busy={!stats}>
      {items.map((it) => (
        <div key={it.label} className="flex h-[76px] flex-col justify-center rounded-2xl bg-[--cp-surface] px-3">
          <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-[--cp-muted]">{it.label}</dt>
          <dd
            className={cx(
              "mt-1 font-heading text-2xl font-medium leading-none",
              it.progress && stats && stats.discoveryBooked + stats.demosBooked > 0 ? "text-[--cp-progress]" : "text-[--cp-text]",
            )}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {it.value ?? <span aria-hidden className="cp-skeleton inline-block h-6 w-10 rounded-md" />}
          </dd>
        </div>
      ))}
    </dl>
  );
});
