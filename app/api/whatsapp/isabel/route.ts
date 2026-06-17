import { NextResponse } from "next/server";
import { connectCrmDb } from "../../../../lib/crm/db";
import { askIsabel } from "../../../../lib/isabel/elevenlabs-text";
import {
  ensureWhatsAppSchema,
  getThread,
  appendTurns,
  linkLeadClient,
  touchInbound,
  setOptedOut,
  setBookingState,
  type WhatsAppThread,
} from "../../../../lib/isabel/whatsapp-store";
import { captureWhatsAppLead } from "../../../../lib/isabel/lead-capture";
import { validateTwilioSignatureAny, formatForWhatsApp, twimlMessage, twimlEmpty } from "../../../../lib/isabel/twilio";
import { getUpcomingSlots, createBooking, bookingLink } from "../../../../lib/calcom/booking";
import {
  parseBookDirective,
  stripDirectives,
  isOptOut,
  parseSlotChoice,
  composeOffer,
  composeConfirmation,
} from "../../../../lib/isabel/booking-flow";

const MAX_OFFER = 3;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// ConvAI's text round-trip (greeting + reply over WebSocket) can take ~5-10s;
// give the function headroom so a real reply isn't cut to the fallback.
export const maxDuration = 30;

const FALLBACK_REPLY =
  "Thanks for your message! I'm having a brief technical hiccup — please try again in a moment, or visit our website and I'll be right there to help.";

function xml(body: string, status = 200) {
  return new NextResponse(body, { status, headers: { "Content-Type": "text/xml" } });
}

const WEBHOOK_PATH = "/api/whatsapp/isabel";

