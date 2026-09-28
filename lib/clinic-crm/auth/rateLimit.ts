/**
 * Clinic CRM rate limiting — a thin boolean wrapper over the proven fixed-window
 * limiter in lib/clinics/rateLimit.ts (keys are namespaced so the two products
 * never share a bucket).
 *
 * LIMITATION (by design, documented in docs/clinic-crm/DEPLOY.md): counters live
 * in process memory. On Vercel each warm function instance has its own Map, so the
 * effective ceiling is `limit × warm instances` and it resets on cold start. It is
 * a brake on credential stuffing from a single source and on accidental floods,
 * NOT a distributed-attack defence. The per-account lockout in the login route
 * (staff.failed_logins / locked_until) is the durable control. Swap the Map for
 * Upstash/Redis behind this same signature if volume ever warrants it.
 */
import { rateLimit as fixedWindow, clientIp } from "../../clinics/rateLimit";

export { clientIp };

/** true = allowed, false = over the limit for this window. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  return fixedWindow(`clinic-crm:${key}`, limit, windowMs).ok;
}

/** Same check, with the seconds-until-reset for a `Retry-After` header. */
export function rateLimitDetailed(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const r = fixedWindow(`clinic-crm:${key}`, limit, windowMs);
  return { ok: r.ok, retryAfter: r.retryAfter };
}
