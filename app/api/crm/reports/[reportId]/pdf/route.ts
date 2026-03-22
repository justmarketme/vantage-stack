import { NextResponse } from "next/server";
import { withApiMonitoring } from "../../../../../../lib/monitoring/api";
import { withCrmHandler } from "../../../../../../lib/crm/http";
import { buildReportNarrative, consultationUrl, getReportReviewBundle } from "../../../../../../lib/crm/report-review";
import { buildReportHandoffPdf } from "../../../../../../lib/crm/report-pdf";

async function handler(_req: Request, ctx: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await ctx.params;
  return withCrmHandler(async (db) => {
    const bundle = await getReportReviewBundle(db, reportId);
    if (!bundle.ok) return NextResponse.json(bundle, { status: 404 });
    const report = bundle.report as Record<string, unknown>;
    const narrative =
      typeof report.report_markdown === "string" && report.report_markdown.trim()
        ? report.report_markdown
        : buildReportNarrative(report);
    const buf = buildReportHandoffPdf({
      clientName: String(report.client_name ?? "Client"),
      narrativeMarkdownPlain: narrative,
      videoUrl: report.video_url ? String(report.video_url) : "",
      consultationUrl: consultationUrl(),
    });
    const filename = `vantagestack-report-${reportId.slice(0, 8)}.pdf`;
    return new NextResponse(Buffer.from(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  });
}

export const GET = withApiMonitoring({ route: "/api/crm/reports/[reportId]/pdf", method: "GET", handler });
