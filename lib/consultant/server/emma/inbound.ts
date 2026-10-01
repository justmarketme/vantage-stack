import type { Sql } from "postgres";
import { EMMA_FLOW_TEMPLATES } from "../../../../ai-configs/emma/system";
import { CLINICS_VERTICAL, normalizeZaPhone } from "../../types";
import { audit } from "../audit";
import { optIn, optOut } from "./consent";
import { classifyInbound, parseAddress, type InboundKind } from "./keywords";
import { enqueueMessage } from "./sender";

/**
 * A WhatsApp/SMS reply from a clinic (Twilio inbound webhook, signature already verified).
 *
 * - STOP-type keyword → opt out (forever, until START) + ONE confirmation (only on the
 *   transition; on SMS with Twilio Advanced Opt-Out Twilio already confirmed, so we don't).
 * - START → opt back in + confirmation (same SMS rule).
 * - Anything else → notify the owning consultant through Emma so a HUMAN replies; audited.
 * The message body is never stored, logged or audited — only its classification. Every path is
 * idempotent on Twilio's MessageSid, so a Twilio retry can't double-notify or double-confirm.
 */
export type InboundResult = { kind: InboundKind; matched: boolean };

export async function handleInbound(db: Sql, params: Record<string, string>): Promise<InboundResult> {
  const { channel, address } = parseAddress(params.From);
  const kind = classifyInbound(params.Body, params.OptOutType);
  const sid = (params.MessageSid || params.SmsSid || "").slice(0, 64);
  const phone = normalizeZaPhone(address);

  const lead = phone
    ? (
        await db<{ id: string; consultant_id: string | null }[]>`
          select id::text, consultant_id::text as consultant_id from public.clients
          where vertical = ${CLINICS_VERTICAL} and phone = ${phone}
          order by created_at asc limit 1
        `
      )[0]
    : undefined;

  if (!lead) {
    await audit(db, { actorId: null, actorKind: "twilio", action: "emma.inbound_unmatched", entity: "message", meta: { channel, kind } });
    return { kind, matched: false };
  }

  const twilioConfirmed = channel === "sms" && !!params.OptOutType; // Twilio Advanced Opt-Out replied already
  const actor = { id: null, kind: "twilio" as const };

  if (kind === "stop") {
    const changed = await optOut(db, lead.id, channel);
    await audit(db, { actorId: null, actorKind: "twilio", action: "emma.inbound_stop", entity: "lead", entityId: lead.id, meta: { channel, changed } });
    if (changed && !twilioConfirmed && sid) {
      await enqueueMessage(db, {
        audience: "lead",
        template: EMMA_FLOW_TEMPLATES.optOutConfirmation,
        leadId: lead.id,
        channel,
        idempotencyKey: `optout:${sid}`,
        actor,
      });
    }
    return { kind, matched: true };
  }

  if (kind === "start") {
    await optIn(db, lead.id, channel);
    await audit(db, { actorId: null, actorKind: "twilio", action: "emma.inbound_start", entity: "lead", entityId: lead.id, meta: { channel } });
    if (!twilioConfirmed && sid) {
      await enqueueMessage(db, {
        audience: "lead",
        template: EMMA_FLOW_TEMPLATES.optInConfirmation,
        leadId: lead.id,
        channel,
        idempotencyKey: `optin:${sid}`,
        actor,
      });
    }
    return { kind, matched: true };
  }

  await audit(db, {
    actorId: null,
    actorKind: "twilio",
    action: "emma.inbound_reply",
    entity: "lead",
    entityId: lead.id,
    meta: { channel, owned: !!lead.consultant_id },
  });
  if (lead.consultant_id && sid) {
    await enqueueMessage(db, {
      audience: "consultant",
      template: EMMA_FLOW_TEMPLATES.consultantLeadReplied,
      leadId: lead.id,
      consultantId: lead.consultant_id,
      channel: "whatsapp",
      variables: { channel: channel === "whatsapp" ? "WhatsApp" : "SMS" },
      idempotencyKey: `inbound:${sid}`,
      actor,
    });
  }
  return { kind, matched: true };
}
