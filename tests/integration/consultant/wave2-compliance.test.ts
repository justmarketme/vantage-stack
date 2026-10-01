/**
 * Wave 2 · Agent 4.2 compliance checks against a REAL Postgres: calendar OAuth tokens are only
 * ever stored encrypted (full connect → callback round trip with a fake provider), the OAuth
 * state is bound to the member, and every wave-2 permission gate is enforced by the handler
 * itself (not just the UI): confirm_payments, manage_gamification, view_system_health,
 * view_team_performance.
 * Skipped unless CONSULTANT_IT_PG_URL is set (see harness.ts).
 */
import "./mocks";
import { randomBytes } from "node:crypto";
import type { Sql } from "postgres";
import {
  actAs,
  applyTestEnv,
  consultantSession,
  createTestDatabase,
  describeDb,
  insertMember,
  jsonReq,
  managerSession,
  type Member,
  type TestDb,
} from "./harness";
import { permissionsFor } from "@/lib/admin/roles";
import { decryptSecret } from "@/lib/consultant/auth/crypto";
import { portalStatusValues } from "@/lib/consultant/config";
import { ensureConsultantSchema } from "@/lib/consultant/schema";
import { resetSingletonPool } from "@/lib/crm/db";
import { setProviderClientForTests } from "@/lib/consultant/server/calendar/providers";
import type { CalendarProviderClient } from "@/lib/consultant/server/calendar/types";
import * as connectRoute from "@/app/api/consultant/calendar/[provider]/connect/route";
import * as callbackRoute from "@/app/api/consultant/calendar/[provider]/callback/route";
import * as healthRoute from "@/app/api/consultant/admin/health/route";
import * as deadLettersRoute from "@/app/api/consultant/admin/dead-letters/route";
import * as fulfilRoute from "@/app/api/consultant/rewards/[id]/fulfil/route";
import * as settingsRoute from "@/app/api/consultant/settings/gamification/route";
import * as metricsRoute from "@/app/api/consultant/metrics/route";
import * as uploadsRoute from "@/app/api/consultant/uploads/route";
import * as paymentRoute from "@/app/api/consultant/deals/[leadId]/payment/route";

applyTestEnv();
process.env.CONSULTANT_TOKEN_ENC_KEY = randomBytes(32).toString("base64");

const ACCESS = "ya29.PLAINTEXT-ACCESS-TOKEN-should-never-be-stored";
const REFRESH = "1//PLAINTEXT-REFRESH-TOKEN-should-never-be-stored";

