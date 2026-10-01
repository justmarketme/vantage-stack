/**
 * Wave 2 · Agent 3B against a REAL Postgres: meetings + stage automation in one transaction,
 * calendar sync (fake provider — never the network) with failure → backoff → retry, calendar
 * auth failure → "reconnect", scoped access, Why Board goals, training unlock, public-domain
 * lead import (dedupe + tag-in-place), lead search, and the staging seed's idempotency.
 * Skipped unless CONSULTANT_IT_PG_URL is set (see harness.ts).
 */
import "./mocks";
import { randomBytes, randomUUID } from "node:crypto";
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
  managerSession,
  type Member,
  type TestDb,
} from "./harness";
import { ensureConsultantSchema } from "@/lib/consultant/schema";
import { portalStatusValues } from "@/lib/consultant/config";
import { resetSingletonPool } from "@/lib/crm/db";
import { listConnections, saveConnection } from "@/lib/consultant/server/calendar/connections";
import { setProviderClientForTests } from "@/lib/consultant/server/calendar/providers";
import { retryCalendarSync } from "@/lib/consultant/server/calendar/retry";
import { CalendarProviderError, type CalendarEventSpec, type CalendarProviderClient } from "@/lib/consultant/server/calendar/types";
import * as meetingsRoute from "@/app/api/consultant/meetings/route";
import * as meetingRoute from "@/app/api/consultant/meetings/[id]/route";
import * as goalsRoute from "@/app/api/consultant/goals/route";
import * as goalRoute from "@/app/api/consultant/goals/[id]/route";
import * as trainingRoute from "@/app/api/consultant/training/route";
import * as trainingCompleteRoute from "@/app/api/consultant/training/[moduleId]/complete/route";
import * as leadsRoute from "@/app/api/consultant/leads/route";
import * as searchRoute from "@/app/api/consultant/leads/search/route";
import * as importRoute from "@/app/api/consultant/leads/import/route";
import { applySeed, buildSeedPlan, seedGuard, planCounts } from "@/scripts/consultant-seed-staging";
import type { ApiError, Goal, Lead, Meeting, ScrapedImportResult, TrainingModule } from "@/lib/consultant/types";

applyTestEnv();
process.env.CONSULTANT_TOKEN_ENC_KEY = randomBytes(32).toString("base64");

type Recorded = { op: "create" | "update" | "delete"; eventId?: string; spec?: CalendarEventSpec };

function fakeProvider(provider: "google" | "microsoft") {
  const calls: Recorded[] = [];
  let failNext: CalendarProviderError | null = null;
  let n = 0;
  const maybeFail = () => {
    if (failNext) {
      const e = failNext;
      failNext = null;
      throw e;
    }
  };
  const client: CalendarProviderClient = {
    provider,
    configured: () => true,
    authorizeUrl: () => "https://provider.test/auth",
    exchangeCode: async () => ({ accessToken: "a", refreshToken: "r", expiresInSec: 3600 }),
    refresh: async () => ({ accessToken: "a2", refreshToken: null, expiresInSec: 3600 }),
    accountEmail: async () => "consultant@provider.test",
    revoke: async () => undefined,
    createEvent: async (_t, _c, spec) => {
      maybeFail();
      calls.push({ op: "create", spec });
      return `evt-${++n}`;
    },
    updateEvent: async (_t, _c, eventId, spec) => {
      maybeFail();
      calls.push({ op: "update", eventId, spec });
    },
    deleteEvent: async (_t, _c, eventId) => {
      maybeFail();
      calls.push({ op: "delete", eventId });
    },
  };
  return { client, calls, failWith: (e: CalendarProviderError) => (failNext = e) };
}

