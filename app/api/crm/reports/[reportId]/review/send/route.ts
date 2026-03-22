import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiMonitoring } from "../../../../../../../lib/monitoring/api";
import { withCrmHandler } from "../../../../../../../lib/crm/http";
import { sendReportReviewNow } from "../../../../../../../lib/crm/report-review";
import { requirePermission } from "../../../../../../../lib/admin/api-auth";

const Recipients = z.object({
  primary: z.string(),
  additional: z.array(z.string()),
});

const Channels = z.object({
  email: z.boolean(),
  whatsapp: z.boolean(),
  pdf: z.boolean(),
});

const Body = z.object({
  client_id: z.string().uuid(),
  client_name: z.string().min(1),
  subject: z.string(),
  body_text: z.string(),
  personalization_notes: z.string(),
  recipients: Recipients,
  channels: Channels,
  actor: z.string().min(1),
  video_url: z.string().nullable().optional(),
  whatsapp_to: z.string().nullable().optional(),
  customization: z.record(z.unknown()).optional(),
});

async function handler(req: Request, ctx: { params: Promise<{ reportId: string }> }) {
  const gate = await requirePermission("send_reports");
  if (!gate.ok) return gate.response;

  const { reportId } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }

  return withCrmHandler(async (db) => {
    const out = await sendReportReviewNow(db, reportId, {
      ...parsed.data,
      video_url: parsed.data.video_url ?? null,
      whatsapp_to: parsed.data.whatsapp_to ?? null,
    });
    if (!out.ok) {
      const msg = "error" in out ? out.error : "send_failed";
      const clientErr =
        typeof msg === "string" &&
        (msg.includes("WhatsApp") || msg.includes("Video URL") || msg.includes("Invalid email") || msg.includes("recipient"));
      return NextResponse.json(
        { ok: false, error: msg, raw: "raw" in out ? out.raw : undefined },
        { status: clientErr ? 400 : 502 },
      );
    }
    return NextResponse.json({ ok: true, delivery: out.delivery, pdf_download_path: out.pdf_download_path });
  });
}

export const POST = withApiMonitoring({ route: "/api/crm/reports/[reportId]/review/send", method: "POST", handler });
