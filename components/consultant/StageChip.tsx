import { SALES_STAGE_LABELS, type NepqStage, type SalesStage } from "../../lib/consultant/types";
import { cx, NEPQ_LABELS } from "./utils";

/** Sales stage. Neutral except won (progress) and lost (muted) — colour only where it carries meaning. */
export function StageChip({ stage, className }: { stage: SalesStage; className?: string }) {
  const tone =
    stage === "won"
      ? "bg-[--cp-progress-soft] text-[--cp-progress]"
      : stage === "lost"
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
