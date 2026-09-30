import twilio from "twilio";
import { consultantConfig, type ConsultantConfig } from "../config";
import type { VoiceToken } from "../types";
import { voiceIdentity } from "./identity";

/**
 * Mints a short-lived Twilio Voice access token for a consultant's browser.
 *
 * - Signed with the API key pair (never the account auth token).
 * - Outgoing only, through the configured TwiML App; `incomingAllow: false` so nobody can
 *   ring a consultant's browser directly.
 * - TTL from config. The identity is derived from the session member id — never user input.
 *
 * Returns null when Twilio isn't configured (the route answers 503 rather than leaking why).
 * Callers must have already checked `requireConsultant({ call: true })` and rate-limited.
 */
export function mintVoiceToken(
  memberId: string,
  cfg: ConsultantConfig = consultantConfig(),
  now: number = Date.now(),
): VoiceToken | null {
  const t = cfg.twilio;
  if (!t.accountSid || !t.apiKeySid || !t.apiKeySecret || !t.twimlAppSid) return null;

  const identity = voiceIdentity(memberId);
  const { AccessToken } = twilio.jwt;
  const token = new AccessToken(t.accountSid, t.apiKeySid, t.apiKeySecret, {
    identity,
    ttl: t.tokenTtlSec,
  });
  token.addGrant(new AccessToken.VoiceGrant({ outgoingApplicationSid: t.twimlAppSid, incomingAllow: false }));

  return {
    token: token.toJwt(),
    identity,
    expiresAt: new Date(now + t.tokenTtlSec * 1000).toISOString(),
  };
}
