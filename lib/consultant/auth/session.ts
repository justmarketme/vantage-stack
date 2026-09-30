import { NextResponse } from "next/server";
import { actorUsernameFromSession, getSessionFromCookies, memberIdFromSession } from "../../admin/api-auth";
import { can, type TeamRole } from "../../admin/roles";
import { sessionRole } from "../../admin/session";
import { connectCrmDb } from "../../crm/db";
import type { ApiError } from "../types";

/**
 * Who is using the Consultant Portal, resolved server-side from the admin session cookie.
 *
 * - `canCall`   — a *member* session whose role has `use_consultant_portal`. The legacy
 *                 single-password admin has no member id, so it can never own a call or a
 *                 Twilio identity: it is a read-only manager.
 * - `isManager` — the role has `view_clients` (sees every Clinics lead, may reassign).
 *
 * `consultant_id` for anything written must come from `memberId` here — never a request body.
 */
export type ConsultantSession = {
  memberId: string | null;
  username: string;
  displayName: string;
  role: TeamRole;
  isManager: boolean;
  canCall: boolean;
};

function deny(status: 401 | 403, error: string): NextResponse<ApiError> {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Pure: the permission flags for a role / member combination (unit-tested). */
export function consultantFlags(role: TeamRole, memberId: string | null): Pick<ConsultantSession, "isManager" | "canCall"> {
  return {
    isManager: can(role, "view_clients"),
    canCall: memberId !== null && can(role, "use_consultant_portal"),
  };
}

/**
 * full_name when the member has one; otherwise the username. Never throws.
 * Uses the shared singleton pool and deliberately never calls `db.end()` on it — ending
 * the singleton would tear down queries other code in this request is running.
 */
async function displayNameFor(memberId: string | null, username: string): Promise<string> {
  if (!memberId) return username;
  try {
    const db = await connectCrmDb();
    if (!db) return username;
    const rows = await db<{ full_name: string | null; username: string }[]>`
      select full_name, username from public.team_members where id = ${memberId}::uuid limit 1`;
    return rows[0]?.full_name?.trim() || rows[0]?.username || username;
  } catch {
    return username;
  }
}

/**
 * Route guard for `/api/consultant/**` and the portal's server components.
 * Returns the session, or a 401/403 `NextResponse` (`ApiError` body) to return as-is:
 *
 *   const s = await requireConsultant({ call: true });
 *   if (s instanceof NextResponse) return s;
 *
 * The portal requires `use_consultant_portal` (the same rule middleware enforces — this is
 * the defence-in-depth copy). `opts.call` additionally requires `canCall`; `opts.manager`
 * requires `isManager`.
 */
export async function requireConsultant(opts?: { manager?: boolean; call?: boolean }): Promise<ConsultantSession | NextResponse> {
  const session = await getSessionFromCookies();
  const role = sessionRole(session);
  if (!session || !role) return deny(401, "Unauthorized");

  if (!can(role, "use_consultant_portal")) return deny(403, "Forbidden");

  const memberId = memberIdFromSession(session);
  const flags = consultantFlags(role, memberId);
  if (opts?.call && !flags.canCall) return deny(403, "Calling requires a consultant account");
  if (opts?.manager && !flags.isManager) return deny(403, "Managers only");

  const username = actorUsernameFromSession(session);
  return {
    memberId,
    username,
    displayName: await displayNameFor(memberId, username),
    role,
    ...flags,
  };
}
