import { listConnections } from "@/lib/consultant/server/calendar/connections";
import { json } from "@/lib/consultant/server/http";
import { consultantRoute } from "@/lib/consultant/server/route";
import type { CalendarConnection } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The caller's Google + Microsoft calendar connections (one entry per provider). */
export async function GET() {
  return consultantRoute("calendar.list", undefined, async (s, db) => json<CalendarConnection[]>(await listConnections(db, s.memberId)));
}
