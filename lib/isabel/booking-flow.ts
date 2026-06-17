import { formatSlot } from "../calcom/booking";

/**
 * WhatsApp booking helpers: parse Isabel's booking directive, opt-out and slot
 * choices, and compose the handler-driven booking messages (slot offer +
 * confirmation). Slot/ISO selection is owned by our code, not the agent.
 */

const DIRECTIVE_RE = /%%\s*BOOK\b([^%]*)%%/i;

export type BookDirective = { has: boolean; name: string | null; email: string | null };

/** Detect + parse `%%BOOK name="..." email="..."%%` in Isabel's reply. */
export function parseBookDirective(text: string): BookDirective {
  const m = text.match(DIRECTIVE_RE);
  if (!m) return { has: false, name: null, email: null };
  const inner = m[1] || "";
  const name = inner.match(/name\s*=\s*"([^"]*)"/i)?.[1]?.trim() || null;
  const email = inner.match(/email\s*=\s*"([^"]*)"/i)?.[1]?.trim() || null;
  return { has: true, name: name || null, email: email || null };
}

/** Remove any `%%...%%` directive so it's never shown to the user. */
export function stripDirectives(text: string): string {
  return text.replace(/%%[^%]*%%/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

/** STOP / opt-out keywords (WhatsApp standard). */
export function isOptOut(message: string): boolean {
  return /^\s*(stop|unsubscribe|cancel|opt[\s-]?out|end|quit)\s*$/i.test(message);
}

/** Human / agent handoff request. */
export function wantsHuman(message: string): boolean {
  return /\b(speak|talk|chat)\s+(to|with)\s+(a\s+)?(human|person|agent|someone|real)\b|\bhuman\b|\breal person\b/i.test(message);
}

/** Parse a slot pick while offering: a 1-based index, or "more". */
export function parseSlotChoice(message: string, count: number): number | "more" | null {
  const t = message.trim().toLowerCase();
  if (/^(more|other|others|another|different|more times|other times|next)\b/.test(t)) return "more";
  const ordinal: Record<string, number> = { first: 1, second: 2, third: 3, "1st": 1, "2nd": 2, "3rd": 3 };
  for (const k of Object.keys(ordinal)) if (t.includes(k)) { const n = ordinal[k]; if (n <= count) return n - 1; }
  const m = t.match(/\b([1-9])\b/);
  if (m) { const n = Number(m[1]); if (n >= 1 && n <= count) return n - 1; }
  return null;
}

/** Compose the numbered slot offer (free-form, in-session). */
export function composeOffer(name: string | null, offeredISO: string[]): string {
  const first = (name || "").trim().split(/\s+/)[0];
  const hi = first ? `Perfect, ${first}! ` : "Perfect! ";
  const lines = offeredISO.map((iso, i) => `${i + 1}. ${formatSlot(iso)}`).join("\n");
  return (
    `${hi}Here are the next available times for your free 30-minute strategy call (times in SAST):\n\n` +
    `${lines}\n\n` +
    `Just reply *1*, *2* or *3* to lock it in — or say "more times" if none of these suit.`
  );
}

/** Compose the booking confirmation (free-form, in-session). */
export function composeConfirmation(name: string | null, startISO: string, email: string): string {
  const first = (name || "").trim().split(/\s+/)[0];
  const hi = first ? `You're all set, ${first}! ` : "You're all set! ";
  return (
    `${hi}✅ Your free 30-minute strategy call is booked for *${formatSlot(startISO)}*. ` +
    `A calendar invite is on its way to ${email}. Looking forward to it — chat soon!`
  );
}
