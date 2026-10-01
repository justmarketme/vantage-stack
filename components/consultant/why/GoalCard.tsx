"use client";

import { memo } from "react";
import { CalendarDays, ImageIcon, Pencil } from "lucide-react";
import { formatSastDate, formatZar } from "../../../lib/consultant/client/format";
import type { Goal, GoalMetric } from "../../../lib/consultant/types";
import { Button, SURFACE } from "../ui";
import { cx } from "../utils";
import { num, ProgressBar } from "../wave2/parts";

export const METRIC_LABELS: Record<GoalMetric, string> = {
  commission: "Commission earned",
  revenue: "Revenue paid",
  deals_paid: "Paid deals",
  dials: "Dials",
  connects: "Answered calls",
  meetings_held: "Meetings held",
};

export const isMoneyMetric = (m: GoalMetric) => m === "commission" || m === "revenue";

export function formatMetric(m: GoalMetric, v: number): string {
  return isMoneyMetric(m) ? formatZar(v) : num(v);
}

/**
 * One Why Board goal. The image and the "why" come first (Fogg: motivation),
 * then the number and — the actionable part — what it takes per working day.
 * The image box has a fixed aspect ratio so nothing shifts when it loads.
 */
export const GoalCard = memo(function GoalCard({ goal, onEdit }: { goal: Goal; onEdit?: (g: Goal) => void }) {
  const achieved = goal.progress >= 1;
  const plan = goal.dailyPlan;
  return (
    <article className={cx(SURFACE, "flex flex-col overflow-hidden")} aria-labelledby={`goal-${goal.id}`}>
      <div className="relative aspect-[16/9] w-full bg-[--cp-surface-2]">
        {goal.imageUrl ? (
          // Short-lived signed URL from the API — a plain <img> (next/image would try to optimise/cache it).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={goal.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[--cp-muted]">
            <ImageIcon size={28} aria-hidden />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 id={`goal-${goal.id}`} className="font-heading text-lg leading-snug text-[--cp-text]">
            {goal.title}
          </h3>
          {onEdit && (
            <Button variant="ghost" className="-mr-2 -mt-1 shrink-0 px-3" onClick={() => onEdit(goal)} aria-label={`Edit ${goal.title}`}>
              <Pencil size={16} aria-hidden />
            </Button>
          )}
        </div>
        {goal.why && <p className="text-sm italic text-[--cp-muted]">&ldquo;{goal.why}&rdquo;</p>}

        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
            <span className="text-[--cp-muted]">{METRIC_LABELS[goal.metric]}</span>
            <span className="tabular-nums text-[--cp-text]">
              <span className={achieved ? "text-[--cp-progress]" : undefined}>{formatMetric(goal.metric, goal.currentValue)}</span>
              <span className="text-[--cp-muted]"> / {formatMetric(goal.metric, goal.targetValue)}</span>
            </span>
          </div>
          <ProgressBar value={goal.progress} label={`${goal.title} progress`} />
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-[--cp-muted]">
            <CalendarDays size={13} aria-hidden /> {achieved ? "Achieved" : `By ${formatSastDate(`${goal.targetDate}T12:00:00+02:00`)}`}
          </p>
        </div>

        {!achieved && plan && (
          <div className="mt-auto rounded-xl bg-[--cp-surface-2] p-3">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[--cp-muted]">What it takes per working day</p>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div className="flex flex-col-reverse">
                <dt className="text-xs text-[--cp-muted]">dials</dt>
                <dd className="font-heading text-xl tabular-nums text-[--cp-text]">{num(plan.perDay.dials)}</dd>
              </div>
              <div className="flex flex-col-reverse">
                <dt className="text-xs text-[--cp-muted]">answered</dt>
                <dd className="font-heading text-xl tabular-nums text-[--cp-text]">{num(plan.perDay.connects)}</dd>
              </div>
              <div className="flex flex-col-reverse">
                <dt className="text-xs text-[--cp-muted]">paid deals</dt>
                <dd className="font-heading text-xl tabular-nums text-[--cp-text]">{plan.perDay.deals.toFixed(2)}</dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    </article>
  );
});
