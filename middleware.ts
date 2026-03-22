import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { parseSessionEdge } from "./lib/admin/session-edge";
import { roleMayAccessPage } from "./lib/admin/rbac-paths";
import type { TeamRole } from "./lib/admin/roles";
import { can } from "./lib/admin/roles";
import { crmAuthSecretRaw } from "./lib/auth/crm-jwt";

const ADMIN_COOKIE = "vs_admin_session";

export const config = {
  matcher: ["/admin/:path*", "/crm/:path*", "/api/crm/:path*", "/api/admin/:path*"],
};

function withNoIndex(res: NextResponse) {
  res.headers.set("x-robots-tag", "noindex, nofollow");
  return res;
}

function isPublicAdminPath(pathname: string) {
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) return true;
  if (pathname === "/admin/setup" || pathname.startsWith("/admin/setup/")) return true;
  if (pathname === "/admin/invite" || pathname.startsWith("/admin/invite/")) return true;
  if (pathname === "/admin/unauthorized" || pathname.startsWith("/admin/unauthorized/")) return true;
  if (pathname === "/admin/forgot-username" || pathname.startsWith("/admin/forgot-username/")) return true;
  if (pathname === "/admin/forgot-password" || pathname.startsWith("/admin/forgot-password/")) return true;
  if (pathname === "/admin/reset-password" || pathname.startsWith("/admin/reset-password/")) return true;
  if (pathname === "/admin/verify-email" || pathname.startsWith("/admin/verify-email/")) return true;
  return false;
}

function isPublicAdminApi(pathname: string, method: string) {
  if (pathname === "/api/admin/login" && method === "POST") return true;
  if (pathname === "/api/admin/logout" && method === "POST") return true;
  if (pathname === "/api/admin/setup" && (method === "GET" || method === "POST")) return true;
  if (pathname === "/api/admin/forgot-username" && method === "POST") return true;
  if (pathname === "/api/admin/forgot-password" && method === "POST") return true;
  if (pathname === "/api/admin/reset-password" && method === "POST") return true;
  if (pathname === "/api/admin/verify-email" && method === "POST") return true;
  if (pathname === "/api/admin/invite/accept" && method === "POST") return true;
  if (pathname === "/api/admin/invite/info" && method === "GET") return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const method = request.method;

  if (isPublicAdminPath(path)) {
    return withNoIndex(NextResponse.next());
  }

  if (path === "/api/crm/client/intake" && method === "POST") {
    const intakeSecret = (process.env.CRM_INTAKE_SECRET || "").trim();
    if (intakeSecret && request.headers.get("x-crm-intake-key") === intakeSecret) {
      return NextResponse.next();
    }
  }

  if (path === "/api/admin/team/bootstrap" && method === "POST") {
    const cron = (process.env.CRON_SECRET || "").trim();
    if (cron && request.headers.get("authorization") === `Bearer ${cron}`) {
      return NextResponse.next();
    }
  }

  if (isPublicAdminApi(path, method)) {
    return NextResponse.next();
  }

  const secret = crmAuthSecretRaw();
  const cookie = request.cookies.get(ADMIN_COOKIE)?.value;
  const session = secret ? await parseSessionEdge(cookie, secret) : null;

  if (!session) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  const role: TeamRole = session.kind === "legacy" ? "super_admin" : session.role;

  if (path.startsWith("/api/admin/team")) {
    if (!can(role, "manage_users") && !can(role, "invite_team")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
  }

  if (!path.startsWith("/api/") && !roleMayAccessPage(role, path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/unauthorized";
    url.searchParams.set("from", path);
    return NextResponse.redirect(url);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-vs-role", role);
  requestHeaders.set("x-vs-session-kind", session.kind);
  if (session.kind === "member") {
    requestHeaders.set("x-vs-member-id", session.memberId);
    if (session.username) requestHeaders.set("x-vs-username", session.username);
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  if (!path.startsWith("/api/")) {
    withNoIndex(res);
  }
  return res;
}
