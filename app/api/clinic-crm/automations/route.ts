import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/clinic-crm/auth/session";
import { clinicDb } from "@/lib/clinic-crm/db";
import { noStore, route } from "@/lib/clinic-crm/server/http";
import { listAutomations } from "@/lib/clinic-crm/server/repo/automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lists the clinic's automations, seeding the four disabled defaults on first access. */
export const GET = route("automations.list", async (req: NextRequest) => {
  const s = await requireSession(req);
  if (s instanceof NextResponse) return s;
  const sql = await clinicDb();
  return NextResponse.json(await listAutomations(sql, s.clinicId), noStore);
});
