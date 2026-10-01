import { TUNABLES_3A } from "../../metrics/tunables";
import { TWILIO } from "../constants";

/**
 * Minimal Twilio Messages API client (REST + basic auth; no SDK call so it is trivially mockable
 * and the error surface is ours). Only a generic code ever leaves this module — never Twilio's
 * error message, which can echo the recipient number.
 *
 * Retry classification (Jeff Lawson lens: never drop silently, never hammer pointlessly):
 * - 2xx                      → sent (Twilio accepted it; delivery arrives via status callback)
 * - 429 / 5xx / network      → retryable (exponential backoff, then dead)
 * - 21610 (recipient STOPped at carrier level) → opted_out (we record the opt-out)
 * - other 4xx                → permanent (dead immediately: retrying a bad number can't succeed)
 */

export type TwilioSend = {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  body: string;
  contentSid?: string | null;
  contentVariables?: Record<string, string> | null;
  statusCallback?: string | null;
};

export type TwilioResult =
  | { ok: true; sid: string }
  | { ok: false; kind: "retryable" | "permanent" | "opted_out"; error: string };

export async function sendTwilioMessage(m: TwilioSend, fetchImpl: typeof fetch = fetch): Promise<TwilioResult> {
  const form = new URLSearchParams({ To: m.to, From: m.from });
  if (m.contentSid) {
    form.set("ContentSid", m.contentSid);
    if (m.contentVariables) form.set("ContentVariables", JSON.stringify(m.contentVariables));
  } else {
    form.set("Body", m.body);
  }
  if (m.statusCallback) form.set("StatusCallback", m.statusCallback);

  let res: Response;
  try {
    res = await fetchImpl(`${TWILIO.apiBase}/Accounts/${encodeURIComponent(m.accountSid)}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${m.accountSid}:${m.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
      signal: AbortSignal.timeout(TUNABLES_3A.emma.requestTimeoutMs),
    });
  } catch (e) {
    const name = String((e as { name?: unknown } | null)?.name ?? ""); // DOMException isn't always instanceof Error
    return { ok: false, kind: "retryable", error: name === "TimeoutError" || name === "AbortError" ? "timeout" : "network" };
  }

  let data: { sid?: unknown; code?: unknown } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    // non-JSON body: classify by status alone
  }
  if (res.ok && typeof data.sid === "string") return { ok: true, sid: data.sid };
  const code = typeof data.code === "number" ? data.code : null;
  const error = code ? `twilio_${code}` : `http_${res.status}`;
  if (code === 21610) return { ok: false, kind: "opted_out", error };
  if (res.status === 429 || res.status >= 500 || res.ok) return { ok: false, kind: "retryable", error };
  return { ok: false, kind: "permanent", error };
}

/** Twilio needs `whatsapp:` on both ends of a WhatsApp message. */
export function channelAddress(channel: "whatsapp" | "sms", e164: string): string {
  const bare = e164.replace(/^whatsapp:/i, "");
  return channel === "whatsapp" ? `whatsapp:${bare}` : bare;
}
