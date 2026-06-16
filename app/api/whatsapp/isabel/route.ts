import { NextResponse } from "next/server";
import { connectCrmDb } from "../../../../lib/crm/db";
import { askIsabel } from "../../../../lib/isabel/elevenlabs-text";
import { ensureWhatsAppSchema, getThread, appendTurns, linkLeadClient } from "../../../../lib/isabel/whatsapp-store";
import { captureWhatsAppLead } from "../../../../lib/isabel/lead-capture";
import { validateTwilioSignatureAny, formatForWhatsApp, twimlMessage, twimlEmpty } from "../../../../lib/isabel/twilio";

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

/**
 * Temporary protected diagnostic: GET ?key=<NOTIFY_WEBHOOK_SECRET> isolates
 * whether failures come from the brain (askIsabel) or the DB layer.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = (process.env.NOTIFY_WEBHOOK_SECRET || "").trim();
  if (!secret || url.searchParams.get("key") !== secret) return new NextResponse("Not found", { status: 404 });

  const out: Record<string, unknown> = {};
  // Brain check
  try {
    const t = Date.now();
    out.askIsabel = await askIsabel({ message: url.searchParams.get("msg") || "What does VantageStack do?" });
    out.askMs = Date.now() - t;
  } catch (e) {
    out.askThrew = e instanceof Error ? e.message : String(e);
  }
  // Full POST-sequence check — find the exact thrower.
  const db = await connectCrmDb().catch((e) => { out.connectThrew = String(e); return null; });
  if (db) {
    const phone = "whatsapp:+27000000111";
    try { await ensureWhatsAppSchema(db); out.ensure = "ok"; } catch (e) { out.ensureThrew = e instanceof Error ? e.message : String(e); }
    try { out.getThread = Boolean(await getThread(db, phone)); } catch (e) { out.getThreadThrew = e instanceof Error ? e.message : String(e); }
    try {
      await appendTurns(db, { phone, profileName: "Diag", userMessage: "diag", assistantReply: "diag reply", prior: [] });
      out.appendTurns = "ok";
    } catch (e) { out.appendTurnsThrew = e instanceof Error ? e.message : String(e); }
    try {
      const cid = await captureWhatsAppLead(db, { phone, transcript: [{ role: "user", content: "diag" }] });
      out.captureLead = { clientId: cid };
    } catch (e) { out.captureLeadThrew = e instanceof Error ? e.message : String(e); }
    // Do NOT end the shared singleton pool — it is reused across warm invocations.
  }
  return NextResponse.json(out);
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
    const thread = await getThread(db, phone);
    const prior = thread?.transcript ?? [];

    const result = await askIsabel({ message, history: prior });
    if (!result.ok) {
      console.error("[isabel-whatsapp] askIsabel failed:", result.error);
      return xml(twimlMessage(FALLBACK_REPLY));
    }

    const reply = result.reply;

    // Persistence + CRM lead capture are best-effort: a DB write failure must
    // NEVER block Isabel's real reply. Each step is isolated so one failure
    // can't abort the others, and none can fall through to the fallback reply.
    try {
      await appendTurns(db, { phone, profileName, userMessage: message, assistantReply: reply, prior });
    } catch (e) {
      console.error("[isabel-whatsapp] appendTurns failed (non-fatal)", e);
    }

    try {
      const updatedTranscript = [
        ...prior,
        { role: "user" as const, content: message },
        { role: "assistant" as const, content: reply },
      ];
      const clientId = await captureWhatsAppLead(db, { phone, transcript: updatedTranscript });
      if (clientId && clientId !== thread?.lead_client_id) {
        await linkLeadClient(db, phone, clientId);
      }
    } catch (e) {
      console.error("[isabel-whatsapp] lead capture failed (non-fatal)", e);
    }

    return xml(twimlMessage(formatForWhatsApp(reply)));
  } catch (e) {
    console.error("[isabel-whatsapp] handler error", e);
    return xml(twimlMessage(FALLBACK_REPLY));
  }
}
