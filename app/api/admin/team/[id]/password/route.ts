import { NextResponse } from "next/server";
import { connectCrmDb } from "../../../../../../lib/crm/db";
import { requireAnyPermission, actorUsernameFromSession } from "../../../../../../lib/admin/api-auth";
import { getMemberById, logTeamAction } from "../../../../../../lib/team/members";
import { insertPasswordResetToken } from "../../../../../../lib/team/security";
import { generateOpaqueToken, hashOpaqueToken } from "../../../../../../lib/auth/token-hash";
import { sendTransactionalEmail, publicAppOrigin } from "../../../../../../lib/auth/mail";

/** Sends the member a password reset link (same flow as self-service forgot password). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyPermission("manage_users", "invite_team");
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;

  const db = connectCrmDb();
  if (!db) return NextResponse.json({ ok: false, error: "No database" }, { status: 503 });
  try {
    const m = await getMemberById(db, id);
    if (!m) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (!m.password_hash || m.status !== "active") {
      return NextResponse.json({ ok: false, error: "User cannot reset password in current state" }, { status: 400 });
    }
    const raw = generateOpaqueToken(32);
    const th = hashOpaqueToken(raw);
    const exp = new Date(Date.now() + 60 * 60_000).toISOString();
    await insertPasswordResetToken(db, m.id, th, exp);
    const origin = publicAppOrigin();
    const link = `${origin}/admin/reset-password?t=${encodeURIComponent(raw)}`;
    await sendTransactionalEmail({
      to: m.email,
      subject: "Reset Your VantageStack Password",
      html: `<p>An administrator requested a password reset for your account.</p><p><a href="${link}">Reset password</a></p><p>This link expires in 1 hour.</p>`,
      text: `Reset your password (1 hour): ${link}`,
    });
    await logTeamAction(db, {
      member_id: m.id,
      actor_username: actorUsernameFromSession(gate.session),
      action_type: "admin_password_reset_sent",
      details: { target_username: m.username },
    });
    return NextResponse.json({ ok: true });
  } finally {
    await db.end({ timeout: 5 });
  }
}
