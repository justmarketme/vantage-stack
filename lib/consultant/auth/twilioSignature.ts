import twilio from "twilio";
import { consultantConfig } from "../config";

/**
 * Authenticates a Twilio webhook (`/api/consultant-voice/**`) by its X-Twilio-Signature.
 *
 * - The URL is rebuilt from the CONFIGURED public origin (`consultantConfig().publicUrl`),
 *   never from a Host / X-Forwarded-Host header a caller controls.
 * - `pathWithQuery` is the request path plus its query string exactly as Twilio called it
 *   (e.g. `/api/consultant-voice/status?callId=…`) — the query is part of what Twilio signs.
 * - `params` are the form-encoded POST fields, verbatim.
 * - `twilio.validateRequest` tries the URL with and without the default port and with the
 *   legacy query-string encoding, and compares in constant time.
 *
 * Fails closed: no auth token, no public URL, no signature or any mismatch → false.
 * `cfg.twilio.skipSignature` is a local-development escape hatch that config.ts already
 * forces off whenever NODE_ENV is "production" (every Vercel deployment, previews included).
 * Node runtime only (the twilio package needs node:crypto).
 */
export function verifyTwilioRequest(
  pathWithQuery: string,
  params: Record<string, string>,
  signature: string | null,
): boolean {
  const cfg = consultantConfig();
  if (cfg.twilio.skipSignature) return true;
  if (!cfg.twilio.authToken || !cfg.publicUrl || !signature) return false;
  if (!pathWithQuery.startsWith("/") || pathWithQuery.startsWith("//")) return false;
  try {
    return twilio.validateRequest(cfg.twilio.authToken, signature, `${cfg.publicUrl}${pathWithQuery}`, params);
  } catch {
    return false; // unparseable URL
  }
}
