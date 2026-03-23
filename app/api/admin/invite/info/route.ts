import { NextResponse } from "next/server";
import { connectCrmDb } from "../../../../../lib/crm/db";
import { getMemberByInviteToken } from "../../../../../lib/team/members";
import { getCrmInvitationByTokenHash } from "../../../../../lib/team/security";
import { hashOpaqueToken } from "../../../../../lib/auth/token-hash";

/** Public: invitation preview for signup form (email + suggested username). */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t") || new URL(req.url).searchParams.get("token") || "";
  if (token.length < 10) {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 400 });
  }
  const db = await connectCrmDb();
  if (!db) return NextResponse.json({ ok: false, error: "No database" }, { status: 503 });
  try {
    const inv = await getCrmInvitationByTokenHash(db, hashOpaqueToken(token));
    if (inv && new Date(inv.expires_at) >= new Date()) {
      return NextResponse.json({
        ok: true,
        email: inv.email,
        username: inv.username,
        source: "invitation",
      });
    }
    const row = await getMemberByInviteToken(db, token);
    if (row && (!row.invite_expires_at || new Date(row.invite_expires_at) >= new Date())) {
      return NextResponse.json({
        ok: true,
        email: row.email,
        username: row.username,
        source: "legacy",
      });
    }
    return NextResponse.json({ ok: false, error: "Invalid or expired" }, { status: 404 });
  } finally {
    await db.end({ timeout: 5 });
  }
}
