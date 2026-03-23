import { NextResponse } from "next/server";
import { z } from "zod";
import { connectCrmDb } from "../../../../lib/crm/db";
import {
  countActiveSuperAdmins,
  getMemberByEmail,
  getMemberByUsername,
  insertTeamMember,
  logTeamAction,
} from "../../../../lib/team/members";
import { hashPassword } from "../../../../lib/admin/password";
import { checkPasswordPolicy, isValidUsername, passwordPolicyError } from "../../../../lib/auth/password-policy";
import { generateOpaqueToken, hashOpaqueToken } from "../../../../lib/auth/token-hash";
import { insertEmailVerifyToken } from "../../../../lib/team/security";
import { sendTransactionalEmail, publicAppOrigin } from "../../../../lib/auth/mail";
import { supabaseAdminCreateUser } from "../../../../lib/auth/supabase-user";

const Body = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(20),
  password: z.string().min(12),
  full_name: z.string().max(200).optional().nullable(),
  terms_accepted: z.literal(true),
});

/** Allow slow first connect (Supabase pooler auto-detect) + query. */
const SETUP_STATUS_MS = 25_000;

export async function GET() {
  const db = await connectCrmDb();
  if (!db) {
    return NextResponse.json(
      { ok: false, needs_setup: false, error: "No DATABASE_URL (or other CRM DB env) — add it to .env.local" },
      { status: 503 },
    );
  }
  try {
    const n = await Promise.race([
      countActiveSuperAdmins(db),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("Database check timed out — check DATABASE_URL and network")), SETUP_STATUS_MS),
      ),
    ]);
    return NextResponse.json({ ok: true, needs_setup: n === 0 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Database error";
    return NextResponse.json({ ok: false, needs_setup: false, error: msg }, { status: 503 });
  } finally {
    try {
      await db.end({ timeout: 5 });
    } catch {
      /* ignore */
    }
  }
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const { email, username, password, full_name, terms_accepted } = parsed.data;
  if (!terms_accepted) {
    return NextResponse.json({ ok: false, error: "You must accept the terms" }, { status: 400 });
  }
  if (!isValidUsername(username)) {
    return NextResponse.json(
      { ok: false, error: "Username must be 3–20 characters, letters, numbers, and underscores only" },
      { status: 400 },
    );
  }
  const policy = checkPasswordPolicy(password);
  if (!policy.ok) {
    return NextResponse.json({ ok: false, error: passwordPolicyError() }, { status: 400 });
  }

  const db = await connectCrmDb();
  if (!db) return NextResponse.json({ ok: false, error: "No database" }, { status: 503 });

  try {
    const n = await countActiveSuperAdmins(db);
    if (n > 0) {
      return NextResponse.json({ ok: false, error: "Initial setup is already complete" }, { status: 403 });
    }
    if (await getMemberByEmail(db, email)) {
      return NextResponse.json({ ok: false, error: "Email is already registered" }, { status: 409 });
    }
    if (await getMemberByUsername(db, username)) {
      return NextResponse.json({ ok: false, error: "Username is already taken" }, { status: 409 });
    }

    const hash = await hashPassword(password);
    const supa = await supabaseAdminCreateUser({
      email,
      password,
      username,
      role: "super_admin",
    });

    const id = await insertTeamMember(db, {
      username,
      email,
      role: "super_admin",
      password_hash: hash,
      created_by: null,
      status: "active",
      full_name: full_name ?? null,
      supabase_user_id: supa?.id ?? null,
    });
    if (!id) return NextResponse.json({ ok: false, error: "Could not create account" }, { status: 500 });

    const raw = generateOpaqueToken(32);
    const th = hashOpaqueToken(raw);
    const exp = new Date(Date.now() + 48 * 60 * 60_000).toISOString();
    await insertEmailVerifyToken(db, id, th, exp);

    const origin = publicAppOrigin();
    const link = `${origin}/admin/verify-email?t=${encodeURIComponent(raw)}`;

    await sendTransactionalEmail({
      to: email,
      subject: "Verify your VantageStack account",
      html: `<p>Confirm your email to finish setup.</p><p><a href="${link}">Verify email</a></p><p>This link expires in 48 hours.</p>`,
      text: `Verify your email: ${link}`,
    });

    await logTeamAction(db, {
      member_id: id,
      actor_username: username,
      action_type: "first_admin_created",
      details: { email },
    });

    return NextResponse.json({ ok: true, verify_email_sent: true });
  } finally {
    await db.end({ timeout: 5 });
  }
}
