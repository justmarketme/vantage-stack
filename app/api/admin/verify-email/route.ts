import { NextResponse } from "next/server";
import { z } from "zod";
import { connectCrmDb } from "../../../../lib/crm/db";
import { consumeEmailVerifyToken } from "../../../../lib/team/security";
import { getMemberById, logTeamAction, updateMember } from "../../../../lib/team/members";
import { hashOpaqueToken } from "../../../../lib/auth/token-hash";

const Body = z.object({
  token: z.string().min(20),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 400 });
  }
  const db = await connectCrmDb();
  if (!db) return NextResponse.json({ ok: false, error: "No database" }, { status: 503 });
  try {
    const th = hashOpaqueToken(parsed.data.token);
    const row = await consumeEmailVerifyToken(db, th);
    if (!row) {
      return NextResponse.json({ ok: false, error: "Invalid or expired verification link" }, { status: 400 });
    }
    const m = await getMemberById(db, row.member_id);
    if (!m) return NextResponse.json({ ok: false, error: "User not found" }, { status: 400 });
    await updateMember(db, row.member_id, {
      email_verified_at: new Date().toISOString(),
    });
    await logTeamAction(db, {
      member_id: row.member_id,
      actor_username: m.username,
      action_type: "email_verified",
      details: {},
    });
    return NextResponse.json({ ok: true });
  } finally {
    await db.end({ timeout: 5 });
  }
}
