// Real jose via Node's native require(esm) — see token.test.ts for why.
jest.mock("jose/jwt/sign", () => process.getBuiltinModule("node:module").createRequire(__filename)("jose/jwt/sign"));
jest.mock("jose/jwt/verify", () => process.getBuiltinModule("node:module").createRequire(__filename)("jose/jwt/verify"));

/**
 * The database is replaced by a tiny tagged-template fake that answers by SQL shape,
 * so these tests exercise the real route/session code paths without Postgres.
 */
type Row = Record<string, unknown>;
const mockState: { staff: Row[]; queries: string[]; audits: unknown[][] } = { staff: [], queries: [], audits: [] };

jest.mock("../../../../lib/clinic-crm/db", () => {
  const db = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join("?").replace(/\s+/g, " ").trim();
    mockState.queries.push(sql);
    if (sql.includes("WHERE s.email =")) {
      return Promise.resolve(mockState.staff.filter((s) => s.email === values[0]));
    }
    if (sql.includes("WHERE s.id =") && sql.includes("s.clinic_id =")) {
      return Promise.resolve(
        mockState.staff
          .filter((s) => s.id === values[0] && s.clinic_id === values[1])
          .map((s) => ({ role: s.role, name: s.name, clinic_name: s.clinic_name })),
      );
    }
    return Promise.resolve([]);
  };
  // Plain functions, not jest.fn: the repo's jest config has resetMocks: true.
  return {
    clinicDb: async () => db,
    audit: async (...args: unknown[]) => {
      mockState.audits.push(args.slice(1));
    },
  };
});

import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { POST as login } from "../../../../app/api/clinic-crm/auth/login/route";
import { POST as logout } from "../../../../app/api/clinic-crm/auth/logout/route";
import { GET as me } from "../../../../app/api/clinic-crm/auth/me/route";
import { requireSession, SESSION_COOKIE } from "../../../../lib/clinic-crm/auth/session";

const PASSWORD = "correct horse battery staple";
const HASH = bcrypt.hashSync(PASSWORD, 4);
const OWNER = {
  id: "11111111-1111-4111-8111-111111111111",
  clinic_id: "22222222-2222-4222-8222-222222222222",
  email: "owner@clinic.test",
  name: "Dr Owner",
  role: "owner",
  clinic_name: "Smile Dental",
  password_hash: HASH,
  locked_until: null as Date | null,
};

