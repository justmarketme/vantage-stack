import { NextResponse } from "next/server";
import { withApiMonitoring } from "../../../../lib/monitoring/api";
import { connectCrmDb } from "../../../../lib/crm/db";
import { ensureWhatsAppSchema, getNudgeCandidates, setBookingState } from "../../../../lib/isabel/whatsapp-store";
import { bookingLink } from "../../../../lib/calcom/booking";

/**
 * Hourly: one-time "you didn't finish booking" nudge for WhatsApp leads who were
 * offered times but didn't pick one. Per docs/WHATSAPP_COMPLIANCE_PLAYBOOK.md:
 *  - decision anchored to LAST INBOUND, re-checked here at send time;
 *  - < 24h since last inbound  → free-form Cal.com link (allowed in-session);
 *  - >= 24h (window closed)    → SUPPRESS (we have no approved MARKETING template);
 *  - exactly one nudge per lead (mark nudged in both cases so we never retry).
 */

const TWENTY_FOUR_H = 24 * 60 * 60 * 1000;

function isCronAuthorized(req: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return true;
  const auth = req.headers.get("authorization")?.trim() || "";
  if (auth === `Bearer ${secret}` || auth === secret) return true;
  const provided = (new URL(req.url).searchParams.get("secret") || "").trim();
  return Boolean(provided && provided === secret);
}

async function sendWhatsAppText(to: string, body: string): Promise<boolean> {
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
  if (!res.ok) console.error("[isabel-followup] send failed:", (await res.text()).slice(0, 200));
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

async function handler(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = await connectCrmDb();
  if (!db) return NextResponse.json({ ok: false, error: "no_database" }, { status: 500 });

  await ensureWhatsAppSchema(db);
  const candidates = await getNudgeCandidates(db);

  let sent = 0;
  let suppressed = 0;
  for (const t of candidates) {
    const elapsed = t.last_inbound_at ? Date.now() - new Date(t.last_inbound_at).getTime() : Infinity;
    if (elapsed < TWENTY_FOUR_H) {
      const ok = await sendWhatsAppText(t.phone, nudgeBody(t.booking_name));
      if (ok) sent++;
      // mark nudged regardless of send success → exactly one attempt
      await setBookingState(db, t.phone, { status: t.booking_status, offered: t.booking_offered, markNudged: true });
    } else {
      // Window closed → suppress (compliant). Mark nudged so we don't re-check.
      suppressed++;
      await setBookingState(db, t.phone, { status: t.booking_status, offered: t.booking_offered, markNudged: true });
    }
  }

  return NextResponse.json({ ok: true, candidates: candidates.length, sent, suppressed });
}

export const POST = withApiMonitoring({ route: "/api/cron/isabel-booking-followup", method: "POST", handler });
export const GET = withApiMonitoring({ route: "/api/cron/isabel-booking-followup", method: "GET", handler });
