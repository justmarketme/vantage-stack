/**
 * Notes (idempotent create, optimistic concurrency, full revision history), Coach Alex
 * summariser (Anthropic SDK mocked: exclusive claim, skip rules, refusal, human edits never
 * overwritten), the consultant-sweep cron (retention, stale calls), TodayStats boundaries in
 * Africa/Johannesburg, and the clinic landing-page → pool lead feed. Real Postgres.
 * Skipped unless CONSULTANT_IT_PG_URL is set (see harness.ts).
 */
import { anthropic } from "./mocks";
import type { Sql } from "postgres";
import {
  actAs,
  afterTasks,
  applyTestEnv,
  body,
  consultantSession,
  createTestDatabase,
  ctx,
  describeDb,
  drainAfter,
  insertMember,
  jsonReq,
  managerSession,
  recordingSid as newRecordingSid,
  runAs,
  type Member,
  type TestDb,
} from "./harness";
import { ensureConsultantSchema } from "@/lib/consultant/schema";
import { portalStatusValues } from "@/lib/consultant/config";
import { resetSingletonPool } from "@/lib/crm/db";
import { summariseCall } from "@/lib/consultant/server/summarise";
import { MESSAGES } from "@/lib/consultant/server/constants";
import { runConsultantSweep } from "@/lib/consultant/server/sweep";
import { todayStats } from "@/lib/consultant/server/repo/stats";
import { insertClinicBlueprint } from "@/lib/clinics/store";
import { ClinicBlueprintSchema } from "@/lib/clinics/schema";
import { resetRateLimits } from "@/lib/consultant/auth/rateLimit";
import * as leadsRoute from "@/app/api/consultant/leads/route";
import * as searchRoute from "@/app/api/consultant/leads/search/route";
import * as notesRoute from "@/app/api/consultant/notes/route";
import * as noteRoute from "@/app/api/consultant/notes/[id]/route";
import * as revisionsRoute from "@/app/api/consultant/notes/[id]/revisions/route";
import * as summariseRoute from "@/app/api/consultant/calls/[id]/summarise/route";
import * as statsRoute from "@/app/api/consultant/stats/today/route";
import * as sweepRoute from "@/app/api/cron/consultant-sweep/route";
import type { ApiError, Lead, Note, NoteRevision, TodayStats } from "@/lib/consultant/types";
import { SAMPLE_SUMMARY } from "../../unit/consultant/server/fixtures";

applyTestEnv();

