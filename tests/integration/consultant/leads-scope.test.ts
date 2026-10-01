/**
 * Consultant Portal against a REAL Postgres: schema ensure, lead create / dedupe, tenancy
 * (own leads + unassigned pool; managers see all; legacy admin read-only), claim, stage →
 * CRM status mapping, the single Clinics deal under concurrent PATCHes.
 * Skipped unless CONSULTANT_IT_PG_URL is set (see harness.ts).
 */
import "./mocks";
import type { Sql } from "postgres";
import {
  actAs,
  applyTestEnv,
  body,
  consultantSession,
  createTestDatabase,
  ctx,
  describeDb,
  insertMember,
  jsonReq,
  legacySession,
  managerSession,
  runAs,
  type Member,
  type TestDb,
} from "./harness";
import { ensureConsultantSchema } from "@/lib/consultant/schema";
import { portalStatusValues } from "@/lib/consultant/config";
import { resetSingletonPool } from "@/lib/crm/db";
import * as leadsRoute from "@/app/api/consultant/leads/route";
import * as searchRoute from "@/app/api/consultant/leads/search/route";
import * as leadRoute from "@/app/api/consultant/leads/[id]/route";
import * as claimRoute from "@/app/api/consultant/leads/[id]/claim/route";
import * as callsRoute from "@/app/api/consultant/calls/route";
import * as notesRoute from "@/app/api/consultant/notes/route";
import type { ApiError, Lead, LeadDetail } from "@/lib/consultant/types";

applyTestEnv();

