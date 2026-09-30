import type { DealHealth } from "../../lib/consultant/types";
import { cx } from "./utils";

const LABEL: Record<DealHealth, string> = { red: "At risk", yellow: "Watch", green: "Healthy" };
const DOT: Record<DealHealth, string> = {
  red: "bg-[--cp-health-red]",
  yellow: "bg-[--cp-health-yellow]",
  green: "bg-[--cp-health-green]",
};
const EDGE: Record<DealHealth, string> = {
  red: "border-l-[--cp-health-red]",
  yellow: "border-l-[--cp-health-yellow]",
  green: "border-l-[--cp-health-green]",
};

export function healthLabel(h: DealHealth): string {
  return LABEL[h];
}

/** Left-edge class for health-coded rows/cards (pair with `border-l-[3px]`). */
export function healthEdge(h: DealHealth): string {
  return EDGE[h];
}

/**
 * Deal health: a dot that is never the only signal — the label is always
 * present (visible, or sr-only when `compact`) for colour-blind users.
 */
export function HealthDot({ health, compact = false, className }: { health: DealHealth; compact?: boolean; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-xs text-[--cp-muted]", className)}>
      <span aria-hidden className={cx("h-2.5 w-2.5 shrink-0 rounded-full", DOT[health])} />
      <span className={compact ? "sr-only" : undefined}>{LABEL[health]}</span>
    </span>
  );
}
