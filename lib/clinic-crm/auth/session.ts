/**
 * Clinic CRM session — Node runtime (API routes). Middleware uses ./token.ts instead,
 * because this file reaches the database.
 *
 * Contract (docs/clinic-crm/SPEC.md):
 *   const s = await requireSession(req, ["owner", "manager"]);
 *   if (s instanceof NextResponse) return s;
 *   // s.clinicId is the ONLY clinic id a handler may use.
 */
import { NextResponse, type NextRequest } from "next/server";
import { clinicDb } from "../db";
import type { ApiError, Session, StaffRole } from "../types";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, sessionSecret, signSessionToken, verifySessionToken } from "./token";

export { SESSION_COOKIE, SESSION_TTL_SECONDS };

/** Shape accepted by `NextResponse.cookies.set(cookie)`. */
export interface SessionCookie {
  name: string;
  value: string;
  maxAge: number;
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
}

function jsonError(status: number, error: string): NextResponse {
  return NextResponse.json<ApiError>({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

function cookieBase(): Pick<SessionCookie, "httpOnly" | "secure" | "sameSite" | "path"> {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  };
}

/**
 * Verifies the cookie, then re-reads the staff row so that deletion or a role
 * change takes effect on the next request (the JWT's role is not trusted for
 * authorisation — the database's is). Returns the fresh Session, or a 401/403/503.
 */
export async function requireSession(req: NextRequest, roles?: StaffRole[]): Promise<Session | NextResponse> {
  const secret = sessionSecret();
  if (!secret) return jsonError(503, "Sign-in is not configured");

  const claimed = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, secret);
  if (!claimed) return jsonError(401, "Unauthorized");

  let row: { role: StaffRole; name: string; clinic_name: string } | undefined;
  try {
    const db = await clinicDb();
    [row] = await db<{ role: StaffRole; name: string; clinic_name: string }[]>`
      SELECT s.role, s.name, c.name AS clinic_name
        FROM clinic_crm.staff s
        JOIN clinic_crm.clinics c ON c.id = s.clinic_id
       WHERE s.id = ${claimed.staffId} AND s.clinic_id = ${claimed.clinicId}
       LIMIT 1`;
  } catch (e) {
    console.error("[clinic-crm] session lookup failed", (e as Error).message);
    return jsonError(503, "Service unavailable");
  }
  if (!row) return jsonError(401, "Unauthorized");

  const session: Session = {
    staffId: claimed.staffId,
    clinicId: claimed.clinicId,
    role: row.role,
    name: row.name,
    clinicName: row.clinic_name,
  };
  if (roles && roles.length > 0 && !roles.includes(session.role)) return jsonError(403, "Forbidden");
  return session;
}

/** Cookie for `res.cookies.set(await createSessionCookie(session))`. Throws if the secret is unset. */
export async function createSessionCookie(session: Session): Promise<SessionCookie> {
  const secret = sessionSecret();
  if (!secret) throw new Error("CLINIC_CRM_SESSION_SECRET is missing or shorter than 32 characters");
  return {
    name: SESSION_COOKIE,
    value: await signSessionToken(session, secret),
    maxAge: SESSION_TTL_SECONDS,
    ...cookieBase(),
  };
}

/** Expires the cookie: `res.cookies.set(clearSessionCookie())`. */
export function clearSessionCookie(): SessionCookie {
  return { name: SESSION_COOKIE, value: "", maxAge: 0, ...cookieBase() };
}
