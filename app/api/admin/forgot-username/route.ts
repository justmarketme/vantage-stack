import { NextResponse } from "next/server";
import { z } from "zod";
import { connectCrmDb } from "../../../../lib/crm/db";
import { getMemberByEmail } from "../../../../lib/team/members";
import { sendTransactionalEmail, publicAppOrigin } from "../../../../lib/auth/mail";

const Body = z.object({
  email: z.string().email(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });
  }
  const db = connectCrmDb();
  if (!db) {
    return NextResponse.json({ ok: true, message: "If an account exists with that email, you'll receive it shortly." });
  }
  try {
    const m = await getMemberByEmail(db, parsed.data.email);
    if (m) {
      const origin = publicAppOrigin();
      await sendTransactionalEmail({
        to: m.email,
        subject: "Your VantageStack Username",
        html: `<p>Here's your username: <strong>${escapeHtml(m.username)}</strong>.</p><p>Use this to log in at <a href="${origin}/admin/login">${origin}/admin/login</a>.</p>`,
        text: `Here's your username: ${m.username}. Log in at ${origin}/admin/login`,
      });
    }
  } finally {
    await db.end({ timeout: 5 });
  }
  return NextResponse.json({
    ok: true,
    message: "If an account exists with that email, you'll receive it shortly.",
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
