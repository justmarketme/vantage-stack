import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/clinic-crm/auth/session";
import { audit, clinicDb } from "@/lib/clinic-crm/db";
import { idParam, notFound, route } from "@/lib/clinic-crm/server/http";
import { exportPatient } from "@/lib/clinic-crm/server/repo/patients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POPIA s.23 access request: everything held on the patient, as a JSON download. */
export const GET = route<{ id: string }>("patients.export", async (req: NextRequest, ctx) => {
  const s = await requireSession(req, ["owner", "manager"]);
  if (s instanceof NextResponse) return s;
  const id = await idParam(ctx);
  if (!id) return notFound();
  const sql = await clinicDb();
  const data = await exportPatient(sql, s.clinicId, id);
  if (!data) return notFound();
  await audit(sql, s.clinicId, s.staffId, "export", "patient", id);
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="patient-${id}.json"`,
    },
  });
});
