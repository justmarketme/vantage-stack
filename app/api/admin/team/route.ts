import { NextResponse } from "next/server";
import { z } from "zod";
import { connectCrmDb } from "../../../../lib/crm/db";
import { requireAnyPermission, actorUsernameFromSession, memberIdFromSession } from "../../../../lib/admin/api-auth";
import { generateOpaqueToken, hashOpaqueToken } from "../../../../lib/auth/token-hash";
import { insertCrmInvitation, listPendingCrmInvitations } from "../../../../lib/team/security";
import { hashPassword } from "../../../../lib/admin/password";
import { insertTeamMember, listTeamMembers, logTeamAction } from "../../../../lib/team/members";
import type { TeamRole } from "../../../../lib/admin/roles";
import { isTeamRole } from "../../../../lib/admin/roles";
import { sendTransactionalEmail } from "../../../../lib/auth/mail";
import { isValidUsername } from "../../../../lib/auth/password-policy";

const CreateBody = z.object({
  username: z.string().min(1),
  email: z.string().email(),
  role: z.string(),
  full_name: z.string().max(200).optional().nullable(),
  password: z.string().min(12).optional(),
  send_invite_only: z.boolean().optional(),
  invite_days: z.number().min(1).max(30).optional(),
});

export async function GET() {
  const gate = await requireAnyPermission("manage_users", "invite_team");
  if (!gate.ok) return gate.response;

  const db = connectCrmDb();
  if (!db) return NextResponse.json({ ok: false, error: "No database" }, { status: 503 });
  try {
    const members = await listTeamMembers(db);
    const pending = await listPendingCrmInvitations(db);
    const safe = members.map(({ password_hash: _p, invite_token: it, ...rest }) => ({
      ...rest,
      has_password: Boolean(_p),
      has_pending_invite: Boolean(it),
    }));
    return NextResponse.json({ ok: true, members: safe, pending_invitations: pending });
  } finally {
    await db.end({ timeout: 5 });
  }
}

export async function POST(req: Request) {
  const gate = await requireAnyPermission("manage_users", "invite_team");
  if (!gate.ok) return gate.response;

  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  if (!isTeamRole(parsed.data.role)) {
    return NextResponse.json({ ok: false, error: "Invalid role" }, { status: 400 });
  }
  const role = parsed.data.role as TeamRole;
  if (role === "super_admin" && gate.role !== "super_admin") {
    return NextResponse.json({ ok: false, error: "Only a super admin can assign that role" }, { status: 403 });
  }
  if (!isValidUsername(parsed.data.username)) {
    return NextResponse.json(
      { ok: false, error: "Username must be 3–20 characters, alphanumeric and underscore only" },
      { status: 400 },
    );
  }

  const db = connectCrmDb();
  if (!db) return NextResponse.json({ ok: false, error: "No database" }, { status: 503 });
  try {
    const actorId = memberIdFromSession(gate.session);
    const actorName = actorUsernameFromSession(gate.session);
    const useInvite = parsed.data.send_invite_only || !parsed.data.password;

    if (useInvite) {
      const raw = generateOpaqueToken(32);
      const th = hashOpaqueToken(raw);
      const days = parsed.data.invite_days ?? 7;
      const inviteExpires = new Date(Date.now() + days * 86400_000).toISOString();
      const invId = await insertCrmInvitation(db, {
        tokenHash: th,
        email: parsed.data.email,
        username: parsed.data.username,
        fullName: parsed.data.full_name ?? null,
        role,
        createdBy: actorId,
        expiresAtIso: inviteExpires,
      });
      if (!invId) return NextResponse.json({ ok: false, error: "Could not create invitation" }, { status: 409 });

      const origin = new URL(req.url).origin;
      const invite_link = `${origin}/admin/invite?t=${encodeURIComponent(raw)}`;
      await sendTransactionalEmail({
        to: parsed.data.email,
        subject: "You're invited to join VantageStack CRM",
        html: `<p>You've been invited to join the VantageStack team.</p><p><a href="${invite_link}">Set up your account</a></p><p>This link expires in ${days} days.</p>`,
        text: `Join VantageStack: ${invite_link} (expires in ${days} days)`,
      });

      await logTeamAction(db, {
        member_id: actorId,
        actor_username: actorName,
        action_type: "invitation_sent",
        details: { email: parsed.data.email, role, invitation_id: invId },
      });

      return NextResponse.json({
        ok: true,
        invitation_id: invId,
        invite_link,
        message: `Invitation sent to ${parsed.data.email}. They have ${days} days to accept.`,
      });
    }

    if (!parsed.data.password) {
      return NextResponse.json({ ok: false, error: "Password required when not sending invite" }, { status: 400 });
    }

    const hash = await hashPassword(parsed.data.password);
    const id = await insertTeamMember(db, {
      username: parsed.data.username,
      email: parsed.data.email,
      role,
      password_hash: hash,
      created_by: actorId,
      status: "active",
      full_name: parsed.data.full_name ?? null,
    });
    if (!id) return NextResponse.json({ ok: false, error: "Could not create user (duplicate email?)" }, { status: 409 });

    await logTeamAction(db, {
      member_id: id,
      actor_username: actorName,
      action_type: "user_created",
      details: { email: parsed.data.email, role, invite: false },
    });

    return NextResponse.json({ ok: true, member_id: id });
  } finally {
    await db.end({ timeout: 5 });
  }
}
