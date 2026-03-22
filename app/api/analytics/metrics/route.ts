import { NextResponse } from "next/server";
import { withApiMonitoring } from "../../../../lib/monitoring/api";
import { connectAnalyticsDb, ensureAnalyticsTables } from "../../../../lib/analytics/db";
import { calculateBusinessMetrics } from "../../../../lib/analytics/engine-v2";

async function handler(req: Request) {
  const { searchParams } = new URL(req.url);
  const start_date = searchParams.get("start_date") || undefined;
  const end_date = searchParams.get("end_date") || undefined;

  const db = connectAnalyticsDb();
  try {
    if (!db) return NextResponse.json({ ok: false, error: "Missing DATABASE_URL" }, { status: 500 });
    await ensureAnalyticsTables(db);
    const out = await calculateBusinessMetrics(db, { start_date, end_date });
    return NextResponse.json(out);
  } finally {
    if (db) await db.end({ timeout: 5 });
  }
}

export const GET = withApiMonitoring({ route: "/api/analytics/metrics", method: "GET", handler });

