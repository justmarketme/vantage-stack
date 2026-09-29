import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/clinic-crm/auth/session";
import { clinicDb } from "@/lib/clinic-crm/db";
import { GoalInput } from "@/lib/clinic-crm/types";
import { noStore, parseBody, route } from "@/lib/clinic-crm/server/http";
import { createGoal, listGoals } from "@/lib/clinic-crm/server/repo/goals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("goals.list", async (req: NextRequest) => {
  const s = await requireSession(req);
  if (s instanceof NextResponse) return s;
  const sql = await clinicDb();
  return NextResponse.json(await listGoals(sql, s.clinicId), noStore);
});

export const POST = route("goals.create", async (req: NextRequest) => {
  const s = await requireSession(req);
  if (s instanceof NextResponse) return s;
  const body = await parseBody(req, GoalInput);
  if (!body.ok) return body.res;
  const sql = await clinicDb();
  return NextResponse.json(await createGoal(sql, s.clinicId, body.data), { status: 201 });
});
