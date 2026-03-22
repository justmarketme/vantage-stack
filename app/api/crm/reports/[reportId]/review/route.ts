import { NextResponse } from "next/server";
import { withApiMonitoring } from "../../../../../../lib/monitoring/api";
import { withCrmHandler } from "../../../../../../lib/crm/http";
import { getReportReviewBundle } from "../../../../../../lib/crm/report-review";

async function handler(_req: Request, ctx: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await ctx.params;
  return withCrmHandler(async (db) => {
    const out = await getReportReviewBundle(db, reportId);
    if (!out.ok) return NextResponse.json(out, { status: 404 });
    return NextResponse.json(out);
  });
}

export const GET = withApiMonitoring({ route: "/api/crm/reports/[reportId]/review", method: "GET", handler });
