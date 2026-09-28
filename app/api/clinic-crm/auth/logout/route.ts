import { NextResponse, type NextRequest } from "next/server";
import { audit, clinicDb } from "../../../../../lib/clinic-crm/db";
import { clearSessionCookie } from "../../../../../lib/clinic-crm/auth/session";
import { SESSION_COOKIE, verifySessionToken } from "../../../../../lib/clinic-crm/auth/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Always clears the cookie (even when it is already invalid) and returns 204. */
export async function POST(req: NextRequest) {
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    try {
      await audit(await clinicDb(), session.clinicId, session.staffId, "logout", "staff", session.staffId);
    } catch {
      /* logout must never fail on an audit/DB problem */
    }
  }
  const res = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  res.cookies.set(clearSessionCookie());
  return res;
}
