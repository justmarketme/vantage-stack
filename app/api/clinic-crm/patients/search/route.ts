import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/clinic-crm/auth/session";
import { audit, clinicDb } from "@/lib/clinic-crm/db";
import { noStore, parseBody, route } from "@/lib/clinic-crm/server/http";
import { searchPatients } from "@/lib/clinic-crm/server/repo/patients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SearchInput = z.object({ q: z.string().trim().min(1).max(80) });

/**
 * Search by name, email or phone. A POST so phone numbers and emails stay out of
 * URLs, access logs and browser history. The audit records the search, never `q`.
 */
export const POST = route("patients.search", async (req: NextRequest) => {
  const s = await requireSession(req);
  if (s instanceof NextResponse) return s;
  const body = await parseBody(req, SearchInput);
  if (!body.ok) return body.res;
  const sql = await clinicDb();
  const patients = await searchPatients(sql, s.clinicId, body.data.q);
  await audit(sql, s.clinicId, s.staffId, "search", "patients");
  return NextResponse.json(patients, noStore);
});
