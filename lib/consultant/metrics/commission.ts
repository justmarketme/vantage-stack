/**
 * Commission maths — pure, exhaustively tested (Teslio / DeviQA lens).
 *
 * Commission = rate × the amount actually PAID, in whole rand, rounded half-up.
 *
 * Floating point: 1010 × 0.35 is 353.49999999999994 in IEEE-754, which a naive Math.round would
 * turn into 353 instead of 354. We first round the product to 6 decimal places (far finer than
 * any rate we store — deals.commission_rate is numeric(6,4)), which removes that representation
 * error, and only then round to whole rand.
 */
export function commissionFor(amount: number, rate: number): number {
  if (!Number.isFinite(amount) || !Number.isFinite(rate) || amount <= 0 || rate <= 0) return 0;
  const exact = Number((amount * rate).toFixed(6));
  return Math.round(exact);
}

/** Round a rate to the 4 decimal places `deals.commission_rate numeric(6,4)` stores. */
export function storedRate(rate: number): number {
  return Number(rate.toFixed(4));
}
