import { NextResponse } from "next/server";
import { connectProspectingDb } from "../../../../../../lib/prospecting/db";
import { updateEngagementStatus, getProspect, updateProspectStage } from "../../../../../../lib/prospecting/service";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await connectProspectingDb();
  if (!db) return NextResponse.json({ ok: false, error: "No database" }, { status: 500 });

  const engagement = await updateEngagementStatus(db, id, "approved", { approved_by: "teams" });
  if (!engagement) return NextResponse.json({ ok: false, error: "Engagement not found" }, { status: 404 });

  if (engagement.prospect_id) {
    await updateProspectStage(db, engagement.prospect_id, "contacted");
  }

  return NextResponse.json({
    ok: true,
    message: "Engagement approved. You can now post it.",
    engagement,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return GET(req, { params });
}
