import { NextResponse } from "next/server";
import { z } from "zod";
import { connectCrmDb } from "../../../../../lib/crm/db";
import { requireAnyPermission, requirePermission, actorUsernameFromSession } from "../../../../../lib/admin/api-auth";
import { bumpSessionVersion, deleteMemberHard, getMemberById, logTeamAction, updateMember } from "../../../../../lib/team/members";
import { isTeamRole } from "../../../../../lib/admin/roles";
import type { TeamRole } from "../../../../../lib/admin/roles";

const PatchBody = z.object({
  username: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.string().optional(),
  status: z.enum(["active", "inactive", "pending_invite"]).optional(),
  full_name: z.string().max(200).nullable().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, issues: parsed.error.issues }, { status: 400 });
  }

  const sensitive =
    parsed.data.username != null ||
    parsed.data.email != null ||
    parsed.data.role != null ||
    parsed.data.status != null;

  const gate = sensitive
    ? await requirePermission("manage_users")
    : await requireAnyPermission("manage_users", "invite_team");
  if (!gate.ok) return gate.response;

  if (!sensitive && parsed.data.full_name === undefined) {
    return NextResponse.json({ ok: false, error: "No changes" }, { status: 400 });
  }

  let role: TeamRole | undefined;
  if (parsed.data.role) {
    if (!isTeamRole(parsed.data.role)) return NextResponse.json({ ok: false, error: "Invalid role" }, { status: 400 });
    if (parsed.data.role === "super_admin" && gate.role !== "super_admin") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    role = parsed.data.role;
  }

  const db = await connectCrmDb();
  if (!db) return NextResponse.json({ ok: false, error: "No database" }, { status: 503 });
  try {
    const target = await getMemberById(db, id);
    if (!target) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (target.role === "super_admin" && gate.role !== "super_admin") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const ok = await updateMember(db, id, {
      username: parsed.data.username,
      email: parsed.data.email,
      role,
      status: parsed.data.status,
      full_name: parsed.data.full_name !== undefined ? parsed.data.full_name : undefined,
    });
    if (!ok) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    if (parsed.data.status === "inactive") {
      await bumpSessionVersion(db, id);
    }

    await logTeamAction(db, {
      member_id: id,
      actor_username: actorUsernameFromSession(gate.session),
      action_type: "user_updated",
      details: { id, patch: parsed.data },
    });
    return NextResponse.json({ ok: true });
  } finally {
    await db.end({ timeout: 5 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission("manage_users");
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;

  const db = await connectCrmDb();
  if (!db) return NextResponse.json({ ok: false, error: "No database" }, { status: 503 });
  try {
    const m = await getMemberById(db, id);
    if (!m) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (m.role === "super_admin") {
      const supers = await db`select count(*)::int as n from public.team_members where role = 'super_admin' and status = 'active'`;
      const n = Number((supers[0] as { n?: number })?.n ?? 0);
      if (n <= 1) {
        return NextResponse.json({ ok: false, error: "Cannot remove the last super admin" }, { status: 400 });
      }
    }
    await deleteMemberHard(db, id);
    await logTeamAction(db, {
      actor_username: actorUsernameFromSession(gate.session),
      action_type: "user_deleted",
      details: { id, email: m.email },
    });
    return NextResponse.json({ ok: true });
  } finally {
    await db.end({ timeout: 5 });
  }
}
