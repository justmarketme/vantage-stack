import type { ConsultantConfig } from "../config";
import type { DealHealth, SalesStage } from "../types";

const DAY_MS = 86_400_000;

/**
 * Deal health (Red / Yellow / Green) — how at-risk an open deal is of going cold.
 *
 * Rules, in order:
 *  1. `won`  → green. The deal is closed in our favour; nothing to chase.
 *  2. `lost` → red. The deal is dead; red is the honest state and keeps lost leads from
 *     reading as "healthy" in any mixed list (the UI always pairs colour with a label).
 *  3. A next action scheduled in the future → green: the consultant has a plan and the
 *     prospect is expecting the follow-up.
 *  4. Otherwise by days since the last touch (last call, last stage change, or creation):
 *     < yellowDays → green, < redDays → yellow, else red.
 *  5. An overdue next action is never better than yellow.
 */
export function dealHealth(
  input: {
    stage: SalesStage;
    lastTouchAt: Date | string | null;
    nextActionAt: Date | string | null;
  },
  pipeline: Pick<ConsultantConfig["pipeline"], "healthYellowDays" | "healthRedDays">,
  now: Date = new Date(),
): DealHealth {
  if (input.stage === "won") return "green";
  if (input.stage === "lost") return "red";

  const nowMs = now.getTime();
  const next = toMs(input.nextActionAt);
  if (next !== null && next > nowMs) return "green";

  const last = toMs(input.lastTouchAt);
  const days = last === null ? Number.POSITIVE_INFINITY : (nowMs - last) / DAY_MS;
  let health: DealHealth = days < pipeline.healthYellowDays ? "green" : days < pipeline.healthRedDays ? "yellow" : "red";
  if (next !== null && next <= nowMs && health === "green") health = "yellow";
  return health;
}

function toMs(v: Date | string | null): number | null {
  if (v == null) return null;
  const ms = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}