/** Swap apex <-> www so either host variant validates. */
function hostVariant(url: string): string | null {
  try {
    const u = new URL(url);
    u.host = u.host.startsWith("www.") ? u.host.slice(4) : `www.${u.host}`;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Candidate URLs Twilio may have signed. Twilio signs the EXACT configured
 * callback URL; we reconstruct it from the request headers (most reliable
 * behind Vercel's proxy) and fall back to env + host variants.
 */
function candidateUrls(req: Request): string[] {
  const out: string[] = [];
  const push = (u: string | null | undefined) => {
    if (u) {
      out.push(u);
      const v = hostVariant(u);
      if (v) out.push(v);
    }
  };

  const override = (process.env.ISABEL_WHATSAPP_WEBHOOK_URL || "").trim();
  if (override) push(override);

  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (host) push(`${proto}://${host}${WEBHOOK_PATH}`);

  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (base) push(`${base}${WEBHOOK_PATH}`);

  return out;
}

export async function POST(req: Request) {
  // Twilio posts application/x-www-form-urlencoded.
  const form = await req.formData().catch(() => null);
  if (!form) return xml(twimlEmpty(), 400);

  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = typeof v === "string" ? v : "";

  // ── Signature validation ─────────────────────────────────────────────
  const authToken = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  const skipValidation = process.env.ISABEL_WHATSAPP_SKIP_VALIDATION === "1";
  if (!skipValidation) {
    const urls = candidateUrls(req);
    const ok = validateTwilioSignatureAny({
      authToken,
      signature: req.headers.get("x-twilio-signature"),
      urls,
      body: params,
    });
    if (!ok) {
      console.warn(`[isabel-whatsapp] rejected: invalid Twilio signature. tried=${JSON.stringify(urls)}`);
      return xml(twimlEmpty(), 403);
    }
  }

  const from = (params.From || "").trim(); // e.g. "whatsapp:+27..."
  const message = (params.Body || "").trim();
  const profileName = (params.ProfileName || "").trim() || null;
  if (!from || !message) return xml(twimlEmpty());

  const phone = from; // keep the whatsapp: prefix as the thread key

  const db = await connectCrmDb();
  if (!db) {
    console.error("[isabel-whatsapp] no DATABASE_URL");
    return xml(twimlMessage(FALLBACK_REPLY));
  }

  try {
    await ensureWhatsAppSchema(db);

    // ── Opt-out (STOP) ─────────────────────────────────────────────────
    if (isOptOut(message)) {
      await touchInbound(db, phone, profileName);
      await setOptedOut(db, phone, true);
      return xml(twimlMessage("You're unsubscribed and won't receive further messages. Reply here anytime to start chatting again."));
    }

    await touchInbound(db, phone, profileName);
    const thread = await getThread(db, phone);
    // A fresh inbound (not STOP) means they re-engaged → clear any prior opt-out.
    if (thread?.opted_out) {
      try { await setOptedOut(db, phone, false); } catch { /* non-fatal */ }
    }
    const prior = thread?.transcript ?? [];

    // ── Booking: handle a slot choice while we're offering times ───────
    if (thread && thread.booking_status === "offering" && thread.booking_offered.length) {
      const handled = await handleSlotChoice(db, thread, phone, profileName, message, prior);
      if (handled) return xml(twimlMessage(handled));
      // not a parseable choice → fall through so Isabel can answer their question
    }

    // ── Normal turn: ask Isabel ────────────────────────────────────────
    const result = await askIsabel({ message, history: prior });
    if (!result.ok) {
      console.error("[isabel-whatsapp] askIsabel failed:", result.error);
      return xml(twimlMessage(FALLBACK_REPLY));
    }

    const display = stripDirectives(result.reply) || "Sure — how can I help?";
    const dir = parseBookDirective(result.reply);

    let reply = display;
    // Isabel signalled a booking and we have name + email → start the slot offer.
    if (dir.has && dir.name && dir.email && thread?.booking_status !== "booked") {
      const slots = await getUpcomingSlots();
      const offered = slots.slice(0, MAX_OFFER).map((s) => s.start);
      if (offered.length) {
        await setBookingState(db, phone, { status: "offering", offered, name: dir.name, email: dir.email, markIntent: true });
        const offer = composeOffer(dir.name, offered);
        reply = display ? `${display}\n\n${offer}` : offer;
      } else {
        reply = `${display}\n\nYou can grab a time here: ${bookingLink()}`;
      }
    }

    await safeAppend(db, phone, profileName, message, reply, prior);

    // Lead capture (best-effort — never blocks the reply).
    try {
      const updated = [...prior, { role: "user" as const, content: message }, { role: "assistant" as const, content: reply }];
      const clientId = await captureWhatsAppLead(db, { phone, transcript: updated });
      if (clientId && clientId !== thread?.lead_client_id) await linkLeadClient(db, phone, clientId);
    } catch (e) {
      console.error("[isabel-whatsapp] lead capture failed (non-fatal)", e);
    }

    return xml(twimlMessage(formatForWhatsApp(reply)));
  } catch (e) {
    console.error("[isabel-whatsapp] handler error", e);
    return xml(twimlMessage(FALLBACK_REPLY));
  }
}

/** Persist a turn; storage failure must never block the reply. */
async function safeAppend(
  db: Awaited<ReturnType<typeof connectCrmDb>>,
  phone: string,
  profileName: string | null,
  userMessage: string,
  assistantReply: string,
  prior: { role: "user" | "assistant"; content: string }[],
): Promise<void> {
  if (!db) return;
  try {
    await appendTurns(db, { phone, profileName, userMessage, assistantReply, prior });
  } catch (e) {
    console.error("[isabel-whatsapp] appendTurns failed (non-fatal)", e);
  }
}

/**
 * While offering slots, interpret the reply. Returns the message to send, or
 * null when the reply isn't a slot choice (so Isabel handles it normally).
 */
async function handleSlotChoice(
  db: NonNullable<Awaited<ReturnType<typeof connectCrmDb>>>,
  thread: WhatsAppThread,
  phone: string,
  profileName: string | null,
  message: string,
  prior: { role: "user" | "assistant"; content: string }[],
): Promise<string | null> {
  const choice = parseSlotChoice(message, thread.booking_offered.length);
  if (choice === null) return null;

  if (choice === "more") {
    const slots = await getUpcomingSlots();
    const next = slots.slice(MAX_OFFER, MAX_OFFER * 2).map((s) => s.start);
    const offered = next.length ? next : slots.slice(0, MAX_OFFER).map((s) => s.start);
    await setBookingState(db, phone, { status: "offering", offered, name: thread.booking_name, email: thread.booking_email });
    const reply = offered.length ? composeOffer(thread.booking_name, offered) : `You can grab a time here: ${bookingLink()}`;
    await safeAppend(db, phone, profileName, message, reply, prior);
    return reply;
  }

  const iso = thread.booking_offered[choice];
  const email = thread.booking_email || "";
  if (!iso || !email) return null; // missing email → let Isabel collect it

  const r = await createBooking({
    startISO: iso,
    name: thread.booking_name || "WhatsApp lead",
    email,
    notes: "Booked via Isabel on WhatsApp",
  });
  if (r.ok) {
    await setBookingState(db, phone, { status: "booked", offered: [], uid: r.uid });
    const reply = composeConfirmation(thread.booking_name, r.start, email);
    await safeAppend(db, phone, profileName, message, reply, prior);
    return reply;
  }

  // Slot just taken / booking failed → re-offer fresh times.
  console.error("[isabel-whatsapp] booking failed:", r.error);
  const slots = await getUpcomingSlots();
  const offered = slots.slice(0, MAX_OFFER).map((s) => s.start);
  await setBookingState(db, phone, { status: offered.length ? "offering" : "none", offered, name: thread.booking_name, email });
  const reply = offered.length
    ? `Ah — that time was just taken. ${composeOffer(thread.booking_name, offered)}`
    : `That time was just taken and I couldn't pull more right now — you can pick one here: ${bookingLink()}`;
  await safeAppend(db, phone, profileName, message, reply, prior);
  return reply;
}
