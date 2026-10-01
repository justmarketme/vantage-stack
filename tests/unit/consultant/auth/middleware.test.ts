// Real jose via Node's native require(esm) — same approach as the clinic-crm middleware test.
jest.mock("jose/jwt/sign", () => process.getBuiltinModule("node:module").createRequire(__filename)("jose/jwt/sign"));
jest.mock("jose/jwt/verify", () => process.getBuiltinModule("node:module").createRequire(__filename)("jose/jwt/verify"));

import { NextRequest } from "next/server";
import { config, middleware } from "../../../../middleware";
import { signCrmMemberJwt } from "../../../../lib/auth/crm-jwt";
import type { TeamRole } from "../../../../lib/admin/roles";

/**
 * The real middleware with a real signed member JWT cookie: a sales_consultant is kept out of
 * the whole CRM (pages and API) but let into the portal, which gets its hardening headers.
 */
const ORIGIN = "https://www.vantagestack.co.za";
const MEMBER = "11111111-2222-4333-8444-555555555555";

function req(path: string, init: { method?: string; cookie?: string; origin?: string } = {}) {
  const headers = new Headers({ host: "www.vantagestack.co.za" });
  if (init.cookie) headers.set("cookie", `vs_admin_session=${init.cookie}`);
  if (init.origin) headers.set("origin", init.origin);
  return new NextRequest(new URL(path, ORIGIN), { method: init.method ?? "GET", headers });
}

const cookieFor = (role: TeamRole) =>
  signCrmMemberJwt({ memberId: MEMBER, role, username: role, sessionVersion: 0, rememberMe: false }) as Promise<string>;

describe("middleware · Consultant Portal access", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.CRM_JWT_SECRET = "x".repeat(48);
    (process.env as Record<string, string>).NODE_ENV = "production";
  });
  afterAll(() => {
    process.env = saved;
  });

  test("sales_consultant: /crm page → unauthorized redirect; /api/crm/clients → 403", async () => {
    const cookie = await cookieFor("sales_consultant");
    const page = await middleware(req("/crm", { cookie }));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toContain("/admin/unauthorized");
    const pipeline = await middleware(req("/crm/pipeline", { cookie }));
    expect(pipeline.headers.get("location")).toContain("/admin/unauthorized");
    for (const path of ["/api/crm/clients", "/api/crm/clients/abc", "/api/crm/pipeline"]) {
      const api = await middleware(req(path, { cookie }));
      expect(api.status).toBe(403);
    }
  });

  test("sales_consultant: portal page passes with CSP / Permissions-Policy / no-store; API passes with no-store", async () => {
    const cookie = await cookieFor("sales_consultant");
    const page = await middleware(req("/consultant", { cookie }));
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("wss://*.twilio.com");
    expect(page.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(page.headers.get("permissions-policy")).toContain("microphone=(self)");
    expect(page.headers.get("x-frame-options")).toBe("DENY");
    expect(page.headers.get("cache-control")).toContain("no-store");
    const api = await middleware(req("/api/consultant/leads", { cookie }));
    expect(api.status).toBe(200);
    expect(api.headers.get("cache-control")).toContain("no-store");
  });

  test("viewer (CRM read, no portal permission) is kept out of the portal", async () => {
    const cookie = await cookieFor("viewer");
    expect((await middleware(req("/api/consultant/leads", { cookie }))).status).toBe(403);
    expect((await middleware(req("/consultant", { cookie }))).headers.get("location")).toContain("/admin/unauthorized");
    expect((await middleware(req("/api/crm/clients", { cookie }))).status).toBe(200);
  });

  test("no session: portal API 401, page → login; cross-origin write → 403", async () => {
    expect((await middleware(req("/api/consultant/leads"))).status).toBe(401);
    expect((await middleware(req("/consultant/pipeline"))).headers.get("location")).toContain("/admin/login");
    const cookie = await cookieFor("sales_consultant");
    const csrf = await middleware(req("/api/consultant/leads", { method: "POST", cookie, origin: "https://evil.vantagestack.co.za" }));
    expect(csrf.status).toBe(403);
    const same = await middleware(req("/api/consultant/leads", { method: "POST", cookie, origin: ORIGIN }));
    expect(same.status).toBe(200);
  });

  test("a forged cookie (wrong secret) is no session", async () => {
    const cookie = await cookieFor("super_admin");
    process.env.CRM_JWT_SECRET = "y".repeat(48);
    expect((await middleware(req("/api/consultant/leads", { cookie }))).status).toBe(401);
  });

  test("read-only oversight roles: see the portal, cannot write pipeline data", async () => {
    for (const role of ["systems_ops", "acquisition_creative"] as TeamRole[]) {
      const cookie = await cookieFor(role);
      expect((await middleware(req("/consultant", { cookie }))).status).toBe(200);
      expect((await middleware(req("/api/consultant/leads", { cookie }))).status).toBe(200);
      const write = await middleware(req("/api/consultant/leads/abc", { method: "PATCH", cookie, origin: ORIGIN }));
      expect(write.status).toBe(403);
      expect(write.headers.get("cache-control")).toContain("no-store");
      const search = await middleware(req("/api/consultant/leads/search", { method: "POST", cookie, origin: ORIGIN }));
      expect(search.status).toBe(200);
      expect((await middleware(req("/api/crm/clients", { cookie }))).status).toBe(403);
    }
    const sys = await cookieFor("systems_ops");
    expect((await middleware(req("/consultant/admin/systems", { cookie: sys }))).status).toBe(200);
    expect((await middleware(req("/consultant/admin/growth", { cookie: sys }))).headers.get("location")).toContain("/admin/unauthorized");
    const acq = await cookieFor("acquisition_creative");
    expect((await middleware(req("/consultant/admin/growth", { cookie: acq }))).status).toBe(200);
    expect((await middleware(req("/consultant/admin/systems", { cookie: acq }))).headers.get("location")).toContain("/admin/unauthorized");
  });

  test("calendar OAuth callback: top-level GET from Google with the Lax cookie passes", async () => {
    const cookie = await cookieFor("sales_consultant");
    const res = await middleware(
      req("/api/consultant/calendar/google/callback?code=x&state=y", { cookie, origin: "https://accounts.google.com" }),
    );
    expect(res.status).toBe(200);
  });
});

describe("middleware matcher · self-authenticating routes stay outside", () => {
  /** Next's matcher syntax here is `/prefix/:path*` or an exact path; compare on the static prefix. */
  const matches = (path: string) =>
    config.matcher.some((m) => {
      const prefix = m.replace(/\/:path\*$/, "");
      return m.endsWith(":path*") ? path === prefix || path.startsWith(`${prefix}/`) : path === m;
    });

  test.each([
    "/api/webhooks/n8n-ingress",
    "/api/webhooks/emma-inbound",
    "/api/webhooks/emma-status",
    "/api/cron/consultant-dispatch",
    "/api/consultant-voice/twiml",
    "/consultant-sw.js",
  ])("%s is not matched (no session required)", (path) => {
    expect(matches(path)).toBe(false);
  });

  test("the portal itself is matched", () => {
    expect(matches("/consultant")).toBe(true);
    expect(matches("/api/consultant/calendar/google/callback")).toBe(true);
  });
});