describeDb("consultant portal · notes, Coach Alex, sweep, stats, landing feed (real Postgres)", () => {
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

  beforeEach(() => {
    afterTasks.tasks.length = 0;
    anthropic.calls.length = 0;
    resetRateLimits();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  let phoneSeq = 300;
  async function newLead(owner: Member): Promise<Lead> {
    actAs(consultantSession(owner));
    const res = await leadsRoute.POST(jsonReq("POST", "/x", { clinicName: `Clinic ${phoneSeq}`, phone: `+2721777${String(phoneSeq++).padStart(4, "0")}` }));
    expect(res.status).toBe(201);
    return body<Lead>(res);
  }

  /** An ended, answered call with a transcript, inserted directly (the webhook path is covered elsewhere). */
  async function endedCall(owner: Member, leadId: string, opts: { talkSec?: number; segments?: number; answered?: boolean } = {}) {
    const talk = opts.talkSec ?? 95;
    const [c] = await sql<{ id: string }[]>`
      insert into public.consultant_calls (client_id, consultant_id, to_number, status, started_at, answered_at, ended_at, duration_sec, twilio_call_sid)
      values (${leadId}, ${owner.id}, '+27000000000', 'completed', now() - interval '10 minutes',
        ${opts.answered === false ? null : sql`now() - make_interval(secs => ${talk + 20})`},
        now() - interval '20 seconds', ${talk}, ${`CA${Math.random().toString(16).slice(2).padEnd(32, "0").slice(0, 32)}`})
      returning id::text`;
    const n = opts.segments ?? 4;
    for (let i = 1; i <= n; i++) {
      await sql`insert into public.consultant_call_segments (call_id, seq, speaker, text) values (${c.id}, ${i}, ${i % 2 ? "consultant" : "prospect"}, ${`utterance ${i}`})`;
    }
    return c.id;
  }

  const okResponse = (summary = SAMPLE_SUMMARY, delayMs = 0) => async () => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    return { stop_reason: "end_turn", parsed_output: summary, content: [] };
  };

  // ── Notes ──────────────────────────────────────────────────────────────────

  test("note create is idempotent on clientId (also under concurrent replays)", async () => {
    const lead = await newLead(A);
    const clientId = "7d3f1f7e-3c1a-4e5b-9a54-4f4f2f0b9a11";
    const replays = await Promise.all(
      Array.from({ length: 5 }, () => runAs(consultantSession(A), () => notesRoute.POST(jsonReq("POST", "/x", { leadId: lead.id, body: "Spoke to reception", clientId })))),
    );
    expect(replays.every((r) => r.status === 201)).toBe(true);
    const ids = new Set(await Promise.all(replays.map(async (r) => (await body<Note>(r)).id)));
    expect(ids.size).toBe(1);
    const [n] = await sql`select count(*)::int as n from public.consultant_notes where client_request_id = ${clientId}`;
    expect(n.n).toBe(1);
    const acts = await sql`select 1 from public.crm_activity where action_type = 'consultant_note' and client_id = ${lead.id}`;
    expect(acts.length).toBe(1);
    // The same clientId aimed at a different lead is not a replay → conflict, not a leak of the other note.
    const other = await newLead(A);
    actAs(consultantSession(A));
    const cross = await notesRoute.POST(jsonReq("POST", "/x", { leadId: other.id, body: "x", clientId }));
    expect(cross.status).toBe(409);
    expect(JSON.stringify(await body(cross))).not.toContain("Spoke to reception");
  });

  test("note edits: stale baseVersion → 409; every edit keeps a revision with editor + time; history newest-first, current first", async () => {
    const lead = await newLead(A);
    actAs(consultantSession(A));
    const created = await body<Note>(await notesRoute.POST(jsonReq("POST", "/x", { leadId: lead.id, body: "v1 by Alice" })));
    expect(created).toMatchObject({ version: 1, createdBy: "Alice Consultant", updatedBy: null });

    // History of a never-edited note = just the current text.
    let revs = await body<NoteRevision[]>(await revisionsRoute.GET(jsonReq("GET", "/x"), ctx(created.id)));
    expect(revs).toEqual([expect.objectContaining({ version: 1, body: "v1 by Alice", editedBy: "Alice Consultant" })]);

    const v2 = await noteRoute.PATCH(jsonReq("PATCH", "/x", { body: "v2 by Alice", baseVersion: 1 }), ctx(created.id));
    expect(v2.status).toBe(200);
    const stale = await noteRoute.PATCH(jsonReq("PATCH", "/x", { body: "stale", baseVersion: 1 }), ctx(created.id));
    expect(stale.status).toBe(409);
    expect((await body<ApiError>(stale)).fields?.baseVersion).toBeTruthy();

    // A manager edits v2 → v3; two concurrent edits from v3 → exactly one wins.
    actAs(managerSession(M));
    expect((await noteRoute.PATCH(jsonReq("PATCH", "/x", { body: "v3 by Mandy", baseVersion: 2 }), ctx(created.id))).status).toBe(200);
    const race = await Promise.all([
      runAs(consultantSession(A), () => noteRoute.PATCH(jsonReq("PATCH", "/x", { body: "v4 by Alice", baseVersion: 3 }), ctx(created.id))),
      runAs(managerSession(M), () => noteRoute.PATCH(jsonReq("PATCH", "/x", { body: "v4 by Mandy", baseVersion: 3 }), ctx(created.id))),
    ]);
    expect(race.map((r) => r.status).sort()).toEqual([200, 409]);

    actAs(consultantSession(A));
    revs = await body<NoteRevision[]>(await revisionsRoute.GET(jsonReq("GET", "/x"), ctx(created.id)));
    expect(revs.map((r) => r.version)).toEqual([4, 3, 2, 1]);
    expect(revs[1]).toMatchObject({ body: "v3 by Mandy", editedBy: "Mandy Manager" });
    expect(revs[2]).toMatchObject({ body: "v2 by Alice", editedBy: "Alice Consultant" });
    expect(revs[3]).toMatchObject({ body: "v1 by Alice", editedBy: "Alice Consultant" });
    const times = revs.map((r) => Date.parse(r.editedAt));
    expect(times.every((t) => Number.isFinite(t))).toBe(true);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    const [cur] = await sql`select version, body from public.consultant_notes where id = ${created.id}`;
    expect(revs[0]).toMatchObject({ version: cur.version, body: cur.body });

    // Another consultant can neither edit nor read the history.
    actAs(consultantSession(B));
    expect((await noteRoute.PATCH(jsonReq("PATCH", "/x", { body: "hijack", baseVersion: 4 }), ctx(created.id))).status).toBe(404);
    expect((await revisionsRoute.GET(jsonReq("GET", "/x"), ctx(created.id))).status).toBe(404);
  });

  // ── Coach Alex ─────────────────────────────────────────────────────────────

  test("summariser: concurrent triggers → exactly one SDK call; summary on the call + an ai_summary note by Coach Alex", async () => {
    const lead = await newLead(A);
    const callId = await endedCall(A, lead.id);
    anthropic.impl = okResponse(SAMPLE_SUMMARY, 150);

    actAs(consultantSession(A));
    const results = await Promise.all([
      ...Array.from({ length: 6 }, () => summariseCall(sql, callId)),
      summariseRoute.POST(jsonReq("POST", "/x"), ctx(callId)).then(async (r) => {
        expect(r.status).toBe(202);
        await drainAfter();
        return "route";
      }),
    ]);
    expect(anthropic.calls.length).toBe(1);
    expect(results.filter((r) => r === "ready").length).toBe(1);

    const req = anthropic.calls[0] as { messages: { content: string }[]; model: string };
    expect(req.messages[0].content).toContain("[2] Clinic: utterance 2");
    const [row] = await sql`select summary_status, summary, summary_attempts from public.consultant_calls where id = ${callId}`;
    expect(row).toMatchObject({ summary_status: "ready", summary_attempts: 1 });
    expect(row.summary.summary).toBe(SAMPLE_SUMMARY.summary);
    const notes = await sql`select kind, body, version, created_by_name from public.consultant_notes where call_id = ${callId}`;
    expect(notes.length).toBe(1);
    expect(notes[0]).toMatchObject({ kind: "ai_summary", version: 1, created_by_name: "Coach Alex" });
    expect(notes[0].body).toContain("## Summary");
    const [comm] = await sql`select body_preview from public.client_communications where metadata->>'consultant_call_id' = ${callId}`;
    expect(comm.body_preview).toBe(SAMPLE_SUMMARY.summary);

    // Re-running a ready call is a no-op (no second SDK call).
    expect(await summariseCall(sql, callId, { manual: true })).toBeNull();
    expect(anthropic.calls.length).toBe(1);
  });

  test("summariser: a human-edited ai_summary note is never overwritten by a re-run; an unedited one is refreshed", async () => {
    const lead = await newLead(A);
    const callId = await endedCall(A, lead.id);
    anthropic.impl = okResponse();
    expect(await summariseCall(sql, callId)).toBe("ready");
    const [note] = await sql<{ id: string }[]>`select id::text from public.consultant_notes where call_id = ${callId} and kind = 'ai_summary'`;

    // Unedited: a re-run refreshes the draft.
    await sql`update public.consultant_calls set summary_status = 'pending' where id = ${callId}`;
    anthropic.impl = okResponse({ ...SAMPLE_SUMMARY, summary: "Second AI pass." });
    expect(await summariseCall(sql, callId)).toBe("ready");
    let [n] = await sql`select body, version from public.consultant_notes where id = ${note.id}`;
    expect(n.body).toContain("Second AI pass.");

    // A human edits it.
    actAs(consultantSession(A));
    expect((await noteRoute.PATCH(jsonReq("PATCH", "/x", { body: "Alice's corrected summary", baseVersion: 1 }), ctx(note.id))).status).toBe(200);

    await sql`update public.consultant_calls set summary_status = 'failed' where id = ${callId}`;
    anthropic.impl = okResponse({ ...SAMPLE_SUMMARY, summary: "Third AI pass." });
    actAs(consultantSession(A));
    const res = await summariseRoute.POST(jsonReq("POST", "/x"), ctx(callId));
    expect(res.status).toBe(202);
    await drainAfter();
    [n] = await sql`select body, version, updated_by_name from public.consultant_notes where id = ${note.id}`;
    expect(n).toEqual({ body: "Alice's corrected summary", version: 2, updated_by_name: "Alice Consultant" });
    // The original AI output stays on the call row (updated), and history keeps the AI draft.
    const [row] = await sql`select summary from public.consultant_calls where id = ${callId}`;
    expect(row.summary.summary).toBe("Third AI pass.");
    const revs = await body<NoteRevision[]>(await revisionsRoute.GET(jsonReq("GET", "/x"), ctx(note.id)));
    expect(revs.map((r) => r.editedBy)).toEqual(["Alice Consultant", "Coach Alex"]);
    expect(revs[1].body).toContain("Second AI pass.");
  });

  test("summariser skip rules: too short, no transcript, no API key, not ended — no SDK call", async () => {
    anthropic.impl = okResponse();
    const lead = await newLead(B);
    const short = await endedCall(B, lead.id, { talkSec: 5 });
    expect(await summariseCall(sql, short)).toBe("skipped");
    const empty = await endedCall(B, lead.id, { segments: 0 });
    expect(await summariseCall(sql, empty)).toBe("skipped");
    const noKey = await endedCall(B, lead.id);
    const key = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(await summariseCall(sql, noKey)).toBe("skipped");
    } finally {
      process.env.ANTHROPIC_API_KEY = key;
    }
    const live = await endedCall(B, lead.id);
    await sql`update public.consultant_calls set ended_at = null, status = 'in_progress' where id = ${live}`;
    expect(await summariseCall(sql, live)).toBeNull();
    expect(anthropic.calls.length).toBe(0);
    const rows = await sql`select id::text, summary_error from public.consultant_calls where id in (${short}, ${empty}, ${noKey}) order by started_at`;
    const errs = new Map(rows.map((r) => [r.id, r.summary_error]));
    expect(errs.get(short)).toBe(MESSAGES.summarySkippedShort);
    expect(errs.get(empty)).toBe(MESSAGES.summarySkippedEmpty);
    expect(errs.get(noKey)).toBe(MESSAGES.summarySkippedNoKey);
  });

  test("summariser: refusal exhausts attempts (sweep won't retry); transient API errors retry up to the cap", async () => {
    const lead = await newLead(B);
    const refused = await endedCall(B, lead.id);
    anthropic.impl = async () => ({ stop_reason: "refusal", parsed_output: null, content: [] });
    expect(await summariseCall(sql, refused)).toBe("failed");
    const [r1] = await sql`select summary_status, summary_error, summary_attempts from public.consultant_calls where id = ${refused}`;
    expect(r1).toMatchObject({ summary_status: "failed", summary_error: MESSAGES.summaryRefused, summary_attempts: 3 });
    expect(await summariseCall(sql, refused)).toBeNull(); // not claimable by the sweep any more

    const flaky = await endedCall(B, lead.id);
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    anthropic.impl = async () => {
      throw new Anthropic.InternalServerError(500, { type: "error" }, "boom +27821234567", new Headers());
    };
    anthropic.calls.length = 0;
    for (let i = 0; i < 5; i++) await summariseCall(sql, flaky);
    expect(anthropic.calls.length).toBe(3); // maxSummaryAttempts
    const [r2] = await sql`select summary_status, summary_error, summary_attempts from public.consultant_calls where id = ${flaky}`;
    expect(r2).toMatchObject({ summary_status: "failed", summary_error: MESSAGES.summaryFailed, summary_attempts: 3 });
    // Nothing from the upstream error (which carried a phone number) reached the logs.
    const logged = JSON.stringify((console.error as jest.Mock).mock.calls);
    expect(logged).not.toContain("+27821234567");
    expect(logged).not.toContain("boom");
  });

  // ── Sweep ──────────────────────────────────────────────────────────────────

  test("sweep: retention deletes old segments + old recordings only; stale calls closed; stuck summaries released", async () => {
    const lead = await newLead(M);
    const oldCall = await endedCall(M, lead.id);
    const oldRec = newRecordingSid();
    await sql`update public.consultant_calls set started_at = now() - interval '400 days', answered_at = now() - interval '400 days',
      ended_at = now() - interval '400 days' + interval '2 minutes', recording_sid = ${oldRec}, summary_status = 'ready' where id = ${oldCall}`;
    const midCall = await endedCall(M, lead.id); // 100 days: recording goes, transcript stays
    const midRec = newRecordingSid();
    await sql`update public.consultant_calls set started_at = now() - interval '100 days', answered_at = now() - interval '100 days',
      ended_at = now() - interval '100 days' + interval '2 minutes', recording_sid = ${midRec}, summary_status = 'ready' where id = ${midCall}`;
    const newCall = await endedCall(M, lead.id);
    const newRec = newRecordingSid();
    await sql`update public.consultant_calls set recording_sid = ${newRec}, summary_status = 'ready' where id = ${newCall}`;
    await sql`insert into public.consultant_notes (client_id, call_id, kind, body, created_by_name) values (${lead.id}, ${oldCall}, 'ai_summary', 'kept', 'Coach Alex')`;

    // Stale live calls: answered 2h ago with no final callback; initiated and never connected.
    const [stale] = await sql<{ id: string }[]>`
      insert into public.consultant_calls (client_id, consultant_id, to_number, status, started_at, answered_at, twilio_call_sid)
      values (${lead.id}, ${M.id}, '+27000000000', 'in_progress', now() - interval '3 hours', now() - interval '3 hours' + interval '20 seconds', 'CAstale')
      returning id::text`;
    const [ghost] = await sql<{ id: string }[]>`
      insert into public.consultant_calls (client_id, consultant_id, to_number, status, started_at)
      values (${lead.id}, ${M.id}, '+27000000000', 'initiated', now() - interval '5 minutes') returning id::text`;
    const [fresh] = await sql<{ id: string }[]>`
      insert into public.consultant_calls (client_id, consultant_id, to_number, status, started_at, answered_at, twilio_call_sid)
      values (${lead.id}, ${M.id}, '+27000000000', 'in_progress', now() - interval '5 minutes', now() - interval '4 minutes', 'CAfresh')
      returning id::text`;
    const stuck = await endedCall(M, lead.id);
    await sql`update public.consultant_calls set summary_status = 'processing', updated_at = now() - interval '20 minutes', summary_attempts = 3 where id = ${stuck}`;

    const deleted: string[] = [];
    const realFetch = global.fetch;
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("DELETE");
      deleted.push(String(input));
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    let report;
    try {
      anthropic.impl = okResponse();
      report = await runConsultantSweep(sql);
    } finally {
      global.fetch = realFetch;
    }

    expect(deleted.sort()).toEqual([oldRec, midRec].map((s) => `https://api.twilio.com/2010-04-01/Accounts/AC${"0".repeat(32)}/Recordings/${s}.json`).sort());
    const recs = await sql`select id::text, recording_sid from public.consultant_calls where id in (${oldCall}, ${midCall}, ${newCall})`;
    const recMap = new Map(recs.map((r) => [r.id, r.recording_sid]));
    expect(recMap.get(oldCall)).toBeNull();
    expect(recMap.get(midCall)).toBeNull();
    expect(recMap.get(newCall)).toBe(newRec);

    const segs = await sql`select call_id::text, count(*)::int as n from public.consultant_call_segments where call_id in (${oldCall}, ${midCall}, ${newCall}) group by call_id`;
    const segMap = new Map(segs.map((s) => [s.call_id, s.n]));
    expect(segMap.get(oldCall)).toBeUndefined();
    expect(segMap.get(midCall)).toBe(4);
    expect(segMap.get(newCall)).toBe(4);
    const [kept] = await sql`select count(*)::int as n from public.consultant_notes where call_id = ${oldCall}`;
    expect(kept.n).toBe(1);
    const [oldRow] = await sql`select summary_status from public.consultant_calls where id = ${oldCall}`;
    expect(oldRow.summary_status).toBe("ready");

    const closed = await sql`select id::text, status, ended_at, answered_at, summary_status from public.consultant_calls where id in (${stale.id}, ${ghost.id}, ${fresh.id})`;
    const byId = new Map(closed.map((c) => [c.id, c]));
    expect(byId.get(stale.id)).toMatchObject({ status: "completed" });
    const s = byId.get(stale.id)!;
    expect((new Date(s.ended_at).getTime() - new Date(s.answered_at).getTime()) / 1000).toBe(3600); // capped at maxCallSec
    expect(byId.get(ghost.id)).toMatchObject({ status: "failed", summary_status: "skipped" });
    expect(byId.get(fresh.id)).toMatchObject({ status: "in_progress", ended_at: null });

    const [st] = await sql`select summary_status from public.consultant_calls where id = ${stuck}`;
    expect(st.summary_status).toBe("failed");
    expect(report).toMatchObject({ recordingsDeleted: 2, recordingDeleteFailures: 0, transcriptsPurged: 1, releasedSummaries: 1 });
    expect(report!.closedCalls).toBeGreaterThanOrEqual(2);
  });

  test("sweep cron route fails closed without / with a wrong CRON_SECRET", async () => {
    delete process.env.CRON_SECRET;
    expect((await sweepRoute.GET(new Request("http://x/api/cron/consultant-sweep", { headers: { authorization: "Bearer " } }))).status).toBe(401);
    process.env.CRON_SECRET = "s3cret";
    expect((await sweepRoute.GET(new Request("http://x/", { headers: { authorization: "Bearer nope!" } }))).status).toBe(401);
    expect((await sweepRoute.GET(new Request("http://x/"))).status).toBe(401);
    anthropic.impl = okResponse();
    const ok = await sweepRoute.GET(new Request("http://x/", { headers: { authorization: "Bearer s3cret" } }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true });
  });

  // ── Stats (quant) ──────────────────────────────────────────────────────────

  test("TodayStats: Africa/Johannesburg day boundaries, talk-time sums, missing answered_at, due follow-ups", async () => {
    const C = await insertMember(sql, "carl", "sales_consultant", "Carl Quant");
    const lead = await newLead(C);
    // SAST is UTC+2 all year (no DST): today's SA midnight in UTC.
    const [{ start }] = await sql<{ start: Date }[]>`select (date_trunc('day', now() at time zone 'Africa/Johannesburg') at time zone 'Africa/Johannesburg') as start`;
    const saNow = new Date(Date.now() + 2 * 3600_000);
    const expectedStart = new Date(Date.UTC(saNow.getUTCFullYear(), saNow.getUTCMonth(), saNow.getUTCDate()) - 2 * 3600_000);
    expect(start.toISOString()).toBe(expectedStart.toISOString());
    const at = (offsetSec: number) => new Date(start.getTime() + offsetSec * 1000);

    const ins = (startedAt: Date, answeredSec: number | null, talkSec: number | null, extra: { disposition?: string; duration?: number | null; ended?: boolean } = {}) => sql`
      insert into public.consultant_calls (client_id, consultant_id, to_number, status, started_at, answered_at, ended_at, duration_sec, disposition)
      values (${lead.id}, ${C.id}, '+27000000000', 'completed', ${startedAt},
        ${answeredSec == null ? null : new Date(startedAt.getTime() + answeredSec * 1000)},
        ${extra.ended === false ? null : new Date(startedAt.getTime() + ((answeredSec ?? 0) + (talkSec ?? 0)) * 1000)},
        ${extra.duration ?? null}, ${extra.disposition ?? null})`;

    await ins(at(-60), 5, 600, { disposition: "demo_booked" }); // 21:59 UTC yesterday = 23:59 SAST yesterday → excluded
    await ins(at(90 * 60), 10, 125, { disposition: "demo_booked" }); // 23:30 UTC yesterday = 01:30 SAST today → included
    await ins(at(60), 3, 60.4, { disposition: "discovery_booked" }); // just after SA midnight
    await ins(at(120), null, null, { disposition: "no_answer", duration: 0 }); // unanswered dial: counts as a dial only
    await ins(at(180), null, null, { duration: 45 }); // no answered_at but a duration: still not a connect, 0 talk
    await ins(at(240), 4, null, { ended: false, duration: 30 }); // answered, not ended yet: falls back to duration

    // Due follow-ups: due before the END of the SA day, open stages only.
    const end = new Date(start.getTime() + 86_400_000);
    const lead2 = await newLead(C);
    const lead3 = await newLead(C);
    const lead4 = await newLead(C);
    await sql`update public.clients set next_action_at = ${new Date(end.getTime() - 1000)} where id = ${lead.id}`;
    await sql`update public.clients set next_action_at = ${end} where id = ${lead2.id}`; // tomorrow 00:00 SAST → not due
    await sql`update public.clients set next_action_at = ${new Date(start.getTime() - 86_400_000)} where id = ${lead3.id}`; // overdue → due
    await sql`update public.clients set next_action_at = ${start}, sales_stage = 'won' where id = ${lead4.id}`; // won → not due

    const stats = await todayStats(sql, C.id);
    expect(stats).toEqual({
      dials: 5,
      connects: 3,
      talkTimeSec: 125 + 60 + 30,
      discoveryBooked: 1,
      demosBooked: 1,
      dueFollowUps: 2,
    });

    // Route: own stats; consultantId is managers-only.
    actAs(consultantSession(C));
    expect(await body<TodayStats>(await statsRoute.GET(jsonReq("GET", "/api/consultant/stats/today")))).toEqual(stats);
    expect((await statsRoute.GET(jsonReq("GET", `/api/consultant/stats/today?consultantId=${A.id}`))).status).toBe(403);
    actAs(managerSession(M));
    expect(await body<TodayStats>(await statsRoute.GET(jsonReq("GET", `/api/consultant/stats/today?consultantId=${C.id}`)))).toEqual(stats);
  });

  // ── Clinic landing page → pool ─────────────────────────────────────────────

  const enquiry = (over: Record<string, unknown> = {}) =>
    ClinicBlueprintSchema.parse({
      practiceName: "Radiance Skin Clinic",
      clinicType: "Aesthetic / skin",
      locations: 1,
      practitioners: 3,
      enquiryVolume: "20–50 a month",
      responseSpeed: "Same day",
      afterHours: "Goes to voicemail",
      recallHandling: "Nothing systematic",
      avgAppointmentValue: 1500,
      noShowRate: 12,
      timeline: "Next quarter",
      contactName: "Dr Naidoo",
      role: "Owner",
      email: "owner@radiance.example",
      whatsapp: "+27 82 444 0101",
      websiteUrl: "radiance.example",
      consent: true,
      ...over,
    });

  test("landing enquiry → one unassigned Clinics pool lead; resubmits dedupe by phone or email", async () => {
    const first = await insertClinicBlueprint(sql, enquiry());
    expect(Number(first.id)).toBeGreaterThan(0);
    const leads = await sql`select id::text, consultant_id, vertical, sales_stage, status::text as status, phone, lead_source, email from public.clients where email = 'owner@radiance.example'`;
    expect(leads.length).toBe(1);
    expect(leads[0]).toMatchObject({ consultant_id: null, vertical: "clinics", sales_stage: "new", status: "lead", phone: "+27824440101", lead_source: "landing_page" });

    await insertClinicBlueprint(sql, enquiry({ practiceName: "Radiance again" })); // same phone + email
    await insertClinicBlueprint(sql, enquiry({ whatsapp: "+27 82 444 0199" })); // same email, new phone
    await insertClinicBlueprint(sql, enquiry({ email: "reception@radiance.example" })); // same phone, new email
    const [n] = await sql`select count(*)::int as n from public.clients where vertical = 'clinics' and (phone like '+2782444%' or email like '%radiance.example')`;
    expect(n.n).toBe(1);
    const [bp] = await sql`select count(*)::int as n from clinic_blueprints`;
    expect(bp.n).toBe(4); // every enquiry itself is still stored

    // Visible in the pool to any consultant.
    actAs(consultantSession(B));
    const pool = await body<Lead[]>(await searchRoute.POST(jsonReq("POST", "/api/consultant/leads/search", { scope: "pool", q: "Radiance" })));
    expect(pool.map((l) => l.id)).toContain(leads[0].id);
  });

  test("landing enquiry whose email belongs to a non-Clinics CRM client creates no lead but the form still succeeds", async () => {
    await sql`insert into public.clients (name, email, status) values ('Existing', 'taken@elsewhere.example', 'blueprint-submitted')`;
    const res = await insertClinicBlueprint(sql, enquiry({ email: "taken@elsewhere.example", whatsapp: "+27 82 444 0300" }));
    expect(Number(res.id)).toBeGreaterThan(0);
    const rows = await sql`select vertical from public.clients where email = 'taken@elsewhere.example'`;
    expect(rows).toEqual([{ vertical: null }]);
    expect(JSON.stringify((console.warn as jest.Mock).mock.calls)).not.toContain("taken@elsewhere");
  });

  test("a CRM feed failure never breaks the landing form (schema not migrated yet)", async () => {
    const bare = await createTestDatabase(); // CRM migrations only — no consultant columns
    try {
      const res = await insertClinicBlueprint(bare.sql, enquiry({ email: "bare@clinic.example" }));
      expect(Number(res.id)).toBeGreaterThan(0);
      const [n] = await bare.sql`select count(*)::int as n from clinic_blueprints`;
      expect(n.n).toBe(1);
      const logged = JSON.stringify((console.error as jest.Mock).mock.calls);
      expect(logged).toContain("CRM lead feed failed");
      expect(logged).not.toContain("bare@clinic.example");
      expect(logged).not.toContain("444");
    } finally {
      await bare.drop();
    }
  });
});
