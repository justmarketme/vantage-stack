/**
 * Fixed-window, in-memory rate limiter for Consultant Portal endpoints that cost money or
 * touch Twilio (voice-token minting, call creation).
 *
 * SERVERLESS LIMITATION — read before relying on it: the counters live in this process's
 * memory. On Vercel every warm function instance has its own Map, so the real ceiling is
 * `limit × warm instances`, and a cold start resets it. It stops a single runaway client
 * (a retry loop, a stuck button, one compromised session hammering one instance); it is
 * NOT a distributed-abuse control. The durable controls are the session/role gate, the
 * "one live call per consultant" check in the calls API, and Twilio's own account limits.
 * If this ever needs to be global, back it with Upstash/Redis behind this same signature.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Upper bound on tracked keys so memory cannot grow without limit on a long-lived instance. */
export const MAX_TRACKED_KEYS = 10_000;

function evict(now: number): void {
  if (buckets.size < MAX_TRACKED_KEYS) return;
  for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
  // Still full of live windows: drop the oldest-inserted half (Map keeps insertion order).
  // Costs those keys one permissive window; an unbounded Map would cost the process.
  if (buckets.size >= MAX_TRACKED_KEYS) {
    let drop = Math.ceil(buckets.size / 2);
    for (const key of buckets.keys()) {
      if (drop-- <= 0) break;
      buckets.delete(key);
    }
  }
}

/**
 * true = allowed; false = `key` has already made `limit` requests in the current window.
 * Namespace keys by purpose and subject, e.g. `voice-token:${memberId}`.
 */
export function rateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): boolean {
  if (limit <= 0 || windowMs <= 0) return false;
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    if (!b) evict(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count += 1;
  return true;
}

/** Test hook: clears every window. */
export function resetRateLimits(): void {
  buckets.clear();
}

/** Test/diagnostic hook: number of keys currently tracked. */
export function trackedKeyCount(): number {
  return buckets.size;
}
