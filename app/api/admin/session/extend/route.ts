import { NextResponse } from "next/server";
import { ADMIN_COOKIE, signMemberJwtCookie } from "../../../../../lib/admin/session";
import { getSessionFromCookies } from "../../../../../lib/admin/api-auth";
import { connectCrmDb } from "../../../../../lib/crm/db";
import { getMemberById } from "../../../../../lib/team/members";

/** Refresh JWT expiration (24h sliding) while session is still valid. */
export async function POST() {
  const session = await getSessionFromCookies();
  if (!session || session.kind !== "member" || session.auth !== "jwt") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const db = connectCrmDb();
  if (!db) return NextResponse.json({ ok: false, error: "No database" }, { status: 503 });
  try {
    const m = await getMemberById(db, session.memberId);
    if (!m || m.status !== "active") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const token = await signMemberJwtCookie({
      memberId: m.id,
      role: m.role,
      username: m.username,
      sessionVersion: m.session_version ?? 0,
      rememberMe: false,
    });
    if (!token) {
      return NextResponse.json({ ok: false, error: "Could not extend session" }, { status: 503 });
    }
    const res = NextResponse.json({ ok: true, exp_ms: Date.now() + 24 * 60 * 60_000 });
    const secure = process.env.NODE_ENV === "production";
    res.cookies.set(ADMIN_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 24 * 60 * 60,
    });
    return res;
  } finally {
    await db.end({ timeout: 5 });
  }
}
