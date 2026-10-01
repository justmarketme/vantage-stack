"use client";

import { memo } from "react";
import { formatZar } from "../../../lib/consultant/client/format";
import type { FunnelMetrics } from "../../../lib/consultant/types";
import { SURFACE } from "../ui";
import { cx, fmtTalkTime } from "../utils";
import { num, pct, ProgressBar, Stat } from "../wave2/parts";

type Step = { key: string; label: string; value: number; conv?: number | null; convLabel?: string; tone?: "progress" | "risk" };

function steps(m: FunnelMetrics): Step[] {
  return [
    { key: "dials", label: "Dials", value: m.dials },
    { key: "connects", label: "Answered", value: m.connects, conv: m.rates.connectRate, convLabel: "of dials" },
    { key: "conversations", label: "Conversations", value: m.conversations, conv: m.connects ? m.conversations / m.connects : null, convLabel: "of answered" },
    { key: "booked", label: "Meetings booked", value: m.meetingsBooked, conv: m.rates.connectToMeeting, convLabel: "of answered" },
    { key: "held", label: "Meetings held", value: m.meetingsHeld, conv: m.rates.showRate, convLabel: "show rate" },
    { key: "noshow", label: "No-shows", value: m.noShows, tone: "risk" },
    { key: "proposals", label: "Proposals", value: m.proposals },
    { key: "won", label: "Won", value: m.won },
    { key: "paid", label: "Paid", value: m.paid, conv: m.rates.meetingToPaid, convLabel: "of meetings held", tone: "progress" },
  ];
}

/**
 * The full funnel, dials → paid. Bars are scaled to dials so the drop-off is
 * visible at a glance (Fuselab: dense but calm); the numbers carry the detail.
 */
export const FunnelBars = memo(function FunnelBars({ m }: { m: FunnelMetrics }) {
  const max = Math.max(1, m.dials);
  return (
    <ol className={cx(SURFACE, "space-y-2.5 p-4")} aria-label="Sales funnel">
      {steps(m).map((s) => (
        <li key={s.key} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 sm:grid-cols-[9rem_1fr_7rem]">
          <span className="truncate text-sm text-[--cp-muted]">{s.label}</span>
          <ProgressBar
            value={s.value / max}
            label={`${s.label}: ${s.value}`}
            tone={s.tone === "progress" ? "progress" : s.tone === "risk" ? "risk" : "neutral"}
          />
          <span className="text-right text-sm tabular-nums">
            <span className={s.tone === "progress" ? "text-[--cp-progress]" : s.tone === "risk" ? "text-[--cp-risk]" : "text-[--cp-text]"}>{num(s.value)}</span>
            {s.conv != null && (
              <span className="block text-[11px] text-[--cp-muted]">
                {pct(s.conv)} {s.convLabel}
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
});

/**
 * The two headline ratios — a sale counts when it is PAID — against the close
 * target (30% on answered calls by default; editable by Acquisition & Creative).
 */
export function HeadlineRatios({ m, target }: { m: FunnelMetrics; target: number }) {
  const items = [
    { label: "Paid ÷ answered calls", value: m.rates.closeFromConnects, detail: `${num(m.paid)} paid of ${num(m.connects)} answered`, headline: true },
    { label: "Paid ÷ dials", value: m.rates.closeFromDials, detail: `${num(m.paid)} paid of ${num(m.dials)} dials`, headline: false },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((it) => {
        const v = it.value ?? 0;
        const hit = it.value != null && v >= target;
        return (
          <div key={it.label} className={cx(SURFACE, "min-h-[128px] p-4")}>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[--cp-muted]">{it.label}</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className={cx("font-heading text-3xl tabular-nums", hit ? "text-[--cp-progress]" : "text-[--cp-text]")}>{pct(it.value, 1)}</span>
              <span className="text-sm text-[--cp-muted]">target {pct(target)}</span>
            </p>
            <ProgressBar
              className="mt-3"
              value={v}
              marker={target}
              markerLabel={`target ${pct(target)}`}
              label={`${it.label} against the ${pct(target)} target`}
              tone={hit ? "progress" : "neutral"}
            />
            <p className="mt-1.5 text-xs text-[--cp-muted]">
              {it.detail}
              {!it.headline && " · the target is set on answered calls"}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function MoneyStats({ m }: { m: FunnelMetrics }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat label="Revenue paid" value={formatZar(m.revenuePaid)} tone={m.revenuePaid > 0 ? "progress" : undefined} />
      <Stat label="Commission" value={formatZar(m.commission)} tone={m.commission > 0 ? "progress" : undefined} />
      <Stat label="Avg sale" value={m.avgSale != null ? formatZar(m.avgSale) : "—"} />
      <Stat label="Sales cycle" value={m.salesCycleDays != null ? `${Math.round(m.salesCycleDays)} days` : "—"} hint="median, lead → paid" />
      <Stat label="Pipeline" value={formatZar(m.pipelineValue)} hint="open deals" />
      <Stat label="Weighted pipeline" value={formatZar(m.weightedPipeline)} hint="value × win chance" />
      <Stat label="Velocity" value={m.velocityPerDay != null ? `${formatZar(m.velocityPerDay)}/day` : "—"} hint="expected revenue per day" />
      <Stat label="Talk time" value={fmtTalkTime(m.talkTimeSec)} />
    </div>
  );
}
