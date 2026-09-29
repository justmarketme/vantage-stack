import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { audit, clinicDb } from "../../../../../lib/clinic-crm/db";
import { LoginInput, type ApiError, type Session, type StaffRole } from "../../../../../lib/clinic-crm/types";
import { createSessionCookie } from "../../../../../lib/clinic-crm/auth/session";
import { sessionSecret } from "../../../../../lib/clinic-crm/auth/token";
import { clientIp, rateLimitDetailed } from "../../../../../lib/clinic-crm/auth/rateLimit";
import { LOGIN_POLICY, DUMMY_BCRYPT_HASH } from "../../../../../lib/clinic-crm/auth/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC = "Invalid email or password";
const THROTTLED = "Too many sign-in attempts. Please wait a few minutes and try again.";

function fail(status: number, error: string, retryAfter?: number): NextResponse {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (retryAfter) headers["Retry-After"] = String(retryAfter);
  return NextResponse.json<ApiError>({ error }, { status, headers });
}

interface StaffRow {
  id: string;
  clinic_id: string;
  name: string;
  role: StaffRole;
  password_hash: string;
  locked_until: Date | null;
  clinic_name: string;
}

export async function POST(req: NextRequest) {
  if (!sessionSecret()) return fail(503, "Sign-in is not configured");

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(400, "Enter your email and password");
  }
  const parsed = LoginInput.safeParse(raw);
  if (!parsed.success) return fail(400, "Enter your email and password");
  const { email, password } = parsed.data;

  // Two windows: per IP+account (stops guessing one password) and per IP (stops spraying
  // many accounts). Both are per-instance — the durable control is the account lockout.
  const ip = clientIp(req);
  const perAccount = rateLimitDetailed(`login:${ip}:${email}`, LOGIN_POLICY.maxAttempts, LOGIN_POLICY.windowMs);
  const perIp = rateLimitDetailed(`login-ip:${ip}`, LOGIN_POLICY.maxAttemptsPerIp, LOGIN_POLICY.windowMs);
  if (!perAccount.ok || !perIp.ok) {
    return fail(429, THROTTLED, Math.max(perAccount.retryAfter, perIp.retryAfter));
  }

  let db;
  let staff: StaffRow | undefined;
  try {
    db = await clinicDb();
    [staff] = await db<StaffRow[]>`
      SELECT s.id, s.clinic_id, s.name, s.role, s.password_hash, s.locked_until, c.name AS clinic_name
        FROM clinic_crm.staff s
        JOIN clinic_crm.clinics c ON c.id = s.clinic_id
       WHERE s.email = ${email}
       LIMIT 1`;
  } catch (e) {
    console.error("[clinic-crm] login lookup failed", (e as Error).message);
    return fail(503, "Service unavailable");
  }

  // Always run exactly one bcrypt compare so response time does not reveal whether
  // the email exists or the account is locked.
  const passwordOk = await bcrypt.compare(password, staff?.password_hash ?? DUMMY_BCRYPT_HASH);
  if (!staff) return fail(401, GENERIC);

  const locked = staff.locked_until !== null && new Date(staff.locked_until).getTime() > Date.now();
  if (locked) {
    // Same 429 an unknown email gets from the limiter after the same number of tries,
    // so the lock itself does not confirm that the account exists.
    await audit(db, staff.clinic_id, staff.id, "login_blocked_locked", "staff", staff.id);
    return fail(429, THROTTLED);
  }

  if (!passwordOk) {
    try {
      await db`
        UPDATE clinic_crm.staff
           SET failed_logins = failed_logins + 1,
               locked_until  = CASE WHEN failed_logins + 1 >= ${LOGIN_POLICY.lockAfterFailures}
                                    THEN now() + make_interval(mins => ${LOGIN_POLICY.lockMinutes})
                                    ELSE locked_until END
         WHERE id = ${staff.id}`;
    } catch (e) {
      console.error("[clinic-crm] failed-login counter update failed", (e as Error).message);
    }
    await audit(db, staff.clinic_id, staff.id, "login_failed", "staff", staff.id);
    return fail(401, GENERIC);
  }

  try {
    await db`UPDATE clinic_crm.staff SET failed_logins = 0, locked_until = NULL WHERE id = ${staff.id}`;
  } catch (e) {
    console.error("[clinic-crm] failed-login counter reset failed", (e as Error).message);
  }
  await audit(db, staff.clinic_id, staff.id, "login", "staff", staff.id);

  const session: Session = {
    staffId: staff.id,
    clinicId: staff.clinic_id,
    role: staff.role,
    name: staff.name,
    clinicName: staff.clinic_name,
  };
  const res = NextResponse.json<Session>(session, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(await createSessionCookie(session));
  return res;
}
