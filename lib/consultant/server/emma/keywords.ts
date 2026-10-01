import { EMMA_START_KEYWORDS, EMMA_STOP_KEYWORDS } from "../../../../ai-configs/emma/system";

/**
 * Classify an inbound WhatsApp/SMS reply. Only a message that is JUST the keyword counts
 * (case-insensitive, surrounding whitespace and trailing punctuation ignored), so "please don't
 * stop calling" is a reply, not an opt-out. Twilio's own OptOutType (SMS Advanced Opt-Out) wins
 * when present.
 */
export type InboundKind = "stop" | "start" | "reply";

export function classifyInbound(body: string | undefined, optOutType?: string | undefined): InboundKind {
  const ot = (optOutType ?? "").toUpperCase();
  if (ot === "STOP") return "stop";
  if (ot === "START") return "start";
  const s = (body ?? "").trim().toLowerCase().replace(/[.!?\s]+$/g, "").replace(/\s+/g, " ");
  if ((EMMA_STOP_KEYWORDS as readonly string[]).includes(s)) return "stop";
  if ((EMMA_START_KEYWORDS as readonly string[]).includes(s)) return "start";
  return "reply";
}

/** "whatsapp:+2782…" → { channel: "whatsapp", phone: "+2782…" }. */
export function parseAddress(from: string | undefined): { channel: "whatsapp" | "sms"; address: string } {
  const f = (from ?? "").trim();
  if (f.toLowerCase().startsWith("whatsapp:")) return { channel: "whatsapp", address: f.slice("whatsapp:".length) };
  return { channel: "sms", address: f };
}
