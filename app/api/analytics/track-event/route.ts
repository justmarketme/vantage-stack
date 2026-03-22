import { NextResponse } from "next/server";
import { withApiMonitoring } from "../../../../lib/monitoring/api";
import { connectAnalyticsDb, ensureAnalyticsTables } from "../../../../lib/analytics/db";
import { trackClientEvent } from "../../../../lib/analytics/engine-v2";

async function handler(req: Request) {
  const body = await req.json().catch(() => ({}));
  const db = connectAnalyticsDb();
  try {
    if (!db) return NextResponse.json({ ok: false, error: "Missing DATABASE_URL" }, { status: 500 });
    await ensureAnalyticsTables(db);

    const client_id = String(body?.client_id ?? "").trim();
    const event_type_raw = String(body?.event_type ?? "").trim();
    const timestamp = typeof body?.timestamp === "string" ? body.timestamp : undefined;
    const metadata = body?.metadata && typeof body.metadata === "object" ? body.metadata : undefined;

    const normalized = event_type_raw
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/-+/g, "_");

    const out = await trackClientEvent(db, {
      client_id,
      event_type: normalized as any,
      timestamp,
      metadata,
    });
    return NextResponse.json(out);
  } finally {
    if (db) await db.end({ timeout: 5 });
  }
}

export const POST = withApiMonitoring({ route: "/api/analytics/track-event", method: "POST", handler });

