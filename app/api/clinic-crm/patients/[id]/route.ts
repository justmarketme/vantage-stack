import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/clinic-crm/auth/session";
import { audit, clinicDb } from "@/lib/clinic-crm/db";
import { PatientPatch } from "@/lib/clinic-crm/types";
import { apiError, idParam, noStore, notFound, parseBody, route } from "@/lib/clinic-crm/server/http";
import { deletePatient, DuplicatePhoneError, getPatient, updatePatient } from "@/lib/clinic-crm/server/repo/patients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<{ id: string }>("patients.get", async (req: NextRequest, ctx: Ctx) => {
  const s = await requireSession(req);
  if (s instanceof NextResponse) return s;
  const id = await idParam(ctx);
  if (!id) return notFound();
  const sql = await clinicDb();
  const patient = await getPatient(sql, s.clinicId, id);
  if (!patient) return notFound();
  await audit(sql, s.clinicId, s.staffId, "read", "patient", id);
  return NextResponse.json(patient, noStore);
});

export const PATCH = route<{ id: string }>("patients.update", async (req: NextRequest, ctx: Ctx) => {
  const s = await requireSession(req);
  if (s instanceof NextResponse) return s;
  const id = await idParam(ctx);
  if (!id) return notFound();
  const body = await parseBody(req, PatientPatch);
  if (!body.ok) return body.res;
  const sql = await clinicDb();
  try {
    const patient = await updatePatient(sql, s.clinicId, s.staffId, id, body.data);
    if (!patient) return notFound();
    await audit(sql, s.clinicId, s.staffId, "update", "patient", id);
    if (body.data.consent) await audit(sql, s.clinicId, s.staffId, "consent_recorded", "patient", id);
    return NextResponse.json(patient);
  } catch (e) {
    if (e instanceof DuplicatePhoneError) {
      return apiError(409, "A patient with this number already exists", { phone: "Already registered" });
    }
    throw e;
  }
});

/** POPIA erasure: hard delete (appointments, messages, scheduled sends cascade). Owner/manager only. */
export const DELETE = route<{ id: string }>("patients.delete", async (req: NextRequest, ctx: Ctx) => {
  const s = await requireSession(req, ["owner", "manager"]);
  if (s instanceof NextResponse) return s;
  const id = await idParam(ctx);
  if (!id) return notFound();
  const sql = await clinicDb();
  if (!(await deletePatient(sql, s.clinicId, id))) return notFound();
  await audit(sql, s.clinicId, s.staffId, "erase", "patient", id);
  return new NextResponse(null, { status: 204 });
});
