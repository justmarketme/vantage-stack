import { NextResponse } from "next/server";
import { connectProspectingDb } from "../../../../lib/prospecting/db";
import { listEngagements, getPendingApprovals } from "../../../../lib/prospecting/service";
import type { EngagementStatus } from "../../../../lib/prospecting/types";

export async function GET(req: Request) {
  const db = await connectProspectingDb();
  if (!db) return NextResponse.json({ ok: false, error: "No database" }, { status: 500 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") as EngagementStatus | null;
  const prospect_id = url.searchParams.get("prospect_id") || undefined;
  const run_id = url.searchParams.get("run_id") || undefined;

  if (status === "pending_approval") {
    const approvals = await getPendingApprovals(db);
    return NextResponse.json({ ok: true, engagements: approvals });
  }

  const engagements = await listEngagements(db, {
    prospect_id,
    status: status || undefined,
    run_id,
  });

  return NextResponse.json({ ok: true, engagements });
}