describeDb("consultant portal · scheduling, storage & data (3B, real Postgres)", () => {
  let tdb: TestDb;
  let sql: Sql;
  let A: Member, B: Member, M: Member;
  const google = fakeProvider("google");

  beforeAll(async () => {
    tdb = await createTestDatabase();
    sql = tdb.sql;
    process.env.DATABASE_URL = tdb.url;
    await ensureConsultantSchema(sql, portalStatusValues());
    A = await insertMember(sql, "alice3b", "sales_consultant", "Alice Consultant");
    B = await insertMember(sql, "bob3b", "sales_consultant", "Bob Consultant");
    M = await insertMember(sql, "mandy3b", "agent_manager", "Mandy Manager");
    setProviderClientForTests("google", google.client);
    // Alice has Google connected (tokens stored encrypted); Microsoft is not connected.
    await saveConnection(sql, A.id, "google", { accessToken: "a", refreshToken: "r", expiresInSec: 3600 }, "alice@provider.test");
  }, 60_000);

  afterAll(async () => {
    setProviderClientForTests("google", null);
    await resetSingletonPool();
    await tdb?.drop();
  });

  let phoneN = 0;
  async function lead(owner: Member | null, stage = "new", email: string | null = null): Promise<string> {
    phoneN++;
    const rows = await sql<{ id: string }[]>`
      insert into public.clients (name, company, email, phone, vertical, sales_stage, sales_stage_changed_at, status, consultant_id, assigned_to)
      values ('Clinic', ${`Clinic ${phoneN}`}, ${email ?? `clinic+${randomUUID()}@internal.vantagestack`}, ${`+2721555${String(9000 + phoneN)}`},
        'clinics', ${stage}, now(), 'lead', ${owner?.id ?? null}::uuid, ${owner?.username ?? null})
      returning id::text`;
    return rows[0].id;
  }
  const future = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
  const stageOf = async (id: string) => (await sql<{ s: string; c: string | null }[]>`select sales_stage as s, consultant_id::text as c from public.clients where id = ${id}::uuid`)[0];

  async function book(as: Member, input: Record<string, unknown>): Promise<Response> {
    actAs(consultantSession(as));
    return meetingsRoute.POST(jsonReq("POST", "/api/consultant/meetings", input));
  }

  test("booking a discovery moves new → discovery_booked, emits events and syncs the calendar in SAST", async () => {
    const leadId = await lead(A, "new", "owner@clinic.example");
    const res = await book(A, { leadId, kind: "discovery", startsAt: future(48), durationMin: 45 });
    expect(res.status).toBe(201);
    const m = await body<Meeting>(res);
    expect(m.status).toBe("scheduled");
    expect(new Date(m.endsAt).getTime() - new Date(m.startsAt).getTime()).toBe(45 * 60_000);
    expect(m.sync).toEqual({ google: "synced", microsoft: "not_connected" });
    expect((await stageOf(leadId)).s).toBe("discovery_booked");

    const created = google.calls.filter((c) => c.op === "create").pop()!;
    expect(created.spec!.title).toBe(`Discovery call · Clinic ${phoneN}`);
    expect(created.spec!.attendee).toEqual({ email: "owner@clinic.example", name: null });

    const events = await sql<{ type: string }[]>`select type from public.consultant_events where client_id = ${leadId}::uuid order by occurred_at`;
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(["meeting.scheduled", "lead.stage_changed"]));
    const sync = await sql`select status, external_event_id from public.consultant_meeting_sync where meeting_id = ${m.id}::uuid`;
    expect(sync).toEqual([{ status: "synced", external_event_id: expect.stringMatching(/^evt-/) }]);
  });

  test("a start time in the past is rejected and nothing is written", async () => {
    const leadId = await lead(A);
    const res = await book(A, { leadId, kind: "discovery", startsAt: new Date(Date.now() - 60_000).toISOString() });
    expect(res.status).toBe(400);
    expect((await body<ApiError>(res)).fields?.startsAt).toMatch(/future/);
    expect((await stageOf(leadId)).s).toBe("new");
    expect((await sql`select 1 from public.consultant_meetings where client_id = ${leadId}::uuid`).length).toBe(0);
  });

  test("booking on a pool lead claims it; a demo on a proposal lead leaves the stage", async () => {
    const pool = await lead(null);
    expect((await book(B, { leadId: pool, kind: "demo", startsAt: future(24) })).status).toBe(201);
    expect(await stageOf(pool)).toEqual({ s: "discovery_booked", c: B.id });

    const later = await lead(A, "proposal");
    expect((await book(A, { leadId: later, kind: "demo", startsAt: future(30) })).status).toBe(201);
    expect((await stageOf(later)).s).toBe("proposal");
  });

  test("scope: another consultant can't see or change the meeting; a manager can", async () => {
    const leadId = await lead(A);
    const m = await body<Meeting>(await book(A, { leadId, kind: "discovery", startsAt: future(72) }));
    actAs(consultantSession(B));
    expect((await meetingRoute.GET(jsonReq("GET", `/api/consultant/meetings/${m.id}`), ctx(m.id))).status).toBe(404);
    expect((await meetingRoute.PATCH(jsonReq("PATCH", "/x", { notes: "hi" }), ctx(m.id))).status).toBe(404);
    const listB = await body<Meeting[]>(await meetingsRoute.GET(jsonReq("GET", "/api/consultant/meetings")));
    expect(listB.some((x) => x.id === m.id)).toBe(false);
    actAs(managerSession(M));
    expect((await meetingRoute.PATCH(jsonReq("PATCH", "/x", { notes: "Manager note" }), ctx(m.id))).status).toBe(200);
  });

  test("no_show → lead no_show (only after the start); held demo → demo_done; cancel deletes the event and is final", async () => {
    const leadId = await lead(A);
    const disc = await body<Meeting>(await book(A, { leadId, kind: "discovery", startsAt: future(5) }));
    actAs(consultantSession(A));
    const early = await meetingRoute.PATCH(jsonReq("PATCH", "/x", { status: "no_show" }), ctx(disc.id));
    expect(early.status).toBe(400);

    await sql`update public.consultant_meetings set starts_at = now() - interval '1 hour', ends_at = now() - interval '30 minutes' where id = ${disc.id}::uuid`;
    expect((await meetingRoute.PATCH(jsonReq("PATCH", "/x", { status: "no_show" }), ctx(disc.id))).status).toBe(200);
    expect((await stageOf(leadId)).s).toBe("no_show");

    // Re-book from no_show → discovery_booked; then a demo held → demo_done.
    const demo = await body<Meeting>(await book(A, { leadId, kind: "demo", startsAt: future(6) }));
    expect((await stageOf(leadId)).s).toBe("discovery_booked");
    await sql`update public.consultant_meetings set starts_at = now() - interval '2 hours', ends_at = now() - interval '1 hour' where id = ${demo.id}::uuid`;
    actAs(consultantSession(A));
    expect((await meetingRoute.PATCH(jsonReq("PATCH", "/x", { status: "held" }), ctx(demo.id))).status).toBe(200);
    expect((await stageOf(leadId)).s).toBe("demo_done");

    const later = await body<Meeting>(await book(A, { leadId, kind: "follow_up", startsAt: future(50) }));
    const syncRow = (await sql<{ e: string }[]>`select external_event_id as e from public.consultant_meeting_sync where meeting_id = ${later.id}::uuid`)[0];
    actAs(consultantSession(A));
    const cancelled = await body<Meeting>(await meetingRoute.PATCH(jsonReq("PATCH", "/x", { status: "cancelled" }), ctx(later.id)));
    expect(cancelled.status).toBe("cancelled");
    expect(google.calls.filter((c) => c.op === "delete").map((c) => c.eventId)).toContain(syncRow.e);
    expect((await stageOf(leadId)).s).toBe("demo_done");
    expect((await meetingRoute.PATCH(jsonReq("PATCH", "/x", { status: "scheduled" }), ctx(later.id))).status).toBe(409);
    const types = await sql<{ type: string }[]>`select type from public.consultant_events where client_id = ${leadId}::uuid`;
    expect(types.map((t) => t.type)).toEqual(expect.arrayContaining(["meeting.no_show", "meeting.held", "meeting.cancelled"]));
  });

  test("a provider outage is recorded generically, backs off, and the retry cron syncs it", async () => {
    const leadId = await lead(A);
    google.failWith(new CalendarProviderError("transient", 503));
    const m = await body<Meeting>(await book(A, { leadId, kind: "discovery", startsAt: future(80) }));
    expect(m.sync.google).toBe("failed");
    const row = (await sql<{ attempts: number; last_error: string }[]>`select attempts, last_error from public.consultant_meeting_sync where meeting_id = ${m.id}::uuid`)[0];
    expect(row.attempts).toBe(1);
    expect(row.last_error).toBe("Calendar sync failed. It will retry automatically.");

    // Not due yet (backoff) → nothing attempted for this row.
    const early = await retryCalendarSync(sql, 50);
    expect(early.attempted).toBe(0);
    await sql`update public.consultant_meeting_sync set updated_at = now() - interval '2 hours' where meeting_id = ${m.id}::uuid`;
    const r = await retryCalendarSync(sql, 50);
    expect(r).toMatchObject({ attempted: 1, synced: 1, failed: 0 });
    const after = (await sql<{ status: string }[]>`select status from public.consultant_meeting_sync where meeting_id = ${m.id}::uuid`)[0];
    expect(after.status).toBe("synced");
  });

  test("a pending row left by a crash is picked up; gives up after maxSyncAttempts", async () => {
    const leadId = await lead(A);
    const m = await body<Meeting>(await book(A, { leadId, kind: "discovery", startsAt: future(90) }));
    await sql`update public.consultant_meeting_sync set status = 'pending', updated_at = now() - interval '5 minutes' where meeting_id = ${m.id}::uuid`;
    expect((await retryCalendarSync(sql, 50)).synced).toBe(1);

    await sql`update public.consultant_meeting_sync set status = 'failed', attempts = 5, updated_at = now() - interval '1 day' where meeting_id = ${m.id}::uuid`;
    expect((await retryCalendarSync(sql, 50)).attempted).toBe(0);
  });

  test("revoked calendar access flags the connection as 'reconnect' (generic)", async () => {
    const leadId = await lead(A);
    google.failWith(new CalendarProviderError("auth", 401));
    const m = await body<Meeting>(await book(A, { leadId, kind: "demo", startsAt: future(100) }));
    expect(m.sync.google).toBe("failed");
    const conns = await listConnections(sql, A.id);
    expect(conns.find((c) => c.provider === "google")).toMatchObject({ status: "error", lastError: expect.stringMatching(/Reconnect/) });
    expect(conns.find((c) => c.provider === "microsoft")?.status).toBe("not_connected");
    // Restore for the rest of the suite.
    await saveConnection(sql, A.id, "google", { accessToken: "a", refreshToken: "r", expiresInSec: 3600 }, "alice@provider.test");
  });

  test("Why Board: owner CRUD, foreign image paths rejected, managers read, consultants can't read others", async () => {
    actAs(consultantSession(A));
    const target = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
    const bad = await goalsRoute.POST(
      jsonReq("POST", "/api/consultant/goals", { title: "Car", targetDate: target, metric: "revenue", targetValue: 100000, imagePath: `goal_image/${B.id}/${randomUUID()}.jpg` }),
    );
    expect(bad.status).toBe(400);
    const res = await goalsRoute.POST(
      jsonReq("POST", "/api/consultant/goals", { title: "Car", why: "Freedom", targetDate: target, metric: "revenue", targetValue: 100000, imagePath: `goal_image/${A.id}/${randomUUID()}.jpg` }),
    );
    expect(res.status).toBe(201);
    const g = await body<Goal>(res);
    expect(g).toMatchObject({ consultantId: A.id, currentValue: 0, progress: 0, imageUrl: null });
    expect(g.dailyPlan?.dealsNeeded).toBeGreaterThan(0);

    actAs(consultantSession(B));
    expect((await goalsRoute.GET(jsonReq("GET", `/api/consultant/goals?consultantId=${A.id}`))).status).toBe(403);
    expect((await goalRoute.PATCH(jsonReq("PATCH", "/x", { title: "Mine now" }), ctx(g.id))).status).toBe(404);
    actAs(managerSession(M));
    expect((await body<Goal[]>(await goalsRoute.GET(jsonReq("GET", `/api/consultant/goals?consultantId=${A.id}`)))).map((x) => x.id)).toContain(g.id);
    expect((await goalRoute.PATCH(jsonReq("PATCH", "/x", { title: "Manager edit" }), ctx(g.id))).status).toBe(403);
    actAs(consultantSession(A));
    expect((await goalRoute.DELETE(jsonReq("DELETE", "/x"), ctx(g.id))).status).toBe(204);
  });

  test("training: sequential unlock enforced server-side; completion idempotent", async () => {
    actAs(consultantSession(A));
    const list = await body<TrainingModule[]>(await trainingRoute.GET());
    expect(list[0].locked).toBe(false);
    expect(list[1].locked).toBe(true);
    const locked = await trainingCompleteRoute.POST(jsonReq("POST", "/x"), { params: Promise.resolve({ moduleId: list[1].id }) });
    expect(locked.status).toBe(409);
    const first = await body<TrainingModule[]>(await trainingCompleteRoute.POST(jsonReq("POST", "/x"), { params: Promise.resolve({ moduleId: list[0].id }) }));
    expect(first[1].locked).toBe(false);
    const again = await body<TrainingModule[]>(await trainingCompleteRoute.POST(jsonReq("POST", "/x"), { params: Promise.resolve({ moduleId: list[0].id }) }));
    expect(again[0].completedAt).toBe(first[0].completedAt);
    expect((await trainingCompleteRoute.POST(jsonReq("POST", "/x"), { params: Promise.resolve({ moduleId: "nope" }) })).status).toBe(404);
  });

  test("lead import: managers only; +27 only; dedupe on phone/place id; untagged CRM row tagged in place", async () => {
    await sql.unsafe(`alter table public.clients add column if not exists place_id text; alter table public.clients add column if not exists source text;`);
    await sql`insert into public.clients (name, email, place_id, status) values ('Scraped Clinic', ${`scrape+${randomUUID()}@internal.vantagestack`}, 'place-untagged', 'manually-added')`;
    const existingPhone = `+2721555${String(9000 + phoneN)}`; // the last lead() above
    const batch = {
      provider: "google_places",
      leads: [
        { businessName: "New Clinic", phone: "021 555 8801", email: null, website: "newclinic.example", address: null, placeId: "place-new", ownerName: null, sourceUrl: "https://maps.example/1" },
        { businessName: "Dup by phone", phone: existingPhone, email: null, website: null, address: null, placeId: null, ownerName: null, sourceUrl: null },
        { businessName: "Scraped Clinic", phone: "021 555 8802", email: null, website: null, address: null, placeId: "place-untagged", ownerName: null, sourceUrl: null },
        { businessName: "UK clinic", phone: "+44 20 7946 0958", email: null, website: null, address: null, placeId: null, ownerName: null, sourceUrl: null },
      ],
    };
    actAs(consultantSession(A));
    expect((await importRoute.POST(jsonReq("POST", "/api/consultant/leads/import", batch))).status).toBe(403);
    actAs(managerSession(M));
    const r = await body<ScrapedImportResult>(await importRoute.POST(jsonReq("POST", "/api/consultant/leads/import", batch)));
    expect(r).toEqual({ imported: 2, duplicates: 1, rejectedNonZaPhone: 1 });

    const rows = await sql<{ name: string; vertical: string; lead_source: string; source: string; consultant_id: string | null; sales_stage: string; phone: string }[]>`
      select name, vertical, lead_source, source, consultant_id::text, sales_stage, phone from public.clients where place_id in ('place-new', 'place-untagged') order by name`;
    expect(rows).toEqual([
      { name: "New Clinic", vertical: "clinics", lead_source: "public_scrape", source: "google_places", consultant_id: null, sales_stage: "new", phone: "+27215558801" },
      { name: "Scraped Clinic", vertical: "clinics", lead_source: "public_scrape", source: "google_places", consultant_id: null, sales_stage: "new", phone: "+27215558802" },
    ]);
    expect((await sql`select 1 from public.clients where place_id = 'place-untagged'`).length).toBe(1);
    // Re-importing the same batch creates nothing new.
    const again = await body<ScrapedImportResult>(await importRoute.POST(jsonReq("POST", "/api/consultant/leads/import", batch)));
    expect(again).toEqual({ imported: 0, duplicates: 3, rejectedNonZaPhone: 1 });
    // No consent rows for scraped leads.
    expect((await sql`select 1 from public.consultant_contact_consent c join public.clients k on k.id = c.client_id where k.place_id = 'place-new'`).length).toBe(0);
  });

  test("lead search is POST-only for text; GET ?q is a 400", async () => {
    actAs(consultantSession(A));
    expect((await leadsRoute.GET(jsonReq("GET", "/api/consultant/leads?q=Clinic"))).status).toBe(400);
    const found = await body<Lead[]>(await searchRoute.POST(jsonReq("POST", "/api/consultant/leads/search", { q: "Clinic 1", scope: "mine" })));
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((l) => l.consultantId === A.id)).toBe(true);
  });

  test("staging seed: guard refuses unsafe targets; applying twice is idempotent", async () => {
    expect(seedGuard({ nodeEnv: "production", marker: "abc", effectiveUrl: "postgres://abc", databaseUrl: undefined }).ok).toBe(false);
    expect(seedGuard({ nodeEnv: "development", marker: "", effectiveUrl: "postgres://abc", databaseUrl: undefined }).ok).toBe(false);
    expect(seedGuard({ nodeEnv: "development", marker: "stagingref", effectiveUrl: "postgres://prodref", databaseUrl: undefined }).ok).toBe(false);
    expect(seedGuard({ nodeEnv: "development", marker: "stagingref", effectiveUrl: "postgres://stagingref", databaseUrl: "postgres://prod" }).ok).toBe(false);
    expect(seedGuard({ nodeEnv: "development", marker: "stagingref", effectiveUrl: "postgres://stagingref", databaseUrl: undefined }).ok).toBe(true);

    const count = async () =>
      (await sql<{ n: string }[]>`
        select (select count(*) from public.clients where id::text like '5eed%')
          + (select count(*) from public.consultant_calls where id::text like '5eed%')
          + (select count(*) from public.consultant_meetings where id::text like '5eed%')
          + (select count(*) from public.consultant_notes where id::text like '5eed%')
          + (select count(*) from public.consultant_note_revisions r where r.note_id::text like '5eed%')
          + (select count(*) from public.consultant_call_segments s where s.call_id::text like '5eed%')
          + (select count(*) from public.deals where id::text like '5eed%')
          + (select count(*) from public.consultant_messages where id::text like '5eed%') as n`)[0].n;
    const plan = buildSeedPlan(new Date());
    const c1 = await applySeed(sql, plan);
    const n1 = await count();
    const events1 = (await sql`select 1 from public.consultant_events`).length;
    const c2 = await applySeed(sql, buildSeedPlan(new Date(Date.now() + 60_000)));
    expect(c2).toEqual(c1);
    expect(await count()).toBe(n1);
    // A re-run changes no stages/ids, so the triggers emit nothing new.
    expect((await sql`select 1 from public.consultant_events`).length).toBe(events1);

    const counts = planCounts(plan);
    expect(counts.clinics).toBeGreaterThanOrEqual(16);
    const stages = await sql<{ s: string }[]>`select distinct sales_stage as s from public.clients where id::text like '5eed%'`;
    expect(stages.map((x) => x.s).sort()).toEqual(["contacted", "demo_done", "discovery_booked", "lost", "new", "no_show", "paid", "proposal", "won"]);
    const paid = await sql<{ amount: number; commission: number }[]>`
      select payment_amount as amount, commission_amount as commission from public.deals where id::text like '5eed%' and paid_at is not null`;
    for (const p of paid) expect(p.commission).toBe(Math.round(p.amount * 0.25));
    const dead = await sql`select 1 from public.consultant_messages where id::text like '5eed%' and status = 'dead'`;
    expect(dead.length).toBe(1);
    const upcoming = await sql`select 1 from public.consultant_meetings where id::text like '5eed%' and starts_at between now() and now() + interval '15 days'`;
    expect(upcoming.length).toBeGreaterThan(0);
    // Seeded leads show up through the real API for their consultant.
    const thando = plan.members.find((m) => m.key === "thando")!;
    actAs(consultantSession({ id: thando.id, username: thando.username, displayName: thando.fullName }));
    const mine = await body<Lead[]>(await leadsRoute.GET(jsonReq("GET", "/api/consultant/leads?scope=mine")));
    expect(mine.some((l) => l.clinicName === "Lumière Aesthetics & Skin Clinic" && l.salesStage === "discovery_booked")).toBe(true);
    const meetings = await body<Meeting[]>(await meetingsRoute.GET(jsonReq("GET", "/api/consultant/meetings")));
    expect(meetings.some((m) => m.clinicName === "Lumière Aesthetics & Skin Clinic")).toBe(true);
  });
});
