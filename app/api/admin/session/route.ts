import { NextResponse } from "next/server";
import { getSessionFromCookies } from "../../../../lib/admin/api-auth";
import { connectCrmDb } from "../../../../lib/crm/db";
import { getMemberById } from "../../../../lib/team/members";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });
  }

  const role = session.kind === "legacy" ? "super_admin" : session.role;
  const expiresAt = new Date(session.exp).toISOString();
  const warnAtMs = session.exp - 10 * 60_000;

  if (session.kind === "legacy") {
    return NextResponse.json({
      ok: true,
      authenticated: true,
      kind: "legacy",
      role,
      label: "Legacy admin (env password)",
      username: "admin",
      email: null as string | null,
      member_id: null as string | null,
      session_expires_at: expiresAt,
      session_warn_at_ms: warnAtMs,
    });
  }

  const db = connectCrmDb();
  if (!db) {
    return NextResponse.json({
      ok: true,
      authenticated: true,
      kind: "member",
      role,
      username: session.username ?? "user",
      email: null,
      member_id: session.memberId,
      status: null,
      session_expires_at: expiresAt,
      session_warn_at_ms: warnAtMs,
    });
  }
  try {
    const m = await getMemberById(db, session.memberId);
    return NextResponse.json({
      ok: true,
      authenticated: true,
      kind: "member",
      role,
      username: m?.username ?? session.username ?? "user",
      email: m?.email ?? null,
      member_id: session.memberId,
      status: m?.status ?? null,
      full_name: m?.full_name ?? null,
      email_verified: Boolean(m?.email_verified_at),
      session_expires_at: expiresAt,
      session_warn_at_ms: warnAtMs,
    });
  } finally {
    await db.end({ timeout: 5 });
  }
}
