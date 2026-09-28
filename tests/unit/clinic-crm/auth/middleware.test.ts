// Real jose via Node's native require(esm) — see token.test.ts for why.
jest.mock("jose/jwt/sign", () => process.getBuiltinModule("node:module").createRequire(__filename)("jose/jwt/sign"));
jest.mock("jose/jwt/verify", () => process.getBuiltinModule("node:module").createRequire(__filename)("jose/jwt/verify"));

import { NextRequest } from "next/server";
import {
  clinicCrmMiddleware,
  contentSecurityPolicy,
  isClinicCrmPath,
  isPublicClinicCrmPath,
} from "../../../../lib/clinic-crm/auth/middleware";
import { SESSION_COOKIE, signSessionToken } from "../../../../lib/clinic-crm/auth/token";

const SECRET_STR = "s".repeat(48);
const ORIGIN = "https://clinics.vantagestack.co.za";

function req(path: string, init: { method?: string; cookie?: string; headers?: Record<string, string> } = {}) {
  const headers = new Headers({ host: "clinics.vantagestack.co.za", ...(init.headers ?? {}) });
  if (init.cookie) headers.set("cookie", `${SESSION_COOKIE}=${init.cookie}`);
  return new NextRequest(new URL(path, ORIGIN), { method: init.method ?? "GET", headers });
}

async function validCookie() {
  return signSessionToken(
    { staffId: "s1", clinicId: "c1", role: "owner", name: "N", clinicName: "C" },
    new TextEncoder().encode(SECRET_STR),
  );
}

describe("clinic-crm middleware", () => {
  const prev = process.env.CLINIC_CRM_SESSION_SECRET;
  beforeEach(() => {
    process.env.CLINIC_CRM_SESSION_SECRET = SECRET_STR;
  });
  afterAll(() => {
    if (prev === undefined) delete process.env.CLINIC_CRM_SESSION_SECRET;
    else process.env.CLINIC_CRM_SESSION_SECRET = prev;
  });

  it("scopes to clinic-crm paths only (never /clinics or /crm)", () => {
    expect(isClinicCrmPath("/clinic-crm")).toBe(true);
    expect(isClinicCrmPath("/clinic-crm/inbox")).toBe(true);
    expect(isClinicCrmPath("/api/clinic-crm/patients")).toBe(true);
    expect(isClinicCrmPath("/clinics")).toBe(false);
    expect(isClinicCrmPath("/clinic-crmx")).toBe(false);
    expect(isClinicCrmPath("/api/crm/x")).toBe(false);
  });

  it("public surface is exactly login, logout, webhooks, cron", () => {
    expect(isPublicClinicCrmPath("/clinic-crm/login", "GET")).toBe(true);
    expect(isPublicClinicCrmPath("/api/clinic-crm/auth/login", "POST")).toBe(true);
    expect(isPublicClinicCrmPath("/api/clinic-crm/auth/login", "GET")).toBe(false);
    expect(isPublicClinicCrmPath("/api/clinic-crm/auth/logout", "POST")).toBe(true);
    expect(isPublicClinicCrmPath("/api/clinic-crm/webhooks/twilio", "POST")).toBe(true);
    expect(isPublicClinicCrmPath("/api/clinic-crm/webhooks/twilio/status", "POST")).toBe(true);
    expect(isPublicClinicCrmPath("/api/clinic-crm/cron/dispatch", "GET")).toBe(true);
    expect(isPublicClinicCrmPath("/api/clinic-crm/auth/me", "GET")).toBe(false);
    expect(isPublicClinicCrmPath("/api/clinic-crm/patients", "GET")).toBe(false);
    expect(isPublicClinicCrmPath("/clinic-crm", "GET")).toBe(false);
    expect(isPublicClinicCrmPath("/api/clinic-crm/webhooksx", "POST")).toBe(false);
  });

  it("redirects an unauthenticated page request to login with next=<path>", async () => {
    const res = await clinicCrmMiddleware(req("/clinic-crm/patients"));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/clinic-crm/login");
    expect(loc.searchParams.get("next")).toBe("/clinic-crm/patients");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("401s an unauthenticated API request with {error}", async () => {
    const res = await clinicCrmMiddleware(req("/api/clinic-crm/patients"));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects a forged cookie", async () => {
    const res = await clinicCrmMiddleware(req("/api/clinic-crm/patients", { cookie: "a.b.c" }));
    expect(res.status).toBe(401);
  });

  it("lets a signed-in page through with nonce CSP and security headers", async () => {
    const res = await clinicCrmMiddleware(req("/clinic-crm", { cookie: await validCookie() }));
    expect(res.status).toBe(200);
    const csp = res.headers.get("content-security-policy")!;
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("https://fonts.googleapis.com");
    expect(csp).toContain("https://fonts.gstatic.com");
    expect(res.headers.get("permissions-policy")).toContain("microphone=(self)");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("sends a signed-in user away from the login page", async () => {
    const res = await clinicCrmMiddleware(req("/clinic-crm/login", { cookie: await validCookie() }));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/clinic-crm");
  });

  it("blocks cross-site writes but not same-site ones or webhooks", async () => {
    const cookie = await validCookie();
    const evil = await clinicCrmMiddleware(
      req("/api/clinic-crm/patients", { method: "POST", cookie, headers: { origin: "https://evil.example" } }),
    );
    expect(evil.status).toBe(403);
    const fetchSite = await clinicCrmMiddleware(
      req("/api/clinic-crm/auth/login", { method: "POST", headers: { "sec-fetch-site": "cross-site" } }),
    );
    expect(fetchSite.status).toBe(403);
    const same = await clinicCrmMiddleware(
      req("/api/clinic-crm/patients", { method: "POST", cookie, headers: { origin: ORIGIN } }),
    );
    expect(same.status).toBe(200);
    const webhook = await clinicCrmMiddleware(
      req("/api/clinic-crm/webhooks/twilio", { method: "POST", headers: { origin: "https://twilio.example" } }),
    );
    expect(webhook.status).toBe(200);
  });

  it("CSP does not carry a style nonce (would disable 'unsafe-inline' for React style attrs)", () => {
    const csp = contentSecurityPolicy("abc", false);
    const style = csp.split("; ").find((d) => d.startsWith("style-src"))!;
    expect(style).not.toContain("nonce");
    expect(style).toContain("'unsafe-inline'");
    expect(contentSecurityPolicy("abc", true)).toContain("'unsafe-eval'");
    expect(contentSecurityPolicy("abc", false)).not.toContain("'unsafe-eval'");
  });
});
