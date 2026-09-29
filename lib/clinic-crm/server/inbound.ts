import type { Sql } from "postgres";
import { normalizeE164, type Channel } from "../types";
import { CRM_CONFIG } from "./config";
import { sendSystemReply } from "./messaging";
import { drainOutbox, scheduleNewLeadAck, skipPendingForPatient } from "./outbox";
import { detectOptKeyword, renderTemplate } from "./rules";
import { clinicByNumber } from "./repo/clinics";
import { inboundCount, recordInbound } from "./repo/messages";
import { setOptedOut, upsertInboundContact } from "./repo/patients";

export type AuditFn = (clinicId: string, actor: string, action: string, entity: string, entityId?: string) => Promise<void>;

export interface InboundResult {
  /** What happened, for logging (no PII). */
  outcome: "ignored" | "duplicate" | "stored" | "opted_out" | "opted_in";
  /** Work to run after the 200 has been returned to Twilio (sends). */
  deferred: (() => Promise<void>) | null;
}

/**
 * Inbound SMS/WhatsApp from Twilio (params already signature-validated).
 * Tenancy comes ONLY from the `To` number. Idempotent by MessageSid, so Twilio
 * retries never duplicate a message or re-trigger an automation.
 */
export async function handleInbound(sql: Sql, params: Record<string, string>, audit: AuditFn): Promise<InboundResult> {
  const sid = params.MessageSid || params.SmsSid || "";
  const rawTo = params.To || "";
  const channel: Channel = /^whatsapp:/i.test(rawTo) ? "whatsapp" : "sms";
  const to = normalizeE164(rawTo);
  const from = normalizeE164(params.From || "");
  if (!sid || !to || !from) return { outcome: "ignored", deferred: null };

  const clinic = await clinicByNumber(sql, channel, to);
  if (!clinic) return { outcome: "ignored", deferred: null };

  const numMedia = Number(params.NumMedia || "0");
  const text = (params.Body || "").trim();
  const body = text || (numMedia > 0 ? CRM_CONFIG.inbound.mediaPlaceholder : "");

  const contact = await upsertInboundContact(sql, clinic.id, from, params.ProfileName || "", channel);
  if (contact.created) await audit(clinic.id, "twilio", "create_lead", "patient", contact.id);

  const stored = await recordInbound(sql, { clinicId: clinic.id, patientId: contact.id, channel, body, twilioSid: sid });
  if (!stored) return { outcome: "duplicate", deferred: null };
  await audit(clinic.id, "twilio", "inbound_message", "patient", contact.id);

  const keyword = detectOptKeyword(text);
  if (keyword === "stop") {
    const alreadyOut = !!contact.optedOutAt;
    await setOptedOut(sql, clinic.id, contact.id, true);
    await skipPendingForPatient(sql, clinic.id, contact.id, "opted_out");
    await audit(clinic.id, "twilio", "opt_out", "patient", contact.id);
    // Exactly one confirmation: a repeated STOP from someone already out gets nothing.
    const deferred = alreadyOut
      ? null
      : () =>
          sendSystemReply(sql, {
            clinicId: clinic.id,
            patientId: contact.id,
            channel,
            from: channel === "whatsapp" ? clinic.whatsapp_from || rawTo : clinic.sms_from || to,
            to: from,
            body: renderTemplate(CRM_CONFIG.inbound.stopConfirmation, { clinicName: clinic.name }),
          });
    return { outcome: "opted_out", deferred };
  }
  if (keyword === "start") {
    if (contact.optedOutAt) {
      await setOptedOut(sql, clinic.id, contact.id, false);
      await audit(clinic.id, "twilio", "opt_in", "patient", contact.id);
    }
    return { outcome: "opted_in", deferred: null };
  }

  if (!contact.optedOutAt && (await inboundCount(sql, clinic.id, contact.id)) === 1) {
    const outboxId = await scheduleNewLeadAck(sql, clinic.id, contact.id);
    if (outboxId) {
      return {
        outcome: "stored",
        deferred: async () => {
          await drainOutbox(sql, { ids: [outboxId] });
        },
      };
    }
  }
  return { outcome: "stored", deferred: null };
}
