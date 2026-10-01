import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Body signing for every app ↔ n8n / app → EMMA hop (`X-VS-Signature`).
 *
 * Header value: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<rawBody>">`
 *
 * - The timestamp is inside the MAC, so a captured request cannot be replayed with a fresh `t`.
 * - Receivers accept a signature only within `toleranceSec` of their own clock, in BOTH
 *   directions (an old request is a replay; a far-future one is a forged/clock-skewed one).
 *   Inside the window, replays are stopped by dedupe on `event.id` / ingress idempotency keys.
 * - Sign and verify the exact raw bytes on the wire (`await req.text()`), never re-serialised
 *   JSON — key order or whitespace changes would break the MAC.
 * - Several `v1=` entries are allowed (secret rotation: sender signs with old and new secret).
 *
 * Node runtime only (node:crypto).
 */

const SCHEME = "v1";

function mac(secret: string, t: number, rawBody: string): string {
  return createHmac("sha256", secret).update(`${t}.${rawBody}`, "utf8").digest("hex");
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Returns the `X-VS-Signature` header value for `rawBody`. */
export function signBody(secret: string, rawBody: string, nowSec: number = nowSeconds()): string {
  if (!secret) throw new Error("signBody: empty signing secret");
  const t = Math.floor(nowSec);
  return `t=${t},${SCHEME}=${mac(secret, t, rawBody)}`;
}

/** Parses `t=…,v1=…[,v1=…]`; null when malformed. Unknown schemes are ignored. */
function parseHeader(header: string): { t: number; sigs: string[] } | null {
  let t: number | null = null;
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq <= 0) return null;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") {
      if (!/^\d{1,12}$/.test(value)) return null;
      t = Number(value);
    } else if (key === SCHEME) {
      if (/^[0-9a-f]{64}$/i.test(value)) sigs.push(value.toLowerCase());
    }
  }
  return t === null || sigs.length === 0 ? null : { t, sigs };
}

/**
 * True only when `header` carries a valid v1 signature of `rawBody` under `secret`, made within
 * `toleranceSec` of `nowSec` (past or future). Fails closed on any missing/malformed input.
 * The digest comparison is constant-time.
 */
export function verifyBody(
  secret: string,
  rawBody: string,
  header: string | null,
  toleranceSec: number,
  nowSec: number = nowSeconds(),
): boolean {
  if (!secret || !header || !(toleranceSec >= 0)) return false;
  const parsed = parseHeader(header);
  if (!parsed) return false;
  if (Math.abs(Math.floor(nowSec) - parsed.t) > toleranceSec) return false;

  const expected = Buffer.from(mac(secret, parsed.t, rawBody), "hex");
  let ok = false;
  for (const sig of parsed.sigs) {
    // Both buffers are 32 bytes (the regex pins 64 hex chars), as timingSafeEqual requires.
    // No early exit, so timing does not reveal which candidate matched.
    if (timingSafeEqual(expected, Buffer.from(sig, "hex"))) ok = true;
  }
  return ok;
}
