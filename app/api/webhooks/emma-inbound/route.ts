import { handleInbound } from "@/lib/consultant/server/emma/inbound";
import { kickEmma } from "@/lib/consultant/server/emma/sender";
import { handleWebhook, readTwilioWebhook } from "@/lib/consultant/server/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Twilio WhatsApp/SMS inbound messages (no session; X-Twilio-Signature over
 * `${cfg.publicUrl}/api/webhooks/emma-inbound` — configure exactly that URL on the Twilio
 * sender). STOP/START consent + consultant notification. The body is never logged or stored.
 * Answers empty TwiML (Emma's replies go through the outbox, not TwiML). Errors → 500 so Twilio
 * retries; every path is idempotent on MessageSid.
 */
export async function POST(req: Request) {
  const w = await readTwilioWebhook(req);
  if (w instanceof Response) return w;
  return handleWebhook("emma.inbound", async (db) => {
    await handleInbound(db, w.params);
    kickEmma();
  });
}
