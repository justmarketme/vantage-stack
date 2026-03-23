import { NextResponse } from "next/server";
import { z } from "zod";
import { connectCrmDb } from "../../../../lib/crm/db";
import { getMemberByEmail, getMemberByUsername } from "../../../../lib/team/members";
import { insertPasswordResetToken } from "../../../../lib/team/security";
import { generateOpaqueToken, hashOpaqueToken } from "../../../../lib/auth/token-hash";
import { sendTransactionalEmail, publicAppOrigin } from "../../../../lib/auth/mail";
import { logTeamAction } from "../../../../lib/team/members";

const Body = z.object({
  identifier: z.string().min(1),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
  const idf = parsed.data.identifier.trim();
  const db = await connectCrmDb();
  if (!db) {
    return NextResponse.json({
      ok: true,
      message: "If an account exists, password reset instructions will be sent.",
    });
  }
  try {
    const looksEmail = idf.includes("@");
    const m = looksEmail ? await getMemberByEmail(db, idf) : await getMemberByUsername(db, idf);
    if (m && m.status === "active" && m.password_hash) {
      const raw = generateOpaqueToken(32);
      const th = hashOpaqueToken(raw);
      const exp = new Date(Date.now() + 60 * 60_000).toISOString();
      await insertPasswordResetToken(db, m.id, th, exp);
      const origin = publicAppOrigin();
      const link = `${origin}/admin/reset-password?t=${encodeURIComponent(raw)}`;
      await sendTransactionalEmail({
        to: m.email,
        subject: "Reset Your VantageStack Password",
        html: `<p>Click the link below to reset your password. This link expires in 1 hour.</p><p><a href="${link}">Reset password</a></p>`,
        text: `Reset your password (expires in 1 hour): ${link}`,
      });
      await logTeamAction(db, {
        member_id: m.id,
        actor_username: m.username,
        action_type: "password_reset_requested",
        details: { self_service: true },
      });
    }
  } finally {
    await db.end({ timeout: 5 });
  }
  return NextResponse.json({
    ok: true,
    message: "Check your email for password reset instructions.",
  });
}
