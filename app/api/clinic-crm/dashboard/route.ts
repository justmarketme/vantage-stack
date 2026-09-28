import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/clinic-crm/auth/session";
import { clinicDb } from "@/lib/clinic-crm/db";
import { noStore, route } from "@/lib/clinic-crm/server/http";
import { getDashboard } from "@/lib/clinic-crm/server/repo/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("dashboard.get", async (req: NextRequest) => {
  const s = await requireSession(req);
  if (s instanceof NextResponse) return s;
  const sql = await clinicDb();
  return NextResponse.json(await getDashboard(sql, s.clinicId), noStore);
});
