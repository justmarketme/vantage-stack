"use client";

import { ChevronDown } from "lucide-react";
import { formatZar } from "../../../lib/consultant/client/format";
import type { DealScore } from "../../../lib/consultant/types";
import { SURFACE } from "../ui";
import { cx, FOCUS } from "../utils";
import { Chip, pct, type ChipTone } from "../wave2/parts";

/*
 * Churn band uses the deal-health scale (Red / Yellow / Green) because that is
 * exactly what it is: how likely this deal is to stall. Label always shown.
 */
const BAND: Record<DealScore["churnBand"], { label: string; tone: ChipTone }> = {
  low: { label: "Low churn risk", tone: "progress" },
  medium: { label: "Medium churn risk", tone: "health-yellow" },
  high: { label: "High churn risk", tone: "risk" },
};

/**
 * Explainable deal score (Andrew Ng: lightweight, explainable). The headline
 * numbers are visible; the "why" (top factors) sits behind a disclosure so
 * the workspace stays calm (Norman: progressive disclosure).
 */
export function DealScorePanel({ score }: { score: DealScore | undefined }) {
  if (!score) return null;
  const top = [...score.factors].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)).slice(0, 3);
  return (
    <section aria-labelledby="score-h" className={cx(SURFACE, "p-4")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="score-h" className="text-xs font-medium uppercase tracking-[0.12em] text-[--cp-muted]">
          Deal score
        </h2>
        <Chip tone={BAND[score.churnBand].tone}>{BAND[score.churnBand].label}</Chip>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <dt className="text-xs text-[--cp-muted]">Win probability</dt>
          <dd className="font-heading text-xl tabular-nums text-[--cp-text]">{pct(score.winProbability)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[--cp-muted]">Lifetime value</dt>
          <dd className="font-heading text-xl tabular-nums text-[--cp-text]">{formatZar(score.clv)}</dd>
        </div>
      </dl>
      {top.length > 0 && (
        <details className="group mt-3">
          <summary className={cx("flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm text-[--cp-accent-text]", FOCUS)}>
            <ChevronDown size={16} aria-hidden className="transition-transform group-open:rotate-180 motion-reduce:transition-none" />
            Why this score
          </summary>
          <ul className="mt-1 space-y-1.5">
            {top.map((f, i) => (
              <li key={i} className="flex items-start justify-between gap-3 text-sm">
                <span className="text-[--cp-text]">{f.label}</span>
                <span className={cx("shrink-0 tabular-nums", f.impact >= 0 ? "text-[--cp-progress]" : "text-[--cp-risk]")}>
                  {f.impact >= 0 ? "Helps" : "Hurts"}
                  <span className="sr-only"> by {Math.abs(Math.round(f.impact * 100))} points</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[--cp-muted]">Model: {score.model}</p>
        </details>
      )}
    </section>
  );
}