describeDb("wave 2 · compliance (real Postgres)", () => {
  let tdb: TestDb;
  let sql: Sql;
  let A: Member, B: Member, M: Member;
  let lastState = "";

  const fake: CalendarProviderClient = {
    provider: "google",
    configured: () => true,
    authorizeUrl: (state) => {
      lastState = state;
      return `https://accounts.provider.test/o/oauth2/auth?state=${encodeURIComponent(state)}`;
    },
    exchangeCode: async () => ({ accessToken: ACCESS, refreshToken: REFRESH, expiresInSec: 3600 }),
    refresh: async () => ({ accessToken: ACCESS, refreshToken: null, expiresInSec: 3600 }),
    accountEmail: async () => "alice.calendar@provider.test",
    revoke: async () => undefined,
    createEvent: async () => "evt-1",
    updateEvent: async () => undefined,
    deleteEvent: async () => undefined,
  };

  beforeAll(async () => {
    tdb = await createTestDatabase();
    sql = tdb.sql;
    process.env.DATABASE_URL = tdb.url;
    await ensureConsultantSchema(sql, portalStatusValues());
    A = await insertMember(sql, "alicec", "sales_consultant", "Alice Compliance");
    B = await insertMember(sql, "bobc", "sales_consultant", "Bob Compliance");
    M = await insertMember(sql, "mandyc", "agent_manager", "Mandy Manager");
    setProviderClientForTests("google", fake);
  }, 60_000);

  afterAll(async () => {
    setProviderClientForTests("google", null);
    await resetSingletonPool();
    await tdb?.drop();
  });

  const pctx = (provider: string) => ({ params: Promise.resolve({ provider }) });

  /** Start the flow as `as`: the signed state goes to the provider, the nonce into an HttpOnly cookie. */
  async function connect(as: Member): Promise<{ state: string; cookie: string }> {
    actAs(consultantSession(as));
    const res = await connectRoute.GET(new Request("http://localhost/api/consultant/calendar/google/connect"), pctx("google"));
    expect(res.status).toBe(302);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/HttpOnly/i);
    return { state: lastState, cookie: setCookie.split(";")[0] };
  }
  const callback = (state: string, cookie: string, code = "auth-code-123") =>
    callbackRoute.GET(
      new Request(`http://localhost/api/consultant/calendar/google/callback?code=${code}&state=${encodeURIComponent(state)}`, { headers: { cookie } }),
      pctx("google"),
    );

  test("OAuth: tokens are stored only encrypted; state bound to the member and nonce; nothing sensitive in the audit row", async () => {
    // Bob can't complete Alice's flow (state bound to member), and a missing nonce cookie fails.
    const a = await connect(A);
    actAs(consultantSession(B));
    expect((await callback(a.state, a.cookie)).headers.get("location")).toMatch(/status=error/);
    actAs(consultantSession(A));
    const wrongNonce = a.cookie.replace(/=.*/, "=wrong-nonce");
    expect((await callback(a.state, wrongNonce)).headers.get("location")).toMatch(/status=error/);
    expect((await sql`select 1 from public.consultant_calendar_connections`).length).toBe(0);

    const ok = await connect(A);
    const done = await callback(ok.state, ok.cookie);
    expect(done.headers.get("location")).toMatch(/status=connected/);
    expect(done.headers.get("location")).not.toMatch(/code=|state=/);

    const rows = await sql<Record<string, unknown>[]>`select * from public.consultant_calendar_connections where consultant_id = ${A.id}::uuid`;
    expect(rows.length).toBe(1);
    const dump = JSON.stringify(rows[0]);
    expect(dump).not.toContain(ACCESS);
    expect(dump).not.toContain(REFRESH);
    expect(dump).not.toContain("auth-code-123");
    expect(decryptSecret(rows[0].refresh_token_enc as string)).toBe(REFRESH);
    expect(decryptSecret(rows[0].access_token_enc as string)).toBe(ACCESS);
    // Nothing else in the database holds the plaintext either.
    const anywhere = await sql`select 1 from public.consultant_audit_log where meta::text like ${"%PLAINTEXT%"} or entity_id like ${"%PLAINTEXT%"}`;
    expect(anywhere.length).toBe(0);
    const logged = JSON.stringify([(console.warn as jest.Mock).mock?.calls ?? [], (console.error as jest.Mock).mock?.calls ?? []]);
    expect(logged).not.toMatch(/PLAINTEXT|auth-code-123/);
  });

  test("permission gates are enforced by the handlers (403), not only hidden in the UI", async () => {
    const consultant = consultantSession(A);
    const manager = managerSession(M); // agent_manager: confirm_payments + view_team_performance
    const systemsOps = { ...managerSession(M), role: "systems_ops" as const, canCall: false, permissions: permissionsFor("systems_ops") };
    const acquisition = { ...managerSession(M), role: "acquisition_creative" as const, canCall: false, permissions: permissionsFor("acquisition_creative") };
    const someId = "00000000-0000-4000-8000-000000000001";
    const settings = await (async () => {
      actAs(consultant);
      return (await settingsRoute.GET()).json();
    })();

    const cases: { name: string; run: () => Promise<Response>; allow: unknown[]; deny: unknown[] }[] = [
      { name: "admin/health", run: () => healthRoute.GET(), allow: [systemsOps], deny: [consultant, manager, acquisition] },
      { name: "admin/dead-letters", run: () => deadLettersRoute.GET(), allow: [systemsOps], deny: [consultant, manager, acquisition] },
      { name: "settings PUT", run: () => settingsRoute.PUT(jsonReq("PUT", "/s", settings)), allow: [acquisition], deny: [consultant, manager, systemsOps] },
      { name: "reward fulfil", run: () => fulfilRoute.POST(jsonReq("POST", "/x"), { params: Promise.resolve({ id: someId }) }), allow: [acquisition], deny: [consultant, manager, systemsOps] },
      {
        name: "payment confirm",
        run: () => paymentRoute.POST(jsonReq("POST", "/p", { amount: 1000, reference: "X-1", paidAt: new Date().toISOString() }), { params: Promise.resolve({ leadId: someId }) }),
        allow: [manager],
        deny: [consultant, systemsOps, acquisition],
      },
      {
        name: "proof upload ticket",
        run: () => uploadsRoute.POST(jsonReq("POST", "/u", { purpose: "payment_proof", contentType: "application/pdf", bytes: 1000 })),
        allow: [],
        deny: [consultant, systemsOps, acquisition],
      },
      { name: "team metrics", run: () => metricsRoute.GET(jsonReq("GET", "/api/consultant/metrics?consultantId=team")), allow: [manager, acquisition], deny: [consultant] },
      { name: "another consultant's metrics", run: () => metricsRoute.GET(jsonReq("GET", `/api/consultant/metrics?consultantId=${B.id}`)), allow: [manager, acquisition], deny: [consultant] },
    ];
    for (const c of cases) {
      for (const s of c.deny) {
        actAs(s as never);
        expect([c.name, (await c.run()).status]).toEqual([c.name, 403]);
      }
      for (const s of c.allow) {
        actAs(s as never);
        expect([c.name, (await c.run()).status]).not.toEqual([c.name, 403]);
      }
    }
  });
});
