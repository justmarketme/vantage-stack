import type { Sql } from "postgres";
import type { IsabelTurn } from "./elevenlabs-text";
import { performClientIntake } from "../crm/intake";
import { BlueprintSubmitSchema } from "../blueprint/schema";

/**
 * Extract lead fields from a WhatsApp thread and capture into the CRM, mirroring
 * what the website widget does. The CRM `clients` table keys on email, so we can
 * only upsert a client once an email has surfaced — until then we just keep the
 * transcript (the WhatsApp number is retained on the thread regardless).
 */

export type ExtractedLead = {
  name?: string;
  email?: string;
  industry?: string;
};

const INDUSTRIES = [
  "e-commerce", "retail", "real estate", "construction", "healthcare", "technology",
  "financial", "hospitality", "education", "marketing", "food", "restaurant",
];

export function extractLead(transcript: IsabelTurn[]): ExtractedLead {
  const allText = transcript.map((t) => t.content).join(" ");
  const out: ExtractedLead = {};

  const emailMatch = allText.match(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/);
  if (emailMatch) out.email = emailMatch[0].toLowerCase();

  // Name: look for Isabel asking for a name, then the next user reply.
  const nameAsk = /name|call you|who (am i|are you)|didn'?t catch your name|what'?s your name/i;
  for (let i = 0; i < transcript.length - 1; i++) {
    const msg = transcript[i];
    const next = transcript[i + 1];
    if (msg.role === "assistant" && nameAsk.test(msg.content) && next.role === "user") {
      const reply = next.content.trim();
      const words = reply.split(/\s+/);
      if (words.length <= 5 && !/\b(my|the|it|is|are|i|we)\b/i.test(reply)) {
        out.name = reply;
        break;
      }
      const m = reply.match(/(?:i'?m|my name is|it'?s|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
      if (m) { out.name = m[1]; break; }
    }
  }

  for (const ind of INDUSTRIES) {
    if (new RegExp(ind, "i").test(allText)) {
      out.industry = ind.charAt(0).toUpperCase() + ind.slice(1);
      break;
    }
  }

  return out;
}

/**
 * Capture/refresh a WhatsApp lead in the CRM. Returns the client id when a lead
 * row was upserted, or null when there isn't enough info yet (no email).
 * Best-effort: never throws — lead capture must not break the chat reply.
 */
export async function captureWhatsAppLead(
  db: Sql,
  params: { phone: string; transcript: IsabelTurn[] },
): Promise<string | null> {
  try {
    const lead = extractLead(params.transcript);
    if (!lead.email) return null;

    const whatsapp = params.phone.replace(/^whatsapp:/, "");

    const parsed = BlueprintSubmitSchema.safeParse({
      clientName: lead.name || "WhatsApp lead",
      email: lead.email,
      whatsapp,
      industry: lead.industry || "Not specified",
      revenueRange: "Not specified",
    });
    if (!parsed.success) return null;

    const out = await performClientIntake(db, parsed.data, {
      source: "crm_manual",
      createdBy: "isabel_whatsapp",
      skipResearch: true,
    });
    return out.ok ? out.client_id : null;
  } catch (e) {
    console.error("[isabel-whatsapp] lead capture failed", e);
    return null;
  }
}
