import { SALES_STAGE_LABELS, type NepqStage, type SalesStage } from "../../lib/consultant/types";
import { cx, NEPQ_LABELS } from "./utils";

/** Stages that carry colour (Rams: colour only where it carries meaning). */
export const STAGE_TONE: Record<SalesStage, "progress" | "risk" | "muted" | "neutral"> = {
  new: "neutral",
  contacted: "neutral",
  discovery_booked: "neutral",
  no_show: "risk", // needs rebooking
  demo_done: "neutral",
  proposal: "neutral",
  won: "progress",
  paid: "progress", // a sale counts when it is paid
  lost: "muted",
};

/** Sales stage. Neutral except won/paid (progress), no-show (risk) and lost (muted). */
export function StageChip({ stage, className }: { stage: SalesStage; className?: string }) {
  const t = STAGE_TONE[stage];
  const tone =
    t === "progress"
      ? "bg-[--cp-progress-soft] text-[--cp-progress]"
      : t === "risk"
        ? "bg-[--cp-risk-soft] text-[--cp-risk]"
        : t === "muted"
          ? "bg-[--cp-surface-2] text-[--cp-muted] line-through decoration-1"
          : "bg-[--cp-surface-2] text-[--cp-text]";
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", tone, className)}>
      {SALES_STAGE_LABELS[stage]}
    </span>
  );
}

/** NEPQ conversation stage — Coach Alex's colour. */
export function NepqChip({ stage, className }: { stage: NepqStage; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full bg-[--cp-coach-soft] px-2.5 py-1 text-xs font-medium text-[--cp-coach]",
        className,
      )}
    >
      {NEPQ_LABELS[stage]}
    </span>
  );
}
