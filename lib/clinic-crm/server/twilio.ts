import { randomBytes } from "node:crypto";
import type { Channel } from "../types";
import { CRM_CONFIG } from "./config";

/**
 * System layer: the only code that talks to Twilio's Messages API.
 * REST via fetch + Basic auth (no SDK), same pattern as lib/isabel/whatsapp-send.ts.
 *
 * `CLINIC_CRM_TWILIO_DRY_RUN=true` (and any NODE_ENV=test run) returns a fake SID
 * without touching the network — used by tests and staging.
 */

export type TwilioReason =
  | "outside_window" // 63016: WhatsApp free-form outside the 24h service window
  | "unsubscribed" // 21610: recipient replied STOP at the carrier/Twilio level
  | "invalid_number" // 21211 / 21614 / 63024: not a valid (mobile/WhatsApp) number
  | "not_configured" // missing creds / auth failure
  | "rate_limited"
  | "network"
  | "unknown";

export class TwilioError extends Error {
  constructor(
    readonly code: number | null,
    readonly status: number,
    readonly reason: TwilioReason,
    readonly retryable: boolean,
  ) {
    super(`Twilio send failed (${code ?? status})`);
    this.name = "TwilioError";
  }
}

const REASON_BY_CODE: Record<number, TwilioReason> = {
  63016: "outside_window",
  21610: "unsubscribed",
  21211: "invalid_number",
  21614: "invalid_number",
  63024: "invalid_number",
  20003: "not_configured",
  20429: "rate_limited",
};

/** Maps a Twilio error response to a typed, retry-classified error. */
export function toTwilioError(httpStatus: number, code: number | null): TwilioError {
  const reason = (code !== null && REASON_BY_CODE[code]) || (httpStatus === 429 ? "rate_limited" : httpStatus === 401 ? "not_configured" : "unknown");
  const retryable = reason === "rate_limited" || (reason === "unknown" && httpStatus >= 500);
  return new TwilioError(code, httpStatus, reason, retryable);
}

export interface SendArgs {
  channel: Channel;
  from: string;
  to: string;
  body?: string;
  contentSid?: string | null;
  contentVariables?: Record<string, string>;
  statusCallback?: string;
}

export interface SendResult {
  sid: string;
  status: string;
}

export function isDryRun(): boolean {
  // Never in production: a stray flag there would silently fake every patient message.
  if (process.env.VERCEL_ENV === "production") return false;
  return process.env.CLINIC_CRM_TWILIO_DRY_RUN === "true" || process.env.NODE_ENV === "test";
}

/** Twilio addresses: WhatsApp needs the `whatsapp:` prefix on both ends; SMS must not have it. */
export function twilioAddress(channel: Channel, number: string): string {
  const bare = number.trim().replace(/^whatsapp:/i, "");
  return channel === "whatsapp" ? `whatsapp:${bare}` : bare;
}

export async function sendMessage(a: SendArgs): Promise<SendResult> {
  if (!a.body && !a.contentSid) throw new TwilioError(null, 400, "unknown", false);
  if (isDryRun()) return { sid: "SM" + randomBytes(16).toString("hex"), status: "queued" };

  const sid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  if (!sid || !token) throw new TwilioError(null, 0, "not_configured", false);

  const form = new URLSearchParams({
    From: twilioAddress(a.channel, a.from),
    To: twilioAddress(a.channel, a.to),
  });
  if (a.contentSid) {
    form.set("ContentSid", a.contentSid);
    if (a.contentVariables) form.set("ContentVariables", JSON.stringify(a.contentVariables));
  } else if (a.body) {
    form.set("Body", a.body);
  }
  if (a.statusCallback) form.set("StatusCallback", a.statusCallback);

  let res: Response;
  try {
    res = await fetch(`${CRM_CONFIG.twilio.apiBase}/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      signal: AbortSignal.timeout(CRM_CONFIG.twilio.timeoutMs),
    });
  } catch {
    throw new TwilioError(null, 0, "network", true);
  }

  const data = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; code?: number | string };
  if (!res.ok || !data.sid) {
    const code = data.code === undefined || data.code === null ? null : Number(data.code);
    throw toTwilioError(res.status, Number.isFinite(code) ? code : null);
  }
  return { sid: data.sid, status: data.status || "queued" };
}
