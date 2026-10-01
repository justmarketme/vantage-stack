import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { parseSessionEdge } from "./lib/admin/session-edge";
import { readOnlyPortalWriteAllowed, roleMayAccessPage } from "./lib/admin/rbac-paths";
import type { TeamRole } from "./lib/admin/roles";
import { can } from "./lib/admin/roles";
import { crmAuthSecretRaw } from "./lib/auth/crm-jwt";
import { clinicCrmMiddleware, isClinicCrmPath } from "./lib/clinic-crm/auth/middleware";
import {
  consultantApiHeaders,
  consultantPageHeaders,
  consultantSupabaseUrls,
  isCrossOriginWrite,
} from "./lib/consultant/auth/securityHeaders";

const ADMIN_COOKIE = "vs_admin_session";

export const config = {
  // "/" is included solely for the clinics-subdomain rewrite below. Everything
  // else in this matcher is the admin/CRM auth surface.
  matcher: [
    "/",
    "/admin/:path*",
    "/crm/:path*",
    "/api/crm/:path*",
    "/api/admin/:path*",
    "/clinic-crm/:path*",
    "/api/clinic-crm/:path*",
    // Consultant Portal. Deliberately NOT here (no session; each route authenticates itself):
    //   /api/consultant-voice/**                Twilio voice webhooks — X-Twilio-Signature
    //   /api/webhooks/n8n-ingress               n8n → app — X-VS-Signature (auth/signing.ts)
    //   /api/webhooks/emma-inbound, emma-status Twilio WhatsApp/SMS — X-Twilio-Signature
    //   /api/cron/consultant-dispatch           Vercel Cron — Bearer CRON_SECRET
    // tests/unit/consultant/auth/middleware.test.ts pins that none of them match.
    "/consultant/:path*",
    "/api/consultant/:path*",
  ],
};

/** Host that should serve the clinics landing page at its root. */
const CLINICS_HOST = "clinics.vantagestack.co.za";

function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function withHeaders<T extends NextResponse>(res: T, headers: Record<string, string>): T {
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

function withNoIndex(res: NextResponse) {
  res.headers.set("x-robots-tag", "noindex, nofollow");
  return res;
}

function isPublicAdminPath(pathname: string) {
  if (pathname === "/admin" || pathname === "/admin/") return true;
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

  // Clinic CRM has its own session and rules; it never falls through to admin auth.
  if (isClinicCrmPath(path)) {
    return clinicCrmMiddleware(request);
  }

  // ── Clinics subdomain ────────────────────────────────────────────────
  // clinics.vantagestack.co.za shares this deployment with the main site, so
  // its root must serve /clinics rather than the VantageStack homepage.
  //
  // This is done here rather than via a `rewrites()` entry in next.config.mjs
  // or vercel.json: both were deployed and verified live to be ignored for this
  // host (the response came back with X-Matched-Path: /). Middleware sees the
  // real Host header and is the mechanism that actually works.
  //
  // Scoped to the root path only, so every other route on the subdomain still
  // resolves normally, and returns immediately so no auth logic below can run
  // against a marketing page.
  if (path === "/") {
    const host = (request.headers.get("host") || "").toLowerCase().split(":")[0];
    if (host === CLINICS_HOST) {
      const url = request.nextUrl.clone();
      url.pathname = "/clinics";
      // REDIRECT, not rewrite — and this distinction cost a production bug.
      //
      // A rewrite makes the server render /clinics while the client router
      // still believes the route is "/". App Router then hydrates the homepage
      // component against clinics markup, React throws #418 (hydration
      // mismatch) and the server HTML freezes: every client-side effect stops,
      // which in practice meant the Isabel invite card could never unmount on
      // the one origin the gating exists for.
      //
      // A redirect keeps server and client agreeing on the route. The cost is a
      // visible /clinics in the address bar, which is a fair price for a page
      // that actually hydrates. 308 so it is cached and method-preserving.
      return NextResponse.redirect(url, 308);
    }
    // Any other host hitting "/" is the normal homepage — hand it straight back
    // untouched. Without this the admin logic below would run on every visit.
    return NextResponse.next();
  }

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

  const isConsultantPage = under(path, "/consultant");
  const isConsultantApi = under(path, "/api/consultant");
  const isProd = process.env.NODE_ENV === "production";
  const isDev = process.env.NODE_ENV === "development";
  const apiHeaders = isConsultantApi ? consultantApiHeaders({ isProd }) : {};

  // GET is never a "write", so the calendar OAuth callback (a top-level GET navigation back
  // from Google / Microsoft, Origin absent or theirs) passes here, and the SameSite=Lax session
  // cookie IS sent on top-level cross-site GET navigations, so it is authenticated normally.
  if (isConsultantApi && isCrossOriginWrite(method, request.headers.get("origin"), request.headers.get("host"))) {
    return withHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }), apiHeaders);
  }

  const secret = crmAuthSecretRaw();
  const cookie = request.cookies.get(ADMIN_COOKIE)?.value;
  let session = secret ? await parseSessionEdge(cookie, secret) : null;

  if (process.env.NODE_ENV === "development" && !session) {
    session = { kind: "legacy", role: "super_admin" } as any;
  }

  if (!session) {
    if (isConsultantApi) {
      return withHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), apiHeaders);
    }
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

  // The CRM API returns every client; only roles that may view the CRM get it. Closes the
  // gap where any valid session (e.g. a sales_consultant) could read /api/crm/** directly.
  if (under(path, "/api/crm") && !can(role, "view_clients")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  if (isConsultantApi && !can(role, "use_consultant_portal")) {
    return withHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }), apiHeaders);
  }

  // Read-only oversight roles (systems_ops, acquisition_creative) may only send the few
  // permissioned admin writes — never pipeline writes. The handler still checks the permission.
  if (isConsultantApi && !readOnlyPortalWriteAllowed(role, method, path)) {
    return withHeaders(NextResponse.json({ error: "Read-only access" }, { status: 403 }), apiHeaders);
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
  if (isConsultantPage) withHeaders(res, consultantPageHeaders({ isDev, isProd, supabaseUrls: consultantSupabaseUrls() }));
  if (isConsultantApi) withHeaders(res, apiHeaders);
  return res;
}
