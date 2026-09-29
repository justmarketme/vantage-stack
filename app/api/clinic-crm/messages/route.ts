import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/clinic-crm/auth/session";
import { rateLimit } from "@/lib/clinic-crm/auth/rateLimit";
import { audit, clinicDb } from "@/lib/clinic-crm/db";
import { SendMessageInput } from "@/lib/clinic-crm/types";
import { CRM_CONFIG } from "@/lib/clinic-crm/server/config";
import { apiError, parseBody, route } from "@/lib/clinic-crm/server/http";
import { sendManual } from "@/lib/clinic-crm/server/messaging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REASON_TEXT: Record<string, string> = {
  not_found: "Patient not found",
  opted_out: "This patient has opted out of messages",
  whatsapp_window_closed: "The WhatsApp 24-hour window has closed. The patient must message first, or send by SMS",
  whatsapp_not_configured: "WhatsApp is not set up for this clinic",
  sms_not_configured: "SMS is not set up for this clinic",
  no_sender: "No messaging channel is set up for this clinic",
  invalid_number: "This patient's number can't receive messages",
  send_failed: "The message couldn't be sent. Please try again",
};

export const POST = route("messages.send", async (req: NextRequest) => {
  const s = await requireSession(req);
  if (s instanceof NextResponse) return s;
  const { sendRateLimit, sendRateWindowMs } = CRM_CONFIG.api;
  if (!rateLimit(`clinic-crm:send:${s.staffId}`, sendRateLimit, sendRateWindowMs)) {
    return apiError(429, "Too many messages. Please wait a moment");
  }
  const body = await parseBody(req, SendMessageInput);
  if (!body.ok) return body.res;
  const sql = await clinicDb();
  const res = await sendManual(sql, s.clinicId, s.staffId, body.data);
  if (!res.ok) {
    const fields = res.reason === "invalid_number" ? { patientId: REASON_TEXT.invalid_number } : undefined;
    return apiError(res.status, REASON_TEXT[res.reason] ?? REASON_TEXT.send_failed, fields);
  }
  await audit(sql, s.clinicId, s.staffId, "send_message", "patient", body.data.patientId);
  return NextResponse.json(res.message, { status: 201 });
});
