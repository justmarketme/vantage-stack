/**
 * Retry policy shared by event deliveries and Emma messages — pure and unit-tested.
 *
 * After the n-th failed attempt (n ≥ 1) the next attempt waits base × 2^(n−1) seconds, capped
 * at `max`. With the event defaults (15s base, 1h cap, 8 attempts):
 *   15s, 30s, 1m, 2m, 4m, 8m, 16m → dead after the 8th failure (≈ 31 minutes of retrying).
 * Deterministic on purpose (no jitter): deliveries are claimed with SKIP LOCKED so there is no
 * thundering herd to spread out, and a deterministic schedule is testable and explainable.
 */
export function backoffSec(attempt: number, baseSec: number, maxSec: number): number {
  const n = Math.max(1, Math.floor(attempt));
  const raw = baseSec * 2 ** Math.min(n - 1, 30); // exponent capped to avoid Infinity
  return Math.max(0, Math.min(maxSec, raw));
}

export type RetryDecision = { status: "dead" } | { status: "retry"; delaySec: number };

/** What to do after attempt number `attempt` failed. */
export function afterFailure(attempt: number, policy: { maxAttempts: number; retryBaseSec: number; retryMaxSec: number }): RetryDecision {
  if (attempt >= policy.maxAttempts) return { status: "dead" };
  return { status: "retry", delaySec: backoffSec(attempt, policy.retryBaseSec, policy.retryMaxSec) };
}
