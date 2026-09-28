import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/clinic-crm/auth/session";
import { clinicDb } from "@/lib/clinic-crm/db";
import { GoalPatch } from "@/lib/clinic-crm/types";
import { idParam, notFound, parseBody, route } from "@/lib/clinic-crm/server/http";
import { deleteGoal, updateGoal } from "@/lib/clinic-crm/server/repo/goals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>("goals.update", async (req: NextRequest, ctx) => {
  const s = await requireSession(req);
  if (s instanceof NextResponse) return s;
  const id = await idParam(ctx);
  if (!id) return notFound();
  const body = await parseBody(req, GoalPatch);
  if (!body.ok) return body.res;
  const sql = await clinicDb();
  const goal = await updateGoal(sql, s.clinicId, id, body.data);
  return goal ? NextResponse.json(goal) : notFound();
});

export const DELETE = route<{ id: string }>("goals.delete", async (req: NextRequest, ctx) => {
  const s = await requireSession(req);
  if (s instanceof NextResponse) return s;
  const id = await idParam(ctx);
  if (!id) return notFound();
  const sql = await clinicDb();
  return (await deleteGoal(sql, s.clinicId, id)) ? new NextResponse(null, { status: 204 }) : notFound();
});
