import { NextResponse } from "next/server";
import { z } from "zod";
import { connectCrmDb } from "../../../../../lib/crm/db";
import { countTeamMembers, insertTeamMember, logTeamAction } from "../../../../../lib/team/members";
import { hashPassword } from "../../../../../lib/admin/password";

const Body = z.object({
  username: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.literal("super_admin"),
});

/**
 * One-time bootstrap when team_members is empty. Requires Authorization: Bearer CRON_SECRET
 */
export async function POST(req: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();
  const auth = (req.headers.get("authorization") || "").trim();
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }

  const db = connectCrmDb();
  if (!db) return NextResponse.json({ ok: false, error: "No database" }, { status: 503 });
  try {
    const n = await countTeamMembers(db);
    if (n > 0) {
      return NextResponse.json({ ok: false, error: "Team already bootstrapped" }, { status: 409 });
    }
    const hash = await hashPassword(parsed.data.password);
    const id = await insertTeamMember(db, {
      username: parsed.data.username,
      email: parsed.data.email,
      role: "super_admin",
      password_hash: hash,
      created_by: null,
      status: "active",
    });
    if (!id) return NextResponse.json({ ok: false, error: "Insert failed" }, { status: 500 });
    await logTeamAction(db, { actor_username: "bootstrap", action_type: "team_bootstrap", details: { member_id: id } });
    return NextResponse.json({ ok: true, member_id: id });
  } finally {
    await db.end({ timeout: 5 });
  }
}
