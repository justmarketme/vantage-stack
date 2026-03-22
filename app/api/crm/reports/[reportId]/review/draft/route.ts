import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiMonitoring } from "../../../../../../../lib/monitoring/api";
import { withCrmHandler } from "../../../../../../../lib/crm/http";
import { saveReviewDraft } from "../../../../../../../lib/crm/report-review";

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
  subject: z.string(),
  body_text: z.string(),
  personalization_notes: z.string(),
  recipients: Recipients,
  channels: Channels,
  status: z.enum(["draft", "ready"]),
  actor: z.string().min(1),
  customization: z.record(z.unknown()).optional(),
});

async function handler(req: Request, ctx: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  return withCrmHandler(async (db) => {
    await saveReviewDraft(db, reportId, parsed.data);
    return NextResponse.json({ ok: true });
  });
}

export const POST = withApiMonitoring({ route: "/api/crm/reports/[reportId]/review/draft", method: "POST", handler });
