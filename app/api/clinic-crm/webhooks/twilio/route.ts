import { after, type NextRequest } from "next/server";
import { formToParams, validTwilioSignature } from "@/lib/clinic-crm/auth/twilioSignature";
import { audit, clinicDb } from "@/lib/clinic-crm/db";
import { signedUrl, twiml } from "@/lib/clinic-crm/server/http";
import { handleInbound } from "@/lib/clinic-crm/server/inbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Inbound SMS + WhatsApp. Signature-validated; replies with empty TwiML fast and
 * does any sending (STOP confirmation, new-lead ack) after the response via after().
 * Unknown numbers / duplicates get 200 (nothing to retry); a processing failure gets
 * 500 so Twilio retries — safe, because storage is idempotent by MessageSid.
 */
export async function POST(req: NextRequest) {
  let params: Record<string, string>;
  try {
    params = formToParams(await req.formData());
  } catch {
    return twiml(400);
  }
  if (!validTwilioSignature(signedUrl(req), params, req.headers.get("x-twilio-signature"))) {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    const sql = await clinicDb();
    const result = await handleInbound(sql, params, (c, actor, action, entity, id) => audit(sql, c, actor, action, entity, id));
    if (result.deferred) {
      const run = result.deferred;
      after(async () => {
        try {
          await run();
        } catch (e) {
          console.error("[clinic-crm] inbound follow-up failed", (e as { code?: string }).code ?? (e as Error).name);
        }
      });
    }
  } catch (e) {
    // Returning 500 lets Twilio retry (idempotent by MessageSid) — right for a transient DB outage.
    console.error("[clinic-crm] inbound webhook failed", (e as { code?: string }).code ?? (e as Error).name);
    return twiml(500);
  }
  return twiml();
}
