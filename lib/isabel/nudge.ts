import type { Sql } from "postgres";
import { ensureWhatsAppSchema, getNudgeCandidates, setBookingState } from "./whatsapp-store";
import { bookingLink } from "../calcom/booking";

/**
 * One-time "didn't finish booking" nudge for WhatsApp leads who were offered
 * times but didn't pick one. Per docs/WHATSAPP_COMPLIANCE_PLAYBOOK.md:
 *  - anchored to LAST INBOUND, re-checked here at send time;
 *  - < 24h since last inbound → free-form Cal.com link (allowed in-session);
 *  - >= 24h (window closed)   → SUPPRESS (no approved MARKETING template);
 *  - exactly one nudge per lead.
 *
 * Runs both from a daily cron (backstop) and opportunistically after each
 * inbound webhook (for ~2h timeliness without a frequent cron / Pro plan).
 */

const TWENTY_FOUR_H = 24 * 60 * 60 * 1000;

export async function sendWhatsAppText(to: string, body: string): Promise<boolean> {
  const sid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = (process.env.TWILIO_WHATSAPP_FROM || process.env.WHATSAPP_FROM || "").trim();
  if (!sid || !token || !from) return false;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ From: from, To: to.startsWith("whatsapp:") ? to : `whatsapp:${to}`, Body: body }).toString(),
  });
  if (!res.ok) console.error("[isabel-nudge] send failed:", (await res.text()).slice(0, 200));
  return res.ok;
}

function nudgeBody(name: string | null): string {
  const first = (name || "").trim().split(/\s+/)[0];
  const hi = first ? `Hi ${first}! ` : "Hi! ";
  return (
    `${hi}It's Isabel from VantageStack — we didn't get to lock in your free 30-minute strategy call. ` +
    `Whenever you're ready, grab a time here: ${bookingLink()} — or just reply and I'll set it up for you.`
  );
}

/** Send (or compliantly suppress) all due nudges. Best-effort; never throws. */
export async function processDueNudges(db: Sql): Promise<{ candidates: number; sent: number; suppressed: number }> {
  try {
    await ensureWhatsAppSchema(db);
    const candidates = await getNudgeCandidates(db);
    let sent = 0;
    let suppressed = 0;
    for (const t of candidates) {
      const elapsed = t.last_inbound_at ? Date.now() - new Date(t.last_inbound_at).getTime() : Infinity;
      // Mark nudged in both branches → exactly one attempt, never re-checked.
      if (elapsed < TWENTY_FOUR_H) {
        const ok = await sendWhatsAppText(t.phone, nudgeBody(t.booking_name));
        if (ok) sent++;
      } else {
        suppressed++; // window closed → compliant suppression
      }
      await setBookingState(db, t.phone, { status: t.booking_status, offered: t.booking_offered, markNudged: true });
    }
    return { candidates: candidates.length, sent, suppressed };
  } catch (e) {
    console.error("[isabel-nudge] processDueNudges failed", e);
    return { candidates: 0, sent: 0, suppressed: 0 };
  }
}
