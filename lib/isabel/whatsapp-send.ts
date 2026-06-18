import { formatForWhatsApp } from "./twilio";

/**
 * Async WhatsApp delivery for Isabel — makes her feel human.
 *
 * Instead of one synchronous TwiML <Message> (silence → wall of text), we:
 *   1. fire a WhatsApp typing indicator (the three dots) + mark the inbound read,
 *   2. split her reply into 2–3 short bubbles,
 *   3. send each bubble via the Twilio REST API after a length-proportional,
 *      human-paced "typing" delay, re-firing the indicator before each one.
 *
 * Must run inside Next's `after()` so the serverless function stays alive for
 * the delays (a naive setTimeout after the response returns is killed on Vercel).
 *
 * Typing indicator: Twilio native WhatsApp support (Public Beta, Oct 2025).
 * A single call shows the dots AND marks the referenced inbound message as read;
 * it auto-clears on delivery or after ~25s.
 */

const REST_BASE = "https://api.twilio.com/2010-04-01";
const TYPING_URL = "https://messaging.twilio.com/v3/Indicators/Typing.json";

const MS_PER_CHAR = 22; // ~50 wpm typing feel
const MIN_DELAY_MS = 800;
const MAX_DELAY_MS = 7000;
const MAX_BUBBLES = 4;
const SOFT_CHUNK_LEN = 320; // paragraphs longer than this get sentence-split

function creds(): { sid: string; token: string; from: string } | null {
  const sid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = (process.env.WHATSAPP_FROM || "whatsapp:+27600132533").trim();
  if (!sid || !token) return null;
  return { sid, token, from };
}

/** True when REST sending is configured — otherwise the caller should fall back to TwiML. */
export function asyncSendConfigured(): boolean {
  return creds() !== null;
}

function authHeader(sid: string, token: string): string {
  return "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Human-paced delay before the NEXT bubble, proportional to its length, with jitter. */
export function typingDelayMs(text: string): number {
  const base = Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, text.length * MS_PER_CHAR));
  const jitter = 1 + (Math.random() * 0.3 - 0.15); // ±15%
  return Math.round(base * jitter);
}

/**
 * Split a reply into natural WhatsApp bubbles. Paragraphs (blank-line separated)
 * are the primary unit; an over-long prose paragraph is split on sentence
 * boundaries. Numbered/bulleted lists (e.g. slot offers) are kept intact as one
 * bubble so they read cleanly. Capped at MAX_BUBBLES.
 */
export function chunkReply(text: string): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const bubbles: string[] = [];
  for (const para of paragraphs) {
    const isList = /(^|\n)\s*(\d+[.)]|[-•])\s/.test(para);
    if (isList || para.length <= SOFT_CHUNK_LEN) {
      bubbles.push(para);
      continue;
    }
    // Long prose paragraph → split into sentence groups under the soft cap.
    const sentences = para.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [para];
    let buf = "";
    for (const s of sentences) {
      const piece = s.trim();
      if (!piece) continue;
      if (buf && (buf.length + piece.length + 1) > SOFT_CHUNK_LEN) {
        bubbles.push(buf.trim());
        buf = piece;
      } else {
        buf = buf ? `${buf} ${piece}` : piece;
      }
    }
    if (buf.trim()) bubbles.push(buf.trim());
  }

  if (bubbles.length <= MAX_BUBBLES) return bubbles;
  // Too many — keep the first MAX_BUBBLES-1 and merge the tail so nothing is lost.
  const head = bubbles.slice(0, MAX_BUBBLES - 1);
  head.push(bubbles.slice(MAX_BUBBLES - 1).join("\n\n"));
  return head;
}

/**
 * Fire the WhatsApp typing indicator for an inbound message. Best-effort:
 * any failure (beta endpoint, bad SID) is logged and swallowed — it must never
 * affect message delivery. `messageId` is the inbound Twilio MessageSid.
 */
export async function sendTypingIndicator(messageId: string): Promise<void> {
  const c = creds();
  if (!c || !messageId) return;
  try {
    const res = await fetch(TYPING_URL, {
      method: "POST",
      headers: { Authorization: authHeader(c.sid, c.token), "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "WHATSAPP", messageId }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[isabel-whatsapp] typing indicator ${res.status}: ${body.slice(0, 200)}`);
    }
  } catch (e) {
    console.warn("[isabel-whatsapp] typing indicator error (non-fatal)", e);
  }
}

/** Send one WhatsApp text bubble via the Twilio REST API. */
async function sendText(c: NonNullable<ReturnType<typeof creds>>, to: string, body: string): Promise<void> {
  const res = await fetch(`${REST_BASE}/Accounts/${c.sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: authHeader(c.sid, c.token), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ From: c.from, To: to, Body: body }).toString(),
  });
  if (!res.ok) {
    const data = await res.text().catch(() => "");
    console.error(`[isabel-whatsapp] REST send failed ${res.status}: ${data.slice(0, 300)}`);
  }
}

/**
 * Deliver Isabel's reply as a human-paced burst. Run inside `after()`.
 * Re-fires the typing indicator before each bubble (the 25s window decays),
 * then waits a length-proportional delay so the dots show before the text lands.
 */
export async function sendBurst(params: { to: string; messageSid: string; text: string }): Promise<void> {
  const c = creds();
  if (!c) {
    console.error("[isabel-whatsapp] sendBurst called without Twilio creds");
    return;
  }
  const bubbles = chunkReply(formatForWhatsApp(params.text));
  for (const bubble of bubbles) {
    await sendTypingIndicator(params.messageSid);
    await sleep(typingDelayMs(bubble));
    await sendText(c, params.to, bubble);
  }
}
