import type { CalculatorInput, CalculatorResult } from "../types";
import { commissionFor } from "./commission";

/**
 * The performance calculator: "what does it take, per working day, to hit my goal?"
 *
 * Derivation (every count is rounded UP — you can't close 2.3 deals, and rounding down would
 * understate the work; `ceilCount` ignores float noise such as 2.0000000000000004):
 *
 *   1. Deals needed
 *        goal = deals       → dealsNeeded = goalValue
 *        goal = revenue     → dealsNeeded = ⌈goalValue ÷ avgSale⌉
 *        goal = commission  → each deal earns avgSale × commissionRate, so
 *                             dealsNeeded = ⌈goalValue ÷ (avgSale × commissionRate)⌉
 *   2. Answered calls (connects) needed. The headline close ratio is PAID deals ÷ answered
 *      calls (decision: a sale counts when it is paid), so
 *        connectsNeeded = ⌈dealsNeeded ÷ closeFromConnects⌉
 *   3. Dials needed. Only connectRate of dials are answered, so
 *        dialsNeeded = ⌈connectsNeeded ÷ connectRate⌉
 *   4. Per working day: dials and connects are ⌈total ÷ workingDays⌉ (whole calls). Deals per
 *      day is a RATE, not something you can round up per day (3 deals in 20 days is 0.15/day,
 *      not 1/day), so it is given to 2 decimals.
 *   5. What hitting the plan yields: revenue = dealsNeeded × avgSale and
 *      commission = commissionFor(revenue, commissionRate) (half-up to whole rand).
 *
 * Worked example (30% close on connects, 25% connect rate, R15 000 avg sale, 25% commission,
 * R30 000 commission goal over 20 days): deals = ⌈30000 ÷ 3750⌉ = 8, connects = ⌈8 ÷ 0.3⌉ = 27,
 * dials = ⌈27 ÷ 0.25⌉ = 108, per day = 6 dials, 2 connects, 0.4 deals.
 *
 * Throws RangeError for a commission goal with a 0% commission rate (unreachable goal) — the UI
 * validates with `CalculatorInput` (rates must be > 0 except commissionRate).
 */
export function calculate(input: CalculatorInput): CalculatorResult {
  const { goalType, goalValue, workingDays, avgSale, closeFromConnects, connectRate, commissionRate } = input;
  if (!(workingDays >= 1) || !(avgSale > 0) || !(closeFromConnects > 0) || !(connectRate > 0)) {
    throw new RangeError("calculator: rates, average sale and working days must be positive");
  }

  let dealsNeeded: number;
  if (goalType === "deals") dealsNeeded = ceilCount(goalValue);
  else if (goalType === "revenue") dealsNeeded = ceilCount(goalValue / avgSale);
  else {
    if (!(commissionRate > 0)) throw new RangeError("calculator: a commission goal needs a commission rate above 0");
    dealsNeeded = ceilCount(goalValue / (avgSale * commissionRate));
  }

  const connectsNeeded = ceilCount(dealsNeeded / closeFromConnects);
  const dialsNeeded = ceilCount(connectsNeeded / connectRate);
  const revenue = dealsNeeded * avgSale;

  return {
    dealsNeeded,
    connectsNeeded,
    dialsNeeded,
    perDay: {
      dials: ceilCount(dialsNeeded / workingDays),
      connects: ceilCount(connectsNeeded / workingDays),
      deals: Math.round((dealsNeeded / workingDays) * 100) / 100,
    },
    revenue,
    commission: commissionFor(revenue, commissionRate),
  };
}

/** ⌈x⌉ that ignores binary floating-point noise just above a whole number. */
export function ceilCount(x: number): number {
  if (!Number.isFinite(x) || x <= 0) return 0;
  return Math.ceil(Number(x.toFixed(9)));
}