let ipSeq = 0;
function loginReq(body: unknown, ip = `10.0.0.${++ipSeq}`) {
  return new NextRequest("https://clinics.vantagestack.co.za/api/clinic-crm/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
function authedReq(path: string, cookie: string, method = "GET") {
  return new NextRequest(`https://clinics.vantagestack.co.za${path}`, {
    method,
    headers: { cookie: `${SESSION_COOKIE}=${cookie}` },
  });
}
function cookieFrom(res: Response): string {
  const set = res.headers.get("set-cookie") ?? "";
  const m = set.match(new RegExp(`${SESSION_COOKIE}=([^;]*)`));
  return m ? m[1] : "";
}

describe("clinic-crm auth routes + requireSession", () => {
  const prev = process.env.CLINIC_CRM_SESSION_SECRET;
  beforeEach(() => {
    process.env.CLINIC_CRM_SESSION_SECRET = "k".repeat(48);
    mockState.staff = [{ ...OWNER }];
    mockState.queries = [];
    mockState.audits = [];
  });
  afterAll(() => {
    if (prev === undefined) delete process.env.CLINIC_CRM_SESSION_SECRET;
    else process.env.CLINIC_CRM_SESSION_SECRET = prev;
  });

  it("400s a malformed body", async () => {
    expect((await login(loginReq("{not json"))).status).toBe(400);
    expect((await login(loginReq({ email: "nope", password: "x" }))).status).toBe(400);
  });

  it("503s when the session secret is missing or short", async () => {
    process.env.CLINIC_CRM_SESSION_SECRET = "short";
    expect((await login(loginReq({ email: OWNER.email, password: PASSWORD }))).status).toBe(503);
  });

  it("unknown email: generic 401 and still exactly one bcrypt compare", async () => {
    const spy = jest.spyOn(bcrypt, "compare");
    const res = await login(loginReq({ email: "ghost@clinic.test", password: PASSWORD }));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Invalid email or password" });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("wrong password: same generic 401, bumps failed_logins with a lockout clause, audits", async () => {
    const res = await login(loginReq({ email: OWNER.email, password: "wrong" }));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Invalid email or password" });
    const upd = mockState.queries.find((q) => q.startsWith("UPDATE clinic_crm.staff SET failed_logins = failed_logins + 1"));
    expect(upd).toContain("locked_until");
    expect(mockState.audits).toContainEqual([OWNER.clinic_id, OWNER.id, "login_failed", "staff", OWNER.id]);
  });

  it("locked account: 429 even with the correct password, no cookie", async () => {
    mockState.staff[0].locked_until = new Date(Date.now() + 10 * 60_000);
    const res = await login(loginReq({ email: OWNER.email, password: PASSWORD }));
    expect(res.status).toBe(429);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("an expired lock no longer blocks", async () => {
    mockState.staff[0].locked_until = new Date(Date.now() - 1000);
    expect((await login(loginReq({ email: OWNER.email, password: PASSWORD }))).status).toBe(200);
  });

  it("rate limits the 6th attempt per IP+email in the window", async () => {
    const ip = "10.9.9.9";
    for (let i = 0; i < 5; i++) {
      expect((await login(loginReq({ email: OWNER.email, password: "wrong" }, ip))).status).toBe(401);
    }
    const res = await login(loginReq({ email: OWNER.email, password: PASSWORD }, ip));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("success: Session body, resets counters, hardened cookie", async () => {
    const res = await login(loginReq({ email: "  OWNER@clinic.test ", password: PASSWORD }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      staffId: OWNER.id,
      clinicId: OWNER.clinic_id,
      role: "owner",
      name: OWNER.name,
      clinicName: OWNER.clinic_name,
    });
    expect(mockState.queries.some((q) => q.includes("SET failed_logins = 0, locked_until = NULL"))).toBe(true);
    const set = res.headers.get("set-cookie")!.toLowerCase();
    expect(set).toContain(`${SESSION_COOKIE}=`);
    expect(set).toContain("httponly");
    expect(set).toContain("samesite=lax");
    expect(set).toContain("path=/");
    expect(set).toContain(`max-age=${12 * 3600}`);
  });

  it("me returns the session; a deleted staff member is locked out immediately", async () => {
    const cookie = cookieFrom(await login(loginReq({ email: OWNER.email, password: PASSWORD })));
    const ok = await me(authedReq("/api/clinic-crm/auth/me", cookie));
    expect(ok.status).toBe(200);
    await expect(ok.json()).resolves.toMatchObject({ staffId: OWNER.id, clinicId: OWNER.clinic_id });

    mockState.staff = [];
    const gone = await me(authedReq("/api/clinic-crm/auth/me", cookie));
    expect(gone.status).toBe(401);
    await expect(gone.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("requireSession trusts the DB role, not the cookie's, and enforces roles", async () => {
    const cookie = cookieFrom(await login(loginReq({ email: OWNER.email, password: PASSWORD })));
    mockState.staff[0].role = "reception"; // demoted after sign-in
    const s = await requireSession(authedReq("/api/clinic-crm/automations", cookie), ["owner", "manager"]);
    expect(s).toBeInstanceOf(NextResponse);
    expect((s as NextResponse).status).toBe(403);
    const r = await requireSession(authedReq("/api/clinic-crm/patients", cookie));
    expect(r).toMatchObject({ role: "reception" });
  });

  it("requireSession 401s with no cookie", async () => {
    const s = await requireSession(new NextRequest("https://clinics.vantagestack.co.za/api/clinic-crm/patients"));
    expect((s as NextResponse).status).toBe(401);
  });

  it("logout returns 204 and expires the cookie, even without a session", async () => {
    const res = await logout(new NextRequest("https://clinics.vantagestack.co.za/api/clinic-crm/auth/logout", { method: "POST" }));
    expect(res.status).toBe(204);
    const set = res.headers.get("set-cookie")!.toLowerCase();
    expect(set).toContain(`${SESSION_COOKIE}=;`);
    expect(set).toMatch(/max-age=0|expires=thu, 01 jan 1970/);
  });
});
