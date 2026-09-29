import type { Sql } from "postgres";
import type { Channel, Message } from "../types";
import { API_PREFIX, publicBaseUrl } from "./config";
import { decideChannel, windowOpen, type SkipReason } from "./rules";
import { sendMessage, TwilioError } from "./twilio";
import { getClinic } from "./repo/clinics";
import { lastInboundWhatsapp, recordOutbound } from "./repo/messages";
import { setOptedOut } from "./repo/patients";

/**
 * Process layer for outbound messaging. The channel rules themselves are pure
 * (`decideChannel` in rules.ts):
 *   opted out                         → blocked
 *   WhatsApp + window open (<24h)     → free-form
 *   WhatsApp + window closed          → approved Content template, else SMS (automations only), else skip
 *   SMS                               → free-form
 */
export { decideChannel };

export function statusCallbackUrl(): string | undefined {
  const base = publicBaseUrl();
  return base ? `${base}${API_PREFIX}/webhooks/twilio/status` : undefined;
}

export type ManualSendResult =
  | { ok: true; message: Message }
  | { ok: false; status: 404 | 409 | 422 | 502; reason: SkipReason | "not_found" | "invalid_number" | "send_failed" };

/** A staff member's free-form message. Never falls back to another channel — their choice is honoured or refused. */
export async function sendManual(
  sql: Sql,
  clinicId: string,
  staffId: string,
  input: { patientId: string; body: string; channel?: Channel },
): Promise<ManualSendResult> {
  const [p] = await sql<{ id: string; phone: string; preferred_channel: Channel; opted_out_at: Date | null }[]>`
    SELECT id, phone, preferred_channel, opted_out_at FROM clinic_crm.patients
     WHERE clinic_id = ${clinicId} AND id = ${input.patientId}`;
  if (!p) return { ok: false, status: 404, reason: "not_found" };
  const clinic = await getClinic(sql, clinicId);
  if (!clinic) return { ok: false, status: 404, reason: "not_found" };

  const decision = decideChannel({
    requested: input.channel ?? p.preferred_channel,
    optedOut: !!p.opted_out_at,
    whatsappFrom: clinic.whatsapp_from,
    smsFrom: clinic.sms_from,
    windowOpen: windowOpen(await lastInboundWhatsapp(sql, clinicId, p.id)),
    contentSid: "",
    allowFallback: false,
  });
  if (!decision.ok) return { ok: false, status: 409, reason: decision.reason };

  try {
    const sent = await sendMessage({
      channel: decision.channel,
      from: decision.from,
      to: p.phone,
      body: input.body,
      statusCallback: statusCallbackUrl(),
    });
    const message = await recordOutbound(sql, {
      clinicId,
      patientId: p.id,
      channel: decision.channel,
      body: input.body,
      status: sent.status,
      twilioSid: sent.sid,
      automation: null,
      sentBy: staffId,
    });
    return { ok: true, message };
  } catch (e) {
    if (!(e instanceof TwilioError)) throw e;
    if (e.reason === "unsubscribed") {
      await setOptedOut(sql, clinicId, p.id, true);
      return { ok: false, status: 409, reason: "opted_out" };
    }
    if (e.reason === "outside_window") return { ok: false, status: 409, reason: "whatsapp_window_closed" };
    if (e.reason === "invalid_number") return { ok: false, status: 422, reason: "invalid_number" };
    return { ok: false, status: 502, reason: "send_failed" };
  }
}

/**
 * A system reply on the channel/number the patient just used (e.g. the single STOP
 * confirmation). Bypasses the opt-out block by design; best-effort.
 */
export async function sendSystemReply(
  sql: Sql,
  args: { clinicId: string; patientId: string; channel: Channel; from: string; to: string; body: string },
): Promise<void> {
  try {
    const sent = await sendMessage({
      channel: args.channel,
      from: args.from,
      to: args.to,
      body: args.body,
      statusCallback: statusCallbackUrl(),
    });
    await recordOutbound(sql, {
      clinicId: args.clinicId,
      patientId: args.patientId,
      channel: args.channel,
      body: args.body,
      status: sent.status,
      twilioSid: sent.sid,
      automation: null,
      sentBy: null,
    });
  } catch (e) {
    console.warn("[clinic-crm] system reply not sent", e instanceof TwilioError ? e.code ?? e.reason : (e as Error).name);
  }
}
