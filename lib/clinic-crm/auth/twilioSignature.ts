/**
 * Twilio webhook signature validation (X-Twilio-Signature), per
 * https://www.twilio.com/docs/usage/security :
 *
 *   base64( HMAC-SHA1( authToken, fullUrl + Σ sorted(key) key+value ) )
 *
 * - `url` is the exact public URL Twilio was configured with, including the query
 *   string. Behind Vercel, build it from the configured public origin
 *   (CLINIC_CRM_PUBLIC_URL / NEXT_PUBLIC_APP_URL) + pathname + search — not from a
 *   Host header an attacker controls.
 * - `params` are the application/x-www-form-urlencoded POST fields, verbatim
 *   (no trimming). Keys are sorted with plain code-unit order (Unix-style,
 *   case-sensitive), which is what Array.prototype.sort does by default.
 * - Twilio keeps the port for SMS/WhatsApp callbacks but drops it for voice over
 *   HTTPS, so — like Twilio's own SDKs — we accept either form of the URL.
 *
 * Implemented with node:crypto (Node runtime only; webhook routes must not run on the edge).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Local-development escape hatch: true ONLY when CLINIC_CRM_TWILIO_SKIP_SIGNATURE=true AND
 * NODE_ENV !== "production". Every Vercel deployment (preview included) builds with
 * NODE_ENV=production, so this can never be true on a deployed instance.
 *
 * Deliberately NOT tied to CLINIC_CRM_TWILIO_DRY_RUN: faking sends must not also switch
 * off webhook authentication (a dry-run dev box behind a public tunnel would otherwise
 * accept forged inbound messages, and signature checks could never be exercised locally).
 */
export const DEV_SKIP: boolean =
  process.env.CLINIC_CRM_TWILIO_SKIP_SIGNATURE === "true" && process.env.NODE_ENV !== "production";

export function expectedTwilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  let data = url;
  for (const key of Object.keys(params).sort()) data += key + params[key];
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** The URL as given, plus the same URL with the default port removed / added. */
function urlVariants(url: string): string[] {
  const out = [url];
  try {
    const u = new URL(url);
    const defaultPort = u.protocol === "https:" ? "443" : u.protocol === "http:" ? "80" : "";
    if (!defaultPort) return out;
    // Twilio drops any user:pass@ before signing.
    const rest = `${u.pathname}${u.search}`;
    const withPort = `${u.protocol}//${u.hostname}:${defaultPort}${rest}`;
    const withoutPort = `${u.protocol}//${u.hostname}${rest}`;
    for (const v of [withPort, withoutPort]) if (!out.includes(v)) out.push(v);
  } catch {
    /* not a parseable URL — only the literal form is tried */
  }
  return out;
}

/**
 * true when `signature` is a valid Twilio signature for this request.
 * Fails closed: missing token, missing signature or any mismatch → false.
 * `authToken` defaults to TWILIO_AUTH_TOKEN (the PRIMARY token — a secondary token
 * is not used by Twilio until it is promoted).
 */
export function validTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null,
  authToken: string = (process.env.TWILIO_AUTH_TOKEN || "").trim(),
): boolean {
  if (DEV_SKIP) return true;
  if (!authToken || !signature) return false;
  let ok = false;
  // Evaluate every variant (no early exit) so timing does not reveal which form matched.
  for (const candidate of urlVariants(url)) {
    if (safeEqual(expectedTwilioSignature(authToken, candidate, params), signature)) ok = true;
  }
  return ok;
}

/** Collects a urlencoded form body into the flat record `validTwilioSignature` expects. */
export function formToParams(form: URLSearchParams | FormData): Record<string, string> {
  const out: Record<string, string> = {};
  form.forEach((value, key) => {
    if (typeof value === "string") out[key] = value;
  });
  return out;
}
