import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiMonitoring } from "../../../../../../../lib/monitoring/api";
import { withCrmHandler } from "../../../../../../../lib/crm/http";
import { scheduleReviewSend, validateChannels, validateRecipients } from "../../../../../../../lib/crm/report-review";

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
  scheduled_for: z.string().min(1),
  subject: z.string(),
  body_text: z.string(),
  personalization_notes: z.string(),
  recipients: Recipients,
  channels: Channels,
  actor: z.string().min(1),
  customization: z.record(z.unknown()).optional(),
});

async function handler(req: Request, ctx: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const vr = validateRecipients(parsed.data.recipients);
  if (!vr.ok) return NextResponse.json({ ok: false, error: vr.error }, { status: 400 });
  const vc = validateChannels(parsed.data.channels);
  if (!vc.ok) return NextResponse.json({ ok: false, error: vc.error }, { status: 400 });

  const t = new Date(parsed.data.scheduled_for);
  if (Number.isNaN(t.getTime())) {
    return NextResponse.json({ ok: false, error: "Invalid scheduled_for datetime" }, { status: 400 });
  }
  const max = Date.now() + 30 * 24 * 60 * 60 * 1000;
  if (t.getTime() > max) {
    return NextResponse.json({ ok: false, error: "Scheduled time cannot be more than 30 days in advance." }, { status: 400 });
  }
  if (t.getTime() < Date.now() - 60_000) {
    return NextResponse.json({ ok: false, error: "Scheduled time must be in the future." }, { status: 400 });
  }

  return withCrmHandler(async (db) => {
    await scheduleReviewSend(db, reportId, {
      ...parsed.data,
      scheduled_for: t.toISOString(),
    });
    return NextResponse.json({
      ok: true,
      note: "Scheduled. Cron /api/cron/report-scheduled-send dispatches due sends and sends ~1h reminders via Telegram.",
    });
  });
}

export const POST = withApiMonitoring({ route: "/api/crm/reports/[reportId]/review/schedule", method: "POST", handler });