describeDb("consultant portal · leads & scope (real Postgres)", () => {
  let tdb: TestDb;
  let sql: Sql;
  let A: Member, B: Member, M: Member;

  beforeAll(async () => {
    tdb = await createTestDatabase();
    sql = tdb.sql;
    process.env.DATABASE_URL = tdb.url;
    await ensureConsultantSchema(sql, portalStatusValues());
    A = await insertMember(sql, "alice", "sales_consultant", "Alice Consultant");
    B = await insertMember(sql, "bob", "sales_consultant", "Bob Consultant");
    M = await insertMember(sql, "mandy", "agent_manager", "Mandy Manager");
  }, 60_000);

  afterAll(async () => {
    await resetSingletonPool();
    await tdb?.drop();
  });

  async function createLead(as: Member, input: Record<string, unknown>): Promise<Response> {
    actAs(consultantSession(as));
    return leadsRoute.POST(jsonReq("POST", "/api/consultant/leads", input));
  }

  test("schema ensure is idempotent and every consultant_* table has RLS on", async () => {
    // A fresh WeakSet key: run the DDL again on a second connection object, twice.
    const again = (await import("postgres")).default(tdb.url, { max: 1, onnotice: () => undefined });
    try {
      await ensureConsultantSchema(again, portalStatusValues());
      const second = (await import("postgres")).default(tdb.url, { max: 1, onnotice: () => undefined });
      await ensureConsultantSchema(second, portalStatusValues());
      await second.end();
    } finally {
      await again.end();
    }
    const rows = await sql<{ relname: string; relrowsecurity: boolean }[]>`
      select relname, relrowsecurity from pg_class
      where relnamespace = 'public'::regnamespace and relkind = 'r' and relname like 'consultant\\_%'
      order by relname
    `;
    // Every wave-1 and wave-2 consultant_* table — a new table must be added here deliberately.
    expect(rows.map((r) => r.relname)).toEqual([
      "consultant_audit_log",
      "consultant_calendar_connections",
      "consultant_call_segments",
      "consultant_calls",
      "consultant_card_events",
      "consultant_contact_consent",
      "consultant_event_deliveries",
      "consultant_events",
      "consultant_goals",
      "consultant_ingress_keys",
      "consultant_meeting_sync",
      "consultant_meetings",
      "consultant_messages",
      "consultant_note_revisions",
      "consultant_notes",
      "consultant_rewards",
      "consultant_settings",
      "consultant_training_progress",
    ]);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
    // No policies → anon/authenticated PostgREST roles can read nothing.
    const policies = await sql`select 1 from pg_policies where tablename like 'consultant\\_%'`;
    expect(policies.length).toBe(0);
  });

  test("create → CRM row tagged clinics / new / newLeadStatus / owner from session; duplicate phone → 409", async () => {
    const res = await createLead(A, { clinicName: "Glow Aesthetics", phone: "082 555 0101", city: "Cape Town", consultantId: B.id });
    expect(res.status).toBe(201);
    const lead = await body<Lead>(res);
    expect(lead).toMatchObject({ clinicName: "Glow Aesthetics", phone: "+27825550101", salesStage: "new", consultantId: A.id, email: null });

    const [row] = await sql`select vertical, sales_stage, status::text as status, consultant_id::text, assigned_to, email from public.clients where id = ${lead.id}`;
    expect(row).toMatchObject({ vertical: "clinics", sales_stage: "new", status: "lead", consultant_id: A.id, assigned_to: "alice" });
    expect(row.email).toMatch(/@internal\.vantagestack$/); // placeholder, never returned

    const activity = await sql`select details from public.crm_activity where client_id = ${lead.id} and action_type = 'consultant_lead_created'`;
    expect(activity.length).toBe(1);
    expect(JSON.stringify(activity[0].details)).not.toContain("555");

    // Same number in another format, by another consultant → 409 with a phone field.
    const dup = await createLead(B, { clinicName: "Glow Two", phone: "+27 82 555 0101" });
    expect(dup.status).toBe(409);
    const err = await body<ApiError>(dup);
    expect(err.fields?.phone).toBeTruthy();
    expect(JSON.stringify(err)).not.toContain("0101");
  });

  test("concurrent creates of the same phone produce exactly one lead", async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        runAs(consultantSession(i % 2 ? A : B), () =>
          leadsRoute.POST(jsonReq("POST", "/api/consultant/leads", { clinicName: `Race ${i}`, phone: "+27215550199" })),
        ),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409, 409]);
    const [n] = await sql`select count(*)::int as n from public.clients where phone = '+27215550199'`;
    expect(n.n).toBe(1);
  });

  test("validation errors are 400 with fields and echo no input", async () => {
    const res = await createLead(A, { clinicName: "", phone: "12", email: "not-an-email" });
    expect(res.status).toBe(400);
    const err = await body<ApiError>(res);
    expect(Object.keys(err.fields ?? {})).toEqual(expect.arrayContaining(["clinicName", "phone", "email"]));
  });

  test("scope: B cannot read / patch / call / note on A's lead; pool lead is visible and claimable once", async () => {
    const aLead = await body<Lead>(await createLead(A, { clinicName: "Alice Only", phone: "+27215550001" }));
    const [pool] = await sql<{ id: string }[]>`
      insert into public.clients (name, company, email, phone, vertical, sales_stage, status)
      values ('Pool Clinic', 'Pool Clinic', 'pool@example.test', '+27215550002', 'clinics', 'new', 'lead')
      returning id::text
    `;
    // A non-clinics CRM client must never surface in the portal, even to a manager.
    const [other] = await sql<{ id: string }[]>`
      insert into public.clients (name, email, status) values ('Generic', 'generic@example.test', 'blueprint-submitted') returning id::text`;

    actAs(consultantSession(B));
    expect((await leadRoute.GET(jsonReq("GET", "/x"), ctx(aLead.id))).status).toBe(404);
    expect((await leadRoute.PATCH(jsonReq("PATCH", "/x", { salesStage: "contacted" }), ctx(aLead.id))).status).toBe(404);
    expect((await callsRoute.POST(jsonReq("POST", "/x", { leadId: aLead.id }))).status).toBe(404);
    expect((await notesRoute.POST(jsonReq("POST", "/x", { leadId: aLead.id, body: "sneaky" }))).status).toBe(404);
    expect((await claimRoute.POST(jsonReq("POST", "/x"), ctx(aLead.id))).status).toBe(404);
    const [aRow] = await sql`select sales_stage, consultant_id::text from public.clients where id = ${aLead.id}`;
    expect(aRow).toEqual({ sales_stage: "new", consultant_id: A.id });
    const [notes] = await sql`select count(*)::int as n from public.consultant_notes where client_id = ${aLead.id}`;
    expect(notes.n).toBe(0);

    const bList = await body<Lead[]>(await leadsRoute.GET(jsonReq("GET", "/api/consultant/leads")));
    expect(bList.map((l) => l.id)).toContain(pool.id);
    expect(bList.map((l) => l.id)).not.toContain(aLead.id);
    expect(bList.map((l) => l.id)).not.toContain(other.id);
    const bPool = await body<Lead[]>(await leadsRoute.GET(jsonReq("GET", "/api/consultant/leads?scope=pool")));
    expect(bPool.every((l) => l.consultantId === null)).toBe(true);
    expect((await leadsRoute.GET(jsonReq("GET", "/api/consultant/leads?scope=bogus"))).status).toBe(400);

    // Claim race: A and B both claim the pool lead at once — exactly one wins.
    const claims = await Promise.all([
      runAs(consultantSession(A), () => claimRoute.POST(jsonReq("POST", "/x"), ctx(pool.id))),
      runAs(consultantSession(B), () => claimRoute.POST(jsonReq("POST", "/x"), ctx(pool.id))),
    ]);
    const statuses = claims.map((r) => r.status).sort();
    expect(statuses[0]).toBe(200);
    expect([404, 409]).toContain(statuses[1]);
    const [claimed] = await sql`select consultant_id::text from public.clients where id = ${pool.id}`;
    expect([A.id, B.id]).toContain(claimed.consultant_id);

    // Manager sees everything Clinics (but still not the generic CRM client).
    actAs(managerSession(M));
    const mList = await body<Lead[]>(await leadsRoute.GET(jsonReq("GET", "/api/consultant/leads")));
    expect(mList.map((l) => l.id)).toEqual(expect.arrayContaining([aLead.id, pool.id]));
    expect(mList.map((l) => l.id)).not.toContain(other.id);
    expect((await leadRoute.GET(jsonReq("GET", "/x"), ctx(other.id))).status).toBe(404);

    // Legacy admin: can read, cannot write anything.
    actAs(legacySession());
    expect((await leadRoute.GET(jsonReq("GET", "/x"), ctx(aLead.id))).status).toBe(200);
    expect((await leadRoute.PATCH(jsonReq("PATCH", "/x", { salesStage: "contacted" }), ctx(aLead.id))).status).toBe(403);
    expect((await leadsRoute.POST(jsonReq("POST", "/x", { clinicName: "Legacy", phone: "+27215550003" }))).status).toBe(403);
    expect((await callsRoute.POST(jsonReq("POST", "/x", { leadId: aLead.id }))).status).toBe(403);
    expect((await notesRoute.POST(jsonReq("POST", "/x", { leadId: aLead.id, body: "x" }))).status).toBe(403);
  });

  test("consultantId in a PATCH is managers-only; the owner never comes from the body", async () => {
    const lead = await body<Lead>(await createLead(A, { clinicName: "Reassign Me", phone: "+27215550010" }));
    actAs(consultantSession(A));
    expect((await leadRoute.PATCH(jsonReq("PATCH", "/x", { consultantId: B.id }), ctx(lead.id))).status).toBe(403);
    actAs(managerSession(M));
    const res = await leadRoute.PATCH(jsonReq("PATCH", "/x", { consultantId: B.id }), ctx(lead.id));
    expect(res.status).toBe(200);
    expect((await body<Lead>(res)).consultantId).toBe(B.id);
    actAs(consultantSession(A));
    expect((await leadRoute.GET(jsonReq("GET", "/x"), ctx(lead.id))).status).toBe(404);
  });

  test("stage → CRM status; won creates exactly one clinics deal under concurrent PATCHes", async () => {
    const lead = await body<Lead>(await createLead(A, { clinicName: "Deal Clinic", phone: "+27215550020" }));
    actAs(consultantSession(A));
    const patch = (p: Record<string, unknown>) => leadRoute.PATCH(jsonReq("PATCH", "/x", p), ctx(lead.id));

    expect((await patch({ salesStage: "contacted" })).status).toBe(200);
    let [row] = await sql`select status::text as status, sales_stage, sales_stage_changed_at from public.clients where id = ${lead.id}`;
    expect(row).toMatchObject({ status: "lead", sales_stage: "contacted" });

    expect((await patch({ salesStage: "proposal", dealValue: 4500 })).status).toBe(200);
    [row] = await sql`select status::text as status from public.clients where id = ${lead.id}`;
    expect(row.status).toBe("proposal-sent");

    const results = await Promise.all(Array.from({ length: 8 }, () => patch({ salesStage: "won" })));
    expect(results.every((r) => r.status === 200)).toBe(true);
    [row] = await sql`select status::text as status, sales_stage, activated_at from public.clients where id = ${lead.id}`;
    expect(row.status).toBe("active-client");
    expect(row.activated_at).not.toBeNull(); // the migration-005 trigger still fires

    const deals = await sql`select vertical, consultant_id::text, proposal_status, deal_value, service_type, accepted_at from public.deals where client_id = ${lead.id}`;
    expect(deals.length).toBe(1);
    expect(deals[0]).toMatchObject({ vertical: "clinics", consultant_id: A.id, proposal_status: "accepted", deal_value: 4500, service_type: "clinic-ai-booking-agent" });
    expect(deals[0].accepted_at).not.toBeNull();

    const changes = await sql`select details from public.crm_activity where client_id = ${lead.id} and action_type = 'consultant_stage_change' order by created_at`;
    // new→contacted, contacted→proposal, proposal→won once (the other 7 were no-ops).
    expect(changes.map((c) => `${c.details.from}->${c.details.to}`)).toEqual(["new->contacted", "contacted->proposal", "proposal->won"]);

    const detail = await body<LeadDetail>(await leadRoute.GET(jsonReq("GET", "/x"), ctx(lead.id)));
    expect(detail.lead).toMatchObject({ salesStage: "won", dealValue: 4500, health: "green" });
  });

  test("won directly from new (no prior deal) still yields one deal; lost clears nothing it shouldn't", async () => {
    const lead = await body<Lead>(await createLead(A, { clinicName: "Straight Win", phone: "+27215550021" }));
    actAs(consultantSession(A));
    await Promise.all(Array.from({ length: 5 }, () => leadRoute.PATCH(jsonReq("PATCH", "/x", { salesStage: "won" }), ctx(lead.id))));
    const deals = await sql`select proposal_status from public.deals where client_id = ${lead.id}`;
    expect(deals.map((d) => d.proposal_status)).toEqual(["accepted"]);

    await leadRoute.PATCH(jsonReq("PATCH", "/x", { salesStage: "lost", lostReason: "Went with a competitor" }), ctx(lead.id));
    const [d] = await sql`select proposal_status, accepted_at from public.deals where client_id = ${lead.id}`;
    expect(d).toEqual({ proposal_status: "lost", accepted_at: null });
  });

  test("list filters, search escaping and max length", async () => {
    actAs(consultantSession(A));
    // Free text never travels in a URL (POPIA): GET ?q is a 400, search is POST leads/search.
    expect((await leadsRoute.GET(jsonReq("GET", "/api/consultant/leads?q=Glow"))).status).toBe(400);
    const search = (b: unknown) => searchRoute.POST(jsonReq("POST", "/api/consultant/leads/search", b));
    const res = await search({ q: "%", scope: "all" });
    expect(res.status).toBe(200);
    expect(await body<Lead[]>(res)).toEqual([]); // '%' is escaped, not a wildcard
    const glow = await body<Lead[]>(await search({ q: "glow" }));
    expect(glow.map((l) => l.clinicName)).toContain("Glow Aesthetics");
    expect(glow.every((l) => l.consultantId === A.id)).toBe(true);
    expect((await search({ q: "x".repeat(121) })).status).toBe(400);
    const won = await body<Lead[]>(await leadsRoute.GET(jsonReq("GET", "/api/consultant/leads?stage=won&scope=mine")));
    expect(won.every((l) => l.salesStage === "won" && l.consultantId === A.id)).toBe(true);
  });

  test("unauthenticated → 401 on every portal route", async () => {
    actAs(null);
    expect((await leadsRoute.GET(jsonReq("GET", "/x"))).status).toBe(401);
    expect((await leadsRoute.POST(jsonReq("POST", "/x", {}))).status).toBe(401);
    expect((await callsRoute.POST(jsonReq("POST", "/x", {}))).status).toBe(401);
  });
});
