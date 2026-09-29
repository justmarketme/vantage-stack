import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/clinic-crm/auth/session";
import { audit, clinicDb } from "@/lib/clinic-crm/db";
import { AppointmentInput } from "@/lib/clinic-crm/types";
import { CRM_CONFIG } from "@/lib/clinic-crm/server/config";
import { apiError, noStore, parseBody, route } from "@/lib/clinic-crm/server/http";
import { scheduleReminder } from "@/lib/clinic-crm/server/outbox";
import { createAppointment, listAppointments } from "@/lib/clinic-crm/server/repo/appointments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY = 86_400_000;

function parseDate(v: string | null): Date | null | undefined {
  if (v === null || v === "") return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const GET = route("appointments.list", async (req: NextRequest) => {
  const s = await requireSession(req);
  if (s instanceof NextResponse) return s;
  const { api } = CRM_CONFIG;
  const fromQ = parseDate(req.nextUrl.searchParams.get("from"));
  const toQ = parseDate(req.nextUrl.searchParams.get("to"));
  const fields: Record<string, string> = {};
  if (fromQ === null) fields.from = "Invalid date";
  if (toQ === null) fields.to = "Invalid date";
  const from = fromQ ?? new Date(Date.now() - api.appointmentsDefaultDaysBack * DAY);
  const to = toQ ?? new Date(from.getTime() + (api.appointmentsDefaultDaysBack + api.appointmentsDefaultDaysAhead) * DAY);
  if (!fields.from && !fields.to) {
    if (to <= from) fields.to = "Must be after the start date";
    else if (to.getTime() - from.getTime() > api.appointmentsMaxRangeDays * DAY) {
      fields.to = `Range can be at most ${api.appointmentsMaxRangeDays} days`;
    }
  }
  if (Object.keys(fields).length) return apiError(400, "Please check the date range", fields);
  const sql = await clinicDb();
  const rows = await listAppointments(sql, s.clinicId, from, to);
  await audit(sql, s.clinicId, s.staffId, "list", "appointments");
  return NextResponse.json(rows, noStore);
});

export const POST = route("appointments.create", async (req: NextRequest) => {
  const s = await requireSession(req);
  if (s instanceof NextResponse) return s;
  const body = await parseBody(req, AppointmentInput);
  if (!body.ok) return body.res;
  const sql = await clinicDb();
  const appt = await createAppointment(sql, s.clinicId, body.data);
  if (!appt) return apiError(404, "Patient not found", { patientId: "Patient not found" });
  await scheduleReminder(sql, s.clinicId, appt);
  await audit(sql, s.clinicId, s.staffId, "create", "appointment", appt.id);
  return NextResponse.json(appt, { status: 201 });
});
