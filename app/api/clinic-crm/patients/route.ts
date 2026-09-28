import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/clinic-crm/auth/session";
import { audit, clinicDb } from "@/lib/clinic-crm/db";
import { PatientInput } from "@/lib/clinic-crm/types";
import { apiError, noStore, parseBody, route } from "@/lib/clinic-crm/server/http";
import { createPatient, DuplicatePhoneError, listPatients } from "@/lib/clinic-crm/server/repo/patients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("patients.list", async (req: NextRequest) => {
  const s = await requireSession(req);
  if (s instanceof NextResponse) return s;
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const leadsOnly = req.nextUrl.searchParams.get("lead") === "1";
  const sql = await clinicDb();
  const patients = await listPatients(sql, s.clinicId, { q, leadsOnly });
  await audit(sql, s.clinicId, s.staffId, "list", "patients");
  return NextResponse.json(patients, noStore);
});

export const POST = route("patients.create", async (req: NextRequest) => {
  const s = await requireSession(req);
  if (s instanceof NextResponse) return s;
  const body = await parseBody(req, PatientInput);
  if (!body.ok) return body.res;
  const sql = await clinicDb();
  try {
    const patient = await createPatient(sql, s.clinicId, s.staffId, body.data);
    await audit(sql, s.clinicId, s.staffId, "create", "patient", patient.id);
    await audit(sql, s.clinicId, s.staffId, "consent_recorded", "patient", patient.id);
    return NextResponse.json(patient, { status: 201 });
  } catch (e) {
    if (e instanceof DuplicatePhoneError) {
      return apiError(409, "A patient with this number already exists", { phone: "Already registered" });
    }
    throw e;
  }
});
