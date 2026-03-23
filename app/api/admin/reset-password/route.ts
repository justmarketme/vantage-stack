import { NextResponse } from "next/server";
import { z } from "zod";
import { connectCrmDb } from "../../../../lib/crm/db";
import { consumePasswordResetToken } from "../../../../lib/team/security";
import { bumpSessionVersion, getMemberById, logTeamAction, updateMember } from "../../../../lib/team/members";
import { hashPassword } from "../../../../lib/admin/password";
import { checkPasswordPolicy, passwordPolicyError } from "../../../../lib/auth/password-policy";
import { hashOpaqueToken } from "../../../../lib/auth/token-hash";
import { sendTransactionalEmail } from "../../../../lib/auth/mail";

const Body = z.object({
  token: z.string().min(20),
  password: z.string().min(12),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const policy = checkPasswordPolicy(parsed.data.password);
  if (!policy.ok) {
    return NextResponse.json({ ok: false, error: passwordPolicyError() }, { status: 400 });
  }

  const db = await connectCrmDb();
  if (!db) return NextResponse.json({ ok: false, error: "No database" }, { status: 503 });
  try {
    const th = hashOpaqueToken(parsed.data.token);
    const row = await consumePasswordResetToken(db, th);
    if (!row) {
      return NextResponse.json({ ok: false, error: "Password reset link has expired. Request a new one." }, { status: 400 });
    }
    const m = await getMemberById(db, row.member_id);
    if (!m) return NextResponse.json({ ok: false, error: "User not found" }, { status: 400 });

    const hash = await hashPassword(parsed.data.password);
    await updateMember(db, row.member_id, { password_hash: hash });
    await bumpSessionVersion(db, row.member_id);

    await sendTransactionalEmail({
      to: m.email,
      subject: "Your VantageStack password was reset",
      html: `<p>Your password has been successfully reset.</p>`,
      text: "Your password has been successfully reset.",
    });

    await logTeamAction(db, {
      member_id: row.member_id,
      actor_username: m.username,
      action_type: "password_reset_completed",
      details: {},
    });

    return NextResponse.json({ ok: true });
  } finally {
    await db.end({ timeout: 5 });
  }
}
