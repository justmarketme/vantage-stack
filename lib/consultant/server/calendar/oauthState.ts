import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { signBody, verifyBody } from "../../auth/signing";
import type { CalendarProvider } from "../../types";
import { CALENDAR } from "./constants";

/**
 * OAuth 2 `state` for the calendar connect flow — a CSRF + mix-up guard.
 *
 * state = base64url(JSON payload) + "." + base64url(signature header from `signBody`)
 *   payload = { m: member id, p: provider, n: sha256(nonce), e: expiry (unix seconds) }
 *
 * The raw nonce lives only in an HttpOnly cookie set on the connect request. On the callback we
 * require ALL of: a valid signature (made with a server secret), not expired (10 minutes), the
 * same member as the current session, the same provider as the callback path, and a nonce
 * cookie whose hash matches. So a state minted for one consultant/browser can't be replayed
 * by another, and an attacker can't make a victim's browser finish the attacker's OAuth login.
 */

export type StatePayload = { m: string; p: CalendarProvider; n: string; e: number };

export type StateCheck =
  | { ok: true; payload: StatePayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "wrong_member" | "wrong_provider" | "nonce_mismatch" };

const b64u = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const unb64u = (s: string) => Buffer.from(s, "base64url").toString("utf8");
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * A signing secret dedicated to OAuth state, derived from the token-encryption key so no extra
 * env var is needed (HMAC with a fixed label = a separate key; the encryption key itself is never
 * used to sign). TODO(contract-request 3B-CR-2): optional cfg.calendar.stateSecret.
 */
export function stateSecretFrom(tokenEncKey: string): string {
  if (!tokenEncKey) throw new Error("CALENDAR_STATE_SECRET_MISSING");
  return createHmac("sha256", tokenEncKey).update("vs-consultant-calendar-oauth-state-v1").digest("hex");
}

export function newNonce(): string {
  return randomBytes(24).toString("base64url");
}

export function createOAuthState(input: {
  secret: string;
  memberId: string;
  provider: CalendarProvider;
  nonce: string;
  nowSec?: number;
  ttlSec?: number;
}): string {
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);
  const payload: StatePayload = {
    m: input.memberId,
    p: input.provider,
    n: sha256(input.nonce),
    e: now + (input.ttlSec ?? CALENDAR.stateTtlSec),
  };
  const body = b64u(JSON.stringify(payload));
  return `${body}.${b64u(signBody(input.secret, body, now))}`;
}

function sameHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

export function verifyOAuthState(
  state: string | null | undefined,
  expect: { secret: string; memberId: string; provider: CalendarProvider; nonce: string | null | undefined; nowSec?: number },
): StateCheck {
  const now = expect.nowSec ?? Math.floor(Date.now() / 1000);
  if (!state || state.length > 2048) return { ok: false, reason: "malformed" };
  const dot = state.indexOf(".");
  if (dot <= 0 || dot === state.length - 1) return { ok: false, reason: "malformed" };
  const body = state.slice(0, dot);
  let header: string;
  let payload: StatePayload;
  try {
    header = unb64u(state.slice(dot + 1));
    payload = JSON.parse(unb64u(body)) as StatePayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!payload || typeof payload.m !== "string" || typeof payload.p !== "string" || typeof payload.n !== "string" || typeof payload.e !== "number") {
    return { ok: false, reason: "malformed" };
  }
  // The signature's own timestamp must be fresh too. Its tolerance is a little wider than the
  // lifetime so that an honest-but-late state reports "expired" (from `e`) rather than a bad signature.
  if (!verifyBody(expect.secret, body, header, CALENDAR.stateTtlSec + 60, now)) return { ok: false, reason: "bad_signature" };
  if (now > payload.e) return { ok: false, reason: "expired" };
  if (payload.m !== expect.memberId) return { ok: false, reason: "wrong_member" };
  if (payload.p !== expect.provider) return { ok: false, reason: "wrong_provider" };
  if (!expect.nonce || !sameHex(sha256(expect.nonce), payload.n)) return { ok: false, reason: "nonce_mismatch" };
  return { ok: true, payload };
}
