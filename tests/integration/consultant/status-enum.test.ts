/**
 * Production's `public.clients.status` may be a Postgres ENUM rather than text. The portal
 * must add the values it writes (ensureStatusValues) and every write path — create, stage
 * change → CRM status, landing-page feed, the migration-005 triggers — must work on it.
 * Skipped unless CONSULTANT_IT_PG_URL is set (see harness.ts).
 */
import "./mocks";
import type { Sql } from "postgres";
import { actAs, applyTestEnv, body, consultantSession, createTestDatabase, ctx, describeDb, insertMember, jsonReq, type Member, type TestDb } from "./harness";
import { ensureConsultantSchema } from "@/lib/consultant/schema";
import { portalStatusValues } from "@/lib/consultant/config";
import { resetSingletonPool } from "@/lib/crm/db";
import { upsertClinicLeadFromEnquiry } from "@/lib/consultant/server/clinicLeads";
import * as leadsRoute from "@/app/api/consultant/leads/route";
import * as leadRoute from "@/app/api/consultant/leads/[id]/route";
import type { Lead } from "@/lib/consultant/types";

applyTestEnv();

describeDb("consultant portal · clients.status as a Postgres enum (real Postgres)", () => {
  let tdb: TestDb;
  let sql: Sql;
  let A: Member;

  beforeAll(async () => {
    tdb = await createTestDatabase({ statusEnum: true });
    sql = tdb.sql;
    process.env.DATABASE_URL = tdb.url;
  }, 60_000);

  afterAll(async () => {
    await resetSingletonPool();
    await tdb?.drop();
  });

  test("ensure adds the portal's status values to the enum, idempotently", async () => {
    const before = await sql`select unnest(enum_range(null::public.client_status))::text as v`;
    expect(before.map((r) => r.v)).not.toContain("lead");
    await ensureConsultantSchema(sql, portalStatusValues());
    const postgres = (await import("postgres")).default;
    const second = postgres(tdb.url, { max: 1, onnotice: () => undefined });
    await ensureConsultantSchema(second, portalStatusValues());
    await second.end();
    const after = (await sql`select unnest(enum_range(null::public.client_status))::text as v`).map((r) => r.v);
    for (const v of portalStatusValues()) expect(after.filter((x) => x === v).length).toBe(1);
    const [col] = await sql`select data_type from information_schema.columns where table_name = 'clients' and column_name = 'status'`;
    expect(col.data_type).toBe("USER-DEFINED");
    A = await insertMember(sql, "alice", "sales_consultant", "Alice Consultant");
  });

  test("create → proposal → won writes enum statuses and one deal; triggers still fire", async () => {
    actAs(consultantSession(A));
    const res = await leadsRoute.POST(jsonReq("POST", "/x", { clinicName: "Enum Clinic", phone: "+27215551234" }));
    expect(res.status).toBe(201);
    const lead = await body<Lead>(res);
    let [row] = await sql`select status::text as status from public.clients where id = ${lead.id}`;
    expect(row.status).toBe("lead");

    expect((await leadRoute.PATCH(jsonReq("PATCH", "/x", { salesStage: "proposal", dealValue: 3000 }), ctx(lead.id))).status).toBe(200);
    [row] = await sql`select status::text as status from public.clients where id = ${lead.id}`;
    expect(row.status).toBe("proposal-sent");
    expect((await leadRoute.PATCH(jsonReq("PATCH", "/x", { salesStage: "won" }), ctx(lead.id))).status).toBe(200);
    [row] = await sql`select status::text as status, activated_at from public.clients where id = ${lead.id}`;
    expect(row.status).toBe("active-client");
    expect(row.activated_at).not.toBeNull();
    const deals = await sql`select proposal_status from public.deals where client_id = ${lead.id}`;
    expect(deals.map((d) => d.proposal_status)).toEqual(["accepted"]);
  });

  test("landing-page feed inserts with an enum status", async () => {
    const r = await upsertClinicLeadFromEnquiry(sql, {
      practiceName: "Enum Landing",
      contactName: "Dr E",
      role: "",
      email: "enum@landing.example",
      whatsapp: "+27 82 000 1111",
      websiteUrl: "",
      source: "clinics_landing",
      blueprintId: 1,
    });
    expect(r.outcome).toBe("created");
    const [row] = await sql`select status::text as status, consultant_id from public.clients where email = 'enum@landing.example'`;
    expect(row).toEqual({ status: "lead", consultant_id: null });
  });
});
