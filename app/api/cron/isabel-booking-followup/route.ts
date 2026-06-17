import { NextResponse } from "next/server";
import { withApiMonitoring } from "../../../../lib/monitoring/api";
import { connectCrmDb } from "../../../../lib/crm/db";
import { processDueNudges } from "../../../../lib/isabel/nudge";

/**
 * Daily backstop sweep for the one-time "didn't finish booking" WhatsApp nudge.
 * Timely (~2h) processing also happens opportunistically after each inbound
 * webhook (see app/api/whatsapp/isabel/route.ts). Logic + compliance live in
 * lib/isabel/nudge.ts.
 */

function isCronAuthorized(req: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return true;
  const auth = req.headers.get("authorization")?.trim() || "";
  if (auth === `Bearer ${secret}` || auth === secret) return true;
  const provided = (new URL(req.url).searchParams.get("secret") || "").trim();
  return Boolean(provided && provided === secret);
}

async function handler(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const db = await connectCrmDb();
  if (!db) return NextResponse.json({ ok: false, error: "no_database" }, { status: 500 });
  const result = await processDueNudges(db);
  return NextResponse.json({ ok: true, ...result });
}

export const POST = withApiMonitoring({ route: "/api/cron/isabel-booking-followup", method: "POST", handler });
export const GET = withApiMonitoring({ route: "/api/cron/isabel-booking-followup", method: "GET", handler });
