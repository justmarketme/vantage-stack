import { applyStatusCallback } from "@/lib/consultant/server/emma/sender";
import { handleWebhook, readTwilioWebhook } from "@/lib/consultant/server/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Twilio message status callbacks (no session). The sender sets StatusCallback to exactly
 * `${cfg.publicUrl}/api/webhooks/emma-status` (no query), which is the URL
 * `verifyTwilioRequest` rebuilds from the configured origin + this path — so the signature
 * check matches. Unknown SIDs are acknowledged (200) so Twilio stops retrying.
 */
export async function POST(req: Request) {
  const w = await readTwilioWebhook(req);
  if (w instanceof Response) return w;
  const sid = w.params.MessageSid || w.params.SmsSid;
  const status = w.params.MessageStatus || w.params.SmsStatus;
  if (!sid || !status) return new Response(null, { status: 200 });
  return handleWebhook("emma.status", async (db) => {
    await applyStatusCallback(db, { sid, status, errorCode: w.params.ErrorCode || null });
  });
}
