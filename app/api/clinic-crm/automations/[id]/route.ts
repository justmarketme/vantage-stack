import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/clinic-crm/auth/session";
import { audit, clinicDb } from "@/lib/clinic-crm/db";
import { AutomationPatch } from "@/lib/clinic-crm/types";
import { idParam, notFound, parseBody, route } from "@/lib/clinic-crm/server/http";
import { updateAutomation } from "@/lib/clinic-crm/server/repo/automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>("automations.update", async (req: NextRequest, ctx) => {
  const s = await requireSession(req, ["owner", "manager"]);
  if (s instanceof NextResponse) return s;
  const id = await idParam(ctx);
  if (!id) return notFound();
  const body = await parseBody(req, AutomationPatch);
  if (!body.ok) return body.res;
  const sql = await clinicDb();
  const automation = await updateAutomation(sql, s.clinicId, id, body.data);
  if (!automation) return notFound();
  await audit(sql, s.clinicId, s.staffId, "update", "automation", id);
  return NextResponse.json(automation);
});
