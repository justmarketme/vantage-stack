/** Sign-in policy — every number in one place (SPEC: nothing inline). */
export const LOGIN_POLICY = {
  /** Attempts per IP + email per window (in-memory, per instance). */
  maxAttempts: 5,
  /** Attempts per IP across all emails per window — stops password spraying. */
  maxAttemptsPerIp: 30,
  windowMs: 15 * 60_000,
  /** Durable, database-backed lockout (survives cold starts and spans instances). */
  lockAfterFailures: 5,
  lockMinutes: 15,
  /** bcrypt cost for new hashes (seed script). Must match DUMMY_BCRYPT_HASH's cost. */
  bcryptRounds: 12,
} as const;

/**
 * A valid cost-12 bcrypt hash of a random, discarded string. Compared against when the
 * email is unknown so that path costs the same as a real password check.
 */
export const DUMMY_BCRYPT_HASH = "$2b$12$mylHTGSdX6e7.FoKor9UUeY.GiatsZpdTl0qyJg848uZDIc0pJsT.";
