import { after } from "next/server";
import type { Sql } from "postgres";
import { verifyTwilioRequest } from "../auth/twilioSignature";
import { TIMINGS } from "./constants";
import { connectConsultantDb, isUuid, logError } from "./http";
import { summariseCall } from "./summarise";
import { emptyTwiml, twimlResponse } from "./voice";

/**
 * Shared front door for `/api/consultant-voice/**`: parse the form body, verify the Twilio
 * signature over the path + query exactly as Twilio called it (rebuilt on the configured
 * public origin), and pull the opaque `callId` from the query. Invalid signature → 403 and
 * nothing is written. Twilio webhooks carry no session; the signature is the auth.
 */
export type TwilioWebhook = { params: Record<string, string>; callId: string | null };

export async function readTwilioWebhook(req: Request): Promise<TwilioWebhook | Response> {
  let params: Record<string, string>;
  try {
    const form = await req.formData();
    params = {};
    for (const [k, v] of form.entries()) if (typeof v === "string") params[k] = v;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  const url = new URL(req.url);
  if (!verifyTwilioRequest(`${url.pathname}${url.search}`, params, req.headers.get("x-twilio-signature"))) {
    return new Response("Forbidden", { status: 403 });
  }
  const callId = url.searchParams.get("callId");
  return { params, callId: isUuid(callId) ? callId.toLowerCase() : null };
}

/**
 * Run a webhook's DB work. Failures are logged (tag + class only) and answered 500 so Twilio
 * retries — every handler is idempotent. Success answers with `ok()` (TwiML or empty 200).
 */
export async function handleWebhook(
  tag: string,
  work: (db: Sql) => Promise<Response | void>,
  ok: () => Response = () => twimlResponse(emptyTwiml()),
): Promise<Response> {
  try {
    const db = await connectConsultantDb();
    return (await work(db)) ?? ok();
  } catch (e) {
    logError(tag, e);
    return twimlResponse(emptyTwiml(), 500);
  }
}

export function parseSeconds(v: string | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Schedule Coach Alex after the response is sent. `graceMs` lets trailing transcription
 * webhooks land first when the trigger is the call ending rather than transcription-stopped.
 */
export function scheduleSummary(callId: string, graceMs: number = TIMINGS.summariseGraceMs): void {
  after(async () => {
    try {
      if (graceMs > 0) await new Promise((r) => setTimeout(r, graceMs));
      const db = await connectConsultantDb();
      await summariseCall(db, callId);
    } catch (e) {
      logError("summarise.after", e);
    }
  });
}
