import type { NextRequest } from "next/server";
import { formToParams, validTwilioSignature } from "@/lib/clinic-crm/auth/twilioSignature";
import { audit, clinicDb } from "@/lib/clinic-crm/db";
import { signedUrl } from "@/lib/clinic-crm/server/http";
import { applyDeliveryStatus } from "@/lib/clinic-crm/server/repo/messages";
import { setOptedOut } from "@/lib/clinic-crm/server/repo/patients";
import { isKnownOutboundStatus } from "@/lib/clinic-crm/server/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Twilio error code meaning the recipient has unsubscribed at the carrier/Twilio level. */
const UNSUBSCRIBED_CODE = "21610";

/**
 * Delivery status callback. Idempotent and order-proof: a status is only applied if
 * it moves the message forward (queued < sending < sent < delivered/failed < read),
 * enforced in the UPDATE's WHERE clause.
 */
export async function POST(req: NextRequest) {
  let params: Record<string, string>;
  try {
    params = formToParams(await req.formData());
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!validTwilioSignature(signedUrl(req), params, req.headers.get("x-twilio-signature"))) {
    return new Response("Forbidden", { status: 403 });
  }
  const sid = params.MessageSid || params.SmsSid || "";
  const status = (params.MessageStatus || params.SmsStatus || "").toLowerCase();
  if (!sid || !isKnownOutboundStatus(status)) return new Response(null, { status: 204 });
  const errorCode = params.ErrorCode ? String(params.ErrorCode).slice(0, 16) : null;
  try {
    const sql = await clinicDb();
    const changed = await applyDeliveryStatus(sql, sid, status, errorCode);
    if (changed && errorCode === UNSUBSCRIBED_CODE) {
      await setOptedOut(sql, changed.clinic_id, changed.patient_id, true);
      await audit(sql, changed.clinic_id, "twilio", "opt_out", "patient", changed.patient_id);
    }
  } catch (e) {
    console.error("[clinic-crm] status webhook failed", (e as { code?: string }).code ?? (e as Error).name);
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
