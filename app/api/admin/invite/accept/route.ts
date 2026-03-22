import { NextResponse } from "next/server";
import { z } from "zod";
import { connectCrmDb } from "../../../../../lib/crm/db";
import {
  acceptInviteSetPassword,
  getMemberByEmail,
  getMemberByInviteToken,
  getMemberByUsername,
  insertTeamMember,
  logTeamAction,
} from "../../../../../lib/team/members";
import {
  getCrmInvitationByTokenHash,
  markCrmInvitationUsed,
  insertEmailVerifyToken,
} from "../../../../../lib/team/security";
import { hashPassword } from "../../../../../lib/admin/password";
import { checkPasswordPolicy, isValidUsername, passwordPolicyError } from "../../../../../lib/auth/password-policy";
import { hashOpaqueToken, generateOpaqueToken } from "../../../../../lib/auth/token-hash";
import { sendTransactionalEmail, publicAppOrigin } from "../../../../../lib/auth/mail";
import { supabaseAdminCreateUser } from "../../../../../lib/auth/supabase-user";
import { isTeamRole } from "../../../../../lib/admin/roles";
import type { TeamRole } from "../../../../../lib/admin/roles";

const Body = z.object({
  token: z.string().min(10),
  password: z.string().min(12),
  username: z.string().min(3).max(20).optional(),
  full_name: z.string().max(200).optional().nullable(),
  terms_accepted: z.literal(true),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, issues: parsed.error.issues }, { status: 400 });
  }
  if (!parsed.data.terms_accepted) {
    return NextResponse.json({ ok: false, error: "You must accept the terms" }, { status: 400 });
  }
  const policy = checkPasswordPolicy(parsed.data.password);
  if (!policy.ok) {
    return NextResponse.json({ ok: false, error: passwordPolicyError() }, { status: 400 });
  }

  const db = connectCrmDb();
  if (!db) return NextResponse.json({ ok: false, error: "No database" }, { status: 503 });

  try {
    const raw = parsed.data.token;
    const th = hashOpaqueToken(raw);
    const inv = await getCrmInvitationByTokenHash(db, th);

    if (inv) {
      if (new Date(inv.expires_at) < new Date()) {
        return NextResponse.json({ ok: false, error: "Invitation has expired. Ask your admin for a new one." }, { status: 400 });
      }
      if (!isTeamRole(inv.role)) {
        return NextResponse.json({ ok: false, error: "Invalid invitation" }, { status: 400 });
      }
      const role = inv.role as TeamRole;
      const username = (parsed.data.username ?? inv.username).trim();
      if (!isValidUsername(username)) {
        return NextResponse.json(
          { ok: false, error: "Username must be 3–20 characters, alphanumeric and underscore only" },
          { status: 400 },
        );
      }
      if (await getMemberByEmail(db, inv.email)) {
        return NextResponse.json({ ok: false, error: "An account with this email already exists" }, { status: 409 });
      }
      if (await getMemberByUsername(db, username)) {
        return NextResponse.json({ ok: false, error: "Username is already taken" }, { status: 409 });
      }

      const hash = await hashPassword(parsed.data.password);
      const supa = await supabaseAdminCreateUser({
        email: inv.email,
        password: parsed.data.password,
        username,
        role,
      });

      const memberId = await insertTeamMember(db, {
        username,
        email: inv.email,
        role,
        password_hash: hash,
        created_by: inv.created_by,
        status: "active",
        full_name: parsed.data.full_name ?? inv.full_name,
        supabase_user_id: supa?.id ?? null,
      });
      if (!memberId) {
        return NextResponse.json({ ok: false, error: "Could not create account" }, { status: 500 });
      }
      await markCrmInvitationUsed(db, inv.id);

      const vRaw = generateOpaqueToken(32);
      const vh = hashOpaqueToken(vRaw);
      const exp = new Date(Date.now() + 48 * 60 * 60_000).toISOString();
      await insertEmailVerifyToken(db, memberId, vh, exp);
      const origin = publicAppOrigin();
      const vLink = `${origin}/admin/verify-email?t=${encodeURIComponent(vRaw)}`;
      await sendTransactionalEmail({
        to: inv.email,
        subject: "Verify your VantageStack account",
        html: `<p>Confirm your email to finish setup.</p><p><a href="${vLink}">Verify email</a></p>`,
        text: `Verify your email: ${vLink}`,
      });

      await logTeamAction(db, {
        member_id: memberId,
        actor_username: username,
        action_type: "invite_accepted",
        details: { invitation_id: inv.id },
      });

      return NextResponse.json({ ok: true, verify_email_sent: true });
    }

    const row = await getMemberByInviteToken(db, raw);
    if (!row) {
      return NextResponse.json({ ok: false, error: "Invitation has expired. Ask your admin for a new one." }, { status: 400 });
    }
    if (row.invite_expires_at && new Date(row.invite_expires_at) < new Date()) {
      return NextResponse.json({ ok: false, error: "Invitation has expired. Ask your admin for a new one." }, { status: 400 });
    }
    const hash = await hashPassword(parsed.data.password);
    await acceptInviteSetPassword(db, row.id, hash);
    return NextResponse.json({ ok: true, verify_email_sent: false });
  } finally {
    await db.end({ timeout: 5 });
  }
}
