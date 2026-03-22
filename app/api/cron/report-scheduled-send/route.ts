import { NextResponse } from "next/server";
import { withApiMonitoring } from "../../../../lib/monitoring/api";
import { withCrmHandler } from "../../../../lib/crm/http";
import { processDueScheduledReportSends, sendScheduledReportReminders } from "../../../../lib/crm/report-review";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function isCronAuthorized(req: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return true;
  const authHeader = req.headers.get("authorization")?.trim() || req.headers.get("Authorization")?.trim() || "";
  const expected = `Bearer ${secret}`;
  if (authHeader === expected || authHeader === secret) return true;
  const url = new URL(req.url);
  const provided = (url.searchParams.get("secret") || "").trim();
  return provided === secret;
}

async function handler(req: Request) {
  if (!isCronAuthorized(req)) return unauthorized();
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") || "all";

  return withCrmHandler(async (db) => {
    let reminders = { reminded: 0 };
    let sends: Awaited<ReturnType<typeof processDueScheduledReportSends>> = [];
    if (mode === "remind" || mode === "all") {
      reminders = await sendScheduledReportReminders(db);
    }
    if (mode === "send" || mode === "all") {
      sends = await processDueScheduledReportSends(db);
    }
    return NextResponse.json({ ok: true, reminders, sends });
  });
}

export const GET = withApiMonitoring({ route: "/api/cron/report-scheduled-send", method: "GET", handler });
export const POST = withApiMonitoring({ route: "/api/cron/report-scheduled-send", method: "POST", handler });
