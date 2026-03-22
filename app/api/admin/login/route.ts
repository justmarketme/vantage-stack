import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import {
  ADMIN_COOKIE,
  createAdminSessionToken,
  signMemberJwtCookie,
  adminPasswordConfigured,
  getAdminPassword,
} from "../../../../lib/admin/session";
import { connectCrmDb } from "../../../../lib/crm/db";
import { getMemberByEmail, getMemberByUsername, updateMember } from "../../../../lib/team/members";
import { verifyPassword } from "../../../../lib/admin/password";
import { logAuthLogin } from "../../../../lib/team/security";

function safeCompare(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function clientIp(req: Request): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
}

const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;

export async function POST(req: Request) {
  let body: {
    email?: string;
    password?: string;
    username?: string;
    remember_me?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const password = String(body.password ?? "");
  const rememberMe = Boolean(body.remember_me);
  const email = String(body.email ?? "").trim().toLowerCase();
  const username = String(body.username ?? "").trim();
  const ua = req.headers.get("user-agent");
  const ip = clientIp(req);

  const db = connectCrmDb();

  /** Legacy env-only password (no username). */
  if (!username && !email && adminPasswordConfigured()) {
    const expected = getAdminPassword();
    if (!safeCompare(password, expected)) {
      return NextResponse.json({ ok: false, error: "Invalid password" }, { status: 401 });
    }
    const token = createAdminSessionToken();
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing signing secret for session." }, { status: 503 });
    }
    const res = NextResponse.json({ ok: true });
    const secure = process.env.NODE_ENV === "production";
    res.cookies.set(ADMIN_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });
    return res;
  }

  if (!db) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  try {
    if (username || email) {
      const member = username
        ? await getMemberByUsername(db, username)
        : email
          ? await getMemberByEmail(db, email)
          : null;

      const unameForLog = username || member?.username || email || "";

      if (!member) {
        await logAuthLogin(db, {
          username_attempt: unameForLog,
          email_attempt: email || null,
          success: false,
          ip,
          user_agent: ua,
        });
        return NextResponse.json({ ok: false, error: "Invalid username or password" }, { status: 401 });
      }

      if (member.status !== "active") {
        await logAuthLogin(db, {
          username_attempt: member.username,
          email_attempt: member.email,
          success: false,
          member_id: member.id,
          ip,
          user_agent: ua,
        });
        return NextResponse.json({ ok: false, error: "Account is inactive" }, { status: 403 });
      }

      if (member.locked_until && new Date(member.locked_until) > new Date()) {
        const mins = Math.ceil((new Date(member.locked_until).getTime() - Date.now()) / 60000);
        return NextResponse.json(
          {
            ok: false,
            error:
              "Account temporarily locked due to too many failed login attempts. Try again in 15 minutes.",
            retry_after_minutes: Math.max(1, mins),
          },
          { status: 423 },
        );
      }

      if (!member.password_hash) {
        await logAuthLogin(db, {
          username_attempt: member.username,
          email_attempt: member.email,
          success: false,
          member_id: member.id,
          ip,
          user_agent: ua,
        });
        return NextResponse.json(
          { ok: false, error: "Account pending — open your invitation link to set a password first." },
          { status: 403 },
        );
      }

      const okPass = await verifyPassword(password, member.password_hash);
      if (!okPass) {
        const attempts = (member.failed_login_attempts ?? 0) + 1;
        let lockedUntil: string | null = null;
        if (attempts >= LOCK_AFTER) {
          lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString();
        }
        await updateMember(db, member.id, {
          failed_login_attempts: attempts,
          locked_until: lockedUntil,
        });
        await logAuthLogin(db, {
          username_attempt: member.username,
          email_attempt: member.email,
          success: false,
          member_id: member.id,
          ip,
          user_agent: ua,
        });
        if (attempts >= LOCK_AFTER) {
          return NextResponse.json(
            {
              ok: false,
              error:
                "Account temporarily locked due to too many failed login attempts. Try again in 15 minutes.",
            },
            { status: 423 },
          );
        }
        return NextResponse.json({ ok: false, error: "Invalid username or password" }, { status: 401 });
      }

      await updateMember(db, member.id, {
        failed_login_attempts: 0,
        locked_until: null,
        last_login_at: new Date().toISOString(),
      });

      const token = await signMemberJwtCookie({
        memberId: member.id,
        role: member.role,
        username: member.username,
        sessionVersion: member.session_version ?? 0,
        rememberMe,
      });
      if (!token) {
        return NextResponse.json({ ok: false, error: "Missing JWT signing secret." }, { status: 503 });
      }

      await logAuthLogin(db, {
        username_attempt: member.username,
        email_attempt: member.email,
        success: true,
        member_id: member.id,
        ip,
        user_agent: ua,
      });

      const res = NextResponse.json({ ok: true });
      const secure = process.env.NODE_ENV === "production";
      const cookieOpts: Parameters<typeof res.cookies.set>[2] = {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
      };
      if (rememberMe) {
        cookieOpts.maxAge = 30 * 24 * 60 * 60;
      }
      res.cookies.set(ADMIN_COOKIE, token, cookieOpts);
      return res;
    }

    if (!adminPasswordConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Use your team username and password, or configure CRM_ADMIN_PASSWORD for legacy single-password access.",
        },
        { status: 400 },
      );
    }

    const expected = getAdminPassword();
    if (!safeCompare(password, expected)) {
      return NextResponse.json({ ok: false, error: "Invalid password" }, { status: 401 });
    }
    const token = createAdminSessionToken();
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing signing secret for session." }, { status: 503 });
    }
    const res = NextResponse.json({ ok: true });
    const secure = process.env.NODE_ENV === "production";
    res.cookies.set(ADMIN_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });
    return res;
  } finally {
    await db.end({ timeout: 5 });
  }
}
