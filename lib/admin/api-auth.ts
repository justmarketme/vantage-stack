import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  parseFullAdminSession,
  sessionRole,
  type ParsedSession,
} from "./session";
import type { Permission, TeamRole } from "./roles";
import { can } from "./roles";
import { connectCrmDb } from "../crm/db";
import { getMemberById } from "../team/members";

export async function getSessionFromCookies(): Promise<ParsedSession | null> {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  const parsed = await parseFullAdminSession(token);
  if (!parsed) return null;
  if (parsed.kind === "legacy") return parsed;
  const db = await connectCrmDb();
  if (!db) return parsed;
  try {
    const m = await getMemberById(db, parsed.memberId);
    if (!m || m.status !== "active") return null;
    if (parsed.auth === "jwt") {
      const dbSv = Number((m as { session_version?: number }).session_version ?? 0);
      const tokSv = Number(parsed.sessionVersion ?? 0);
      if (dbSv !== tokSv) return null;
    }
    return parsed;
  } finally {
    await db.end({ timeout: 5 });
  }
}

export function roleFromSession(session: ParsedSession | null): TeamRole | null {
  return sessionRole(session);
}

export async function requirePermission(
  permission: Permission,
): Promise<{ ok: true; session: ParsedSession; role: TeamRole } | { ok: false; response: NextResponse }> {
  const session = await getSessionFromCookies();
  const role = roleFromSession(session);
  if (!session || !role) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  }
  if (!can(role, permission)) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, session, role };
}

export async function requireAnyPermission(
  ...permissions: Permission[]
): Promise<{ ok: true; session: ParsedSession; role: TeamRole } | { ok: false; response: NextResponse }> {
  const session = await getSessionFromCookies();
  const role = roleFromSession(session);
  if (!session || !role) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  }
  if (!permissions.some((p) => can(role, p))) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, session, role };
}

export function memberIdFromSession(session: ParsedSession): string | null {
  if (session.kind === "member") return session.memberId;
  return null;
}

export function actorUsernameFromSession(session: ParsedSession, fallback = "unknown"): string {
  if (session.kind === "legacy") return "legacy_admin";
  return session.username || fallback;
}
