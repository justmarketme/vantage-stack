/**
 * Minimal fixed-window rate limiter for public, unauthenticated endpoints.
 *
 * HONEST LIMITATION: this is in-process memory. On a serverless platform each
 * instance keeps its own counters, so the effective limit is (limit × warm
 * instances), and counters reset on cold start. It is therefore a brake on
 * casual abuse and accidental double-submits — NOT a defence against a
 * determined distributed attacker.
 *
 * It is here because the alternative in this repo was nothing at all, and an
 * unauthenticated endpoint that writes a row to Postgres with no ceiling is a
 * standing invitation to fill the table and the bill. If this endpoint ever
 * takes real volume, replace the Map with Upstash/Redis and keep the interface.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Stop the Map growing without bound on a long-lived server. */
const MAX_TRACKED_KEYS = 10_000;

function sweep(now: number) {
  if (buckets.size < MAX_TRACKED_KEYS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  // Still oversized after dropping expired entries: the traffic is not
  // organic. Drop everything rather than let memory grow — a cleared window
  // costs one permissive interval, an unbounded Map costs the process.
  if (buckets.size >= MAX_TRACKED_KEYS) buckets.clear();
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  /** Seconds until the window resets — surfaced as Retry-After. */
  retryAfter: number;
};

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }

  existing.count += 1;
  const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));

  if (existing.count > limit) {
    return { ok: false, remaining: 0, retryAfter };
  }
  return { ok: true, remaining: limit - existing.count, retryAfter };
}

/**
 * Best-effort client IP.
 *
 * `x-forwarded-for` is client-controlled and trivially spoofed in general, but
 * on Vercel the platform overwrites/appends it at the edge, so the LEFTMOST
 * entry is the real client for our purposes. We prefer `x-real-ip` where the
 * proxy sets it. A caller that spoofs this only splits its own bucket, which
 * degrades the limiter to per-fake-IP — acceptable given the tool's stated
 * scope above.
 */
export function clientIp(req: Request): string {
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}
