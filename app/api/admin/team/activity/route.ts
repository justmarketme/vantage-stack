import { NextResponse } from "next/server";
import { connectCrmDb } from "../../../../../lib/crm/db";
import { requireAnyPermission } from "../../../../../lib/admin/api-auth";
import { fetchMemberActivity } from "../../../../../lib/team/members";

export async function GET(req: Request) {
  const gate = await requireAnyPermission("manage_users", "invite_team");
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const username = (url.searchParams.get("username") || "").trim();
  if (!username) {
    return NextResponse.json({ ok: false, error: "Missing username query" }, { status: 400 });
  }

  const db = await connectCrmDb();
  if (!db) return NextResponse.json({ ok: false, error: "No database" }, { status: 503 });
  try {
    const activity = await fetchMemberActivity(db, username, 150);
    return NextResponse.json({ ok: true, activity });
  } finally {
    await db.end({ timeout: 5 });
  }
}
