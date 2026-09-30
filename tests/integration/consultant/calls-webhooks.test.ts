/**
 * Calls end-to-end against a REAL Postgres with SIGNED Twilio webhooks (a real
 * X-Twilio-Signature computed from a test auth token + CONSULTANT_PUBLIC_URL):
 * start → TwiML → status / dial-complete (out of order) → transcription (out of order,
 * duplicate, concurrent) → recording → CRM feed; plus the recording proxy's scope.
 * Skipped unless CONSULTANT_IT_PG_URL is set (see harness.ts).
 */
import "./mocks";
import type { Sql } from "postgres";
import {
  actAs,
  afterTasks,
  applyTestEnv,
  body,
  callSid as newCallSid,
  consultantSession,
  createTestDatabase,
  ctx,
  describeDb,
  insertMember,
  jsonReq,
  managerSession,
  recordingSid as newRecordingSid,
  sign,
  twilioReq,
  type Member,
  type TestDb,
} from "./harness";
import { ensureConsultantSchema } from "@/lib/consultant/schema";
import { portalStatusValues } from "@/lib/consultant/config";
import { resetSingletonPool } from "@/lib/crm/db";
import { recordCallInCrm } from "@/lib/consultant/server/crmFeed";
import { todayStats } from "@/lib/consultant/server/repo/stats";
import * as leadsRoute from "@/app/api/consultant/leads/route";
import * as callsRoute from "@/app/api/consultant/calls/route";
import * as callRoute from "@/app/api/consultant/calls/[id]/route";
import * as liveRoute from "@/app/api/consultant/calls/[id]/live/route";
import * as cardsRoute from "@/app/api/consultant/calls/[id]/cards/route";
import * as recordingProxy from "@/app/api/consultant/calls/[id]/recording/route";
import * as twimlRoute from "@/app/api/consultant-voice/twiml/route";
import * as whisperRoute from "@/app/api/consultant-voice/whisper/route";
import * as statusRoute from "@/app/api/consultant-voice/status/route";
import * as dialCompleteRoute from "@/app/api/consultant-voice/dial-complete/route";
import * as transcriptionRoute from "@/app/api/consultant-voice/transcription/route";
import * as recordingHook from "@/app/api/consultant-voice/recording/route";
import { resetRateLimits } from "@/lib/consultant/auth/rateLimit";
import type { Call, Lead, LiveCallState } from "@/lib/consultant/types";

applyTestEnv();

const TWIML = "/api/consultant-voice/twiml";

describeDb("consultant portal · calls & Twilio webhooks (real Postgres)", () => {
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
    resetRateLimits();
  });

  let phoneSeq = 100;
  async function newLead(owner: Member): Promise<Lead> {
    actAs(consultantSession(owner));
    const res = await leadsRoute.POST(jsonReq("POST", "/x", { clinicName: `Clinic ${phoneSeq}`, phone: `+2721555${String(phoneSeq++).padStart(4, "0")}` }));
    expect(res.status).toBe(201);
    return body<Lead>(res);
  }

  async function startCall(owner: Member, leadId: string, extra: Record<string, unknown> = {}): Promise<Call> {
    actAs(consultantSession(owner));
    const res = await callsRoute.POST(jsonReq("POST", "/x", { leadId, ...extra }));
    expect(res.status).toBe(201);
    return body<Call>(res);
  }

  function twimlParams(member: Member, callId: string, sid: string, extra: Record<string, string> = {}) {
    return { AccountSid: `AC${"0".repeat(32)}`, CallSid: sid, From: `client:consultant_${member.id}`, To: "", CallId: callId, ...extra };
  }

  /** Start + bind a call through the real TwiML webhook. */
  async function connectedCall(owner: Member): Promise<{ lead: Lead; call: Call; sid: string }> {
    const lead = await newLead(owner);
    const call = await startCall(owner, lead.id);
    const sid = newCallSid();
    const res = await twimlRoute.POST(twilioReq(TWIML, twimlParams(owner, call.id, sid)));
    expect(await res.text()).toContain("<Dial");
    return { lead, call, sid };
  }

  async function row(callId: string) {
    const [r] = await sql`select * from public.consultant_calls where id = ${callId}`;
    return r;
  }

  const status = (callId: string, parentSid: string, CallStatus: string, extra: Record<string, string> = {}) => {
    const path = `/api/consultant-voice/status?callId=${callId}`;
    return statusRoute.POST(twilioReq(path, { CallSid: newCallSid(), ParentCallSid: parentSid, CallStatus, ...extra }));
  };

  test("start: number comes from the lead, a body-supplied number is ignored; one live call per consultant", async () => {
    const lead = await newLead(A);
    const call = await startCall(A, lead.id, { to: "+15555550100", toNumber: "+15555550100" });
    expect(call.toNumber).toBe(lead.phone);
    expect(call).toMatchObject({ status: "initiated", consultantId: A.id, leadId: lead.id, summaryStatus: "pending" });
    const second = await newLead(A);
    actAs(consultantSession(A));
    expect((await callsRoute.POST(jsonReq("POST", "/x", { leadId: second.id }))).status).toBe(409);
  });

  test("TwiML: signed request → Dial with the lead's stored phone, whisper, transcription, recording, callbacks", async () => {
    const lead = await newLead(B);
    const call = await startCall(B, lead.id);
    // The lead's number is edited after the call row was created: the TwiML dials the CURRENT stored number.
    actAs(consultantSession(B));
    const { PATCH } = await import("@/app/api/consultant/leads/[id]/route");
    expect((await PATCH(jsonReq("PATCH", "/x", { phone: "+27215559999" }), ctx(lead.id))).status).toBe(200);

    const sid = newCallSid();
    const res = await twimlRoute.POST(twilioReq(TWIML, twimlParams(B, call.id, sid, { To: "+15555550100" })));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/xml");
    const xml = await res.text();
    expect(xml).toContain('<Number url="https://portal.example.test/api/consultant-voice/whisper"');
    expect(xml).toMatch(/<Number [^>]*>\+27215559999<\/Number>/);
    expect(xml).not.toContain("+15555550100");
    expect(xml).toContain('callerId="+27100000000"');
    expect(xml).toContain('record="record-from-answer-dual"');
    expect(xml).toContain(`statusCallbackUrl="https://portal.example.test/api/consultant-voice/transcription?callId=${call.id}"`);
    expect(xml).toContain(`action="https://portal.example.test/api/consultant-voice/dial-complete?callId=${call.id}"`);
    expect(xml).toContain('track="both_tracks"');
    expect(xml).toContain('partialResults="false"');
    const r = await row(call.id);
    expect(r.twilio_call_sid).toBe(sid);
    expect(r.to_number).toBe("+27215559999");

    // Twilio retry with the same CallSid is accepted (idempotent).
    const retry = await twimlRoute.POST(twilioReq(TWIML, twimlParams(B, call.id, sid)));
    expect(await retry.text()).toContain("<Dial");

    // A second, different CallSid for the same call is refused.
    const other = await twimlRoute.POST(twilioReq(TWIML, twimlParams(B, call.id, newCallSid())));
    const otherXml = await other.text();
    expect(otherXml).toContain("<Hangup/>");
    expect(otherXml).not.toContain("<Dial");
  });

  test("TwiML refusals: identity mismatch, wrong state, malformed ids → Say + Hangup and nothing bound", async () => {
    const lead = await newLead(A);
    // A's previous test call is still live → close it first so A can start another.
    await sql`update public.consultant_calls set status = 'completed', ended_at = now() where consultant_id = ${A.id}`;
    const call = await startCall(A, lead.id);

    const asB = await twimlRoute.POST(twilioReq(TWIML, twimlParams(B, call.id, newCallSid())));
    const xml = await asB.text();
    expect(xml).toMatch(/<Say[^>]*>[^<]+<\/Say><Hangup\/>/);
    expect((await row(call.id)).twilio_call_sid).toBeNull();

    for (const bad of [
      twimlParams(A, call.id, "not-a-call-sid"),
      twimlParams(A, "not-a-uuid", newCallSid()),
      { ...twimlParams(A, call.id, newCallSid()), From: "+27821234567" }, // PSTN caller, not a browser client
      { ...twimlParams(A, call.id, newCallSid()), From: `client:consultant_${A.id}x` },
    ]) {
      const res = await twimlRoute.POST(twilioReq(TWIML, bad));
      expect(await res.text()).toContain("<Hangup/>");
    }
    expect((await row(call.id)).twilio_call_sid).toBeNull();

    await sql`update public.consultant_calls set status = 'completed', ended_at = now() where id = ${call.id}`;
    const ended = await twimlRoute.POST(twilioReq(TWIML, twimlParams(A, call.id, newCallSid())));
    expect(await ended.text()).toContain("<Hangup/>");
    expect((await row(call.id)).twilio_call_sid).toBeNull();
  });

  test("bad / missing / foreign-origin signature → 403 on every webhook and nothing written", async () => {
    await sql`update public.consultant_calls set status = 'completed', ended_at = coalesce(ended_at, now()) where consultant_id = ${A.id}`;
    const lead = await newLead(A);
    const call = await startCall(A, lead.id);
    const sid = newCallSid();
    const params = twimlParams(A, call.id, sid);

    expect((await twimlRoute.POST(twilioReq(TWIML, params, null))).status).toBe(403);
    expect((await twimlRoute.POST(twilioReq(TWIML, params, sign(TWIML, params, "wrong-token")))).status).toBe(403);
    // Signed for a different origin (e.g. an attacker's host header) — must not validate.
    const twilio = (await import("twilio")).default;
    const foreign = twilio.getExpectedTwilioSignature("it-test-auth-token-0123456789abcdef", `http://internal.host${TWIML}`, params);
    expect((await twimlRoute.POST(twilioReq(TWIML, params, foreign))).status).toBe(403);
    // Tampered body after signing.
    expect((await twimlRoute.POST(twilioReq(TWIML, { ...params, CallId: call.id.replace(/.$/, "0") }, sign(TWIML, params)))).status).toBe(403);
    expect((await row(call.id)).twilio_call_sid).toBeNull();

    // Bind for real, then show every other webhook refuses unsigned traffic without writing.
    await twimlRoute.POST(twilioReq(TWIML, params));
    const q = `?callId=${call.id}`;
    const unsigned = [
      statusRoute.POST(twilioReq(`/api/consultant-voice/status${q}`, { CallSid: newCallSid(), ParentCallSid: sid, CallStatus: "completed", CallDuration: "99" }, "bogus")),
      dialCompleteRoute.POST(twilioReq(`/api/consultant-voice/dial-complete${q}`, { CallSid: sid, DialCallStatus: "completed" }, "bogus")),
      transcriptionRoute.POST(twilioReq(`/api/consultant-voice/transcription${q}`, transcript(sid, "outbound_track", "hi", 1), "bogus")),
      recordingHook.POST(twilioReq(`/api/consultant-voice/recording${q}`, { CallSid: sid, RecordingSid: newRecordingSid(), RecordingStatus: "completed" }, "bogus")),
      whisperRoute.POST(twilioReq("/api/consultant-voice/whisper", {}, "bogus")),
    ];
    for (const res of await Promise.all(unsigned)) expect(res.status).toBe(403);
    const r = await row(call.id);
    expect(r).toMatchObject({ status: "initiated", ended_at: null, duration_sec: null, recording_sid: null });
    const [segs] = await sql`select count(*)::int as n from public.consultant_call_segments where call_id = ${call.id}`;
    expect(segs.n).toBe(0);
    expect(afterTasks.tasks.length).toBe(0);
    // A signed webhook whose query string was altered (callId swapped) is also rejected.
    const swapped = `/api/consultant-voice/status?callId=${call.id}`;
    const p2 = { CallSid: newCallSid(), ParentCallSid: sid, CallStatus: "completed" };
    expect((await statusRoute.POST(twilioReq(`/api/consultant-voice/status?callId=00000000-0000-0000-0000-000000000000`, p2, sign(swapped, p2)))).status).toBe(403);
  });

  test("whisper plays the POPIA notice (Say only, no Dial)", async () => {
    const res = await whisperRoute.POST(twilioReq("/api/consultant-voice/whisper", { CallSid: newCallSid() }));
    const xml = await res.text();
    expect(xml).toMatch(/<Say[^>]*>[^<]*recorded[^<]*<\/Say>/);
    expect(xml).not.toContain("<Dial");
  });

  function transcript(sid: string, track: string, text: string, secOffset: number, final = "true"): Record<string, string> {
    return {
      CallSid: sid,
      TranscriptionEvent: "transcription-content",
      Track: track,
      Final: final,
      TranscriptionData: JSON.stringify({ transcript: text, confidence: 0.9 }),
      Timestamp: new Date(Date.UTC(2026, 8, 30, 10, 0, secOffset)).toISOString(),
    };
  }

  test("transcription: out-of-order + duplicate + 20 concurrent events → contiguous seqs, no dupes, right speakers; partials ignored", async () => {
    await sql`update public.consultant_calls set status = 'completed', ended_at = coalesce(ended_at, now()) where consultant_id = ${A.id}`;
    const { call, sid } = await connectedCall(A);
    const path = `/api/consultant-voice/transcription?callId=${call.id}`;
    const post = (p: Record<string, string>) => transcriptionRoute.POST(twilioReq(path, p));

    // Out of order (timestamp 5 before 1), then a duplicate re-delivery of both.
    expect((await post(transcript(sid, "outbound_track", "that's too expensive", 5))).status).toBe(200);
    expect((await post(transcript(sid, "inbound_track", "Hi, it's Alice from Vantage Stack", 1))).status).toBe(200);
    await post(transcript(sid, "outbound_track", "that's too expensive", 5));
    await post(transcript(sid, "inbound_track", "Hi, it's Alice from Vantage Stack", 1));
    // Partial result → ignored.
    await post(transcript(sid, "outbound_track", "send me", 6, "false"));
    // Unknown track / empty text / garbage JSON → ignored.
    await post(transcript(sid, "weird_track", "x", 7));
    await post({ ...transcript(sid, "outbound_track", "", 8) });
    await post({ ...transcript(sid, "outbound_track", "y", 9), TranscriptionData: "{not json" });
    // Foreign CallSid for this callId → not stored.
    await post(transcript(newCallSid(), "outbound_track", "from another call", 10));

    // 20 concurrent, each duplicated (40 requests), alternating tracks.
    const burst = Array.from({ length: 20 }, (_, i) => transcript(sid, i % 2 ? "inbound_track" : "outbound_track", `line ${i}`, 20 + i));
    const responses = await Promise.all([...burst, ...burst].map((p) => post(p)));
    expect(responses.every((r) => r.status === 200)).toBe(true);

    const segs = await sql<{ seq: number; speaker: string; text: string }[]>`
      select seq, speaker, text from public.consultant_call_segments where call_id = ${call.id} order by seq`;
    expect(segs.map((s) => s.seq)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
    expect(new Set(segs.map((s) => s.text)).size).toBe(22);
    expect(segs.find((s) => s.text === "that's too expensive")?.speaker).toBe("prospect");
    expect(segs.find((s) => s.text.startsWith("Hi, it's Alice"))?.speaker).toBe("consultant");
    for (let i = 0; i < 20; i++) {
      expect(segs.find((s) => s.text === `line ${i}`)?.speaker).toBe(i % 2 ? "consultant" : "prospect");
    }
    expect(segs.some((s) => s.text === "send me" || s.text === "from another call")).toBe(false);

    // Live endpoint: owner reads after a seq; another consultant cannot.
    actAs(consultantSession(A));
    const live = await body<LiveCallState>(await liveRoute.GET(jsonReq("GET", `/x?after=20`), ctx(call.id)));
    expect(live.segments.map((s) => s.seq)).toEqual([21, 22]);
    expect(live.lastSeq).toBe(22);
    expect((await liveRoute.GET(jsonReq("GET", `/x?after=-1`), ctx(call.id))).status).toBe(400);
    actAs(consultantSession(B));
    expect((await liveRoute.GET(jsonReq("GET", `/x?after=0`), ctx(call.id))).status).toBe(404);
    expect((await callRoute.GET(jsonReq("GET", "/x"), ctx(call.id))).status).toBe(404);
    expect((await cardsRoute.POST(jsonReq("POST", "/x", { events: [{ cardId: "price", action: "shown", at: new Date().toISOString() }] }), ctx(call.id))).status).toBe(404);
    actAs(consultantSession(A));
    expect((await cardsRoute.POST(jsonReq("POST", "/x", { events: [{ cardId: "price", action: "shown", at: new Date().toISOString(), triggerText: "too expensive" }] }), ctx(call.id))).status).toBe(204);
  });

  test("status + dial-complete: out-of-order callbacks never move status backwards; duration and endedNow once", async () => {
    await sql`update public.consultant_calls set status = 'completed', ended_at = coalesce(ended_at, now()) where consultant_id = ${B.id}`;
    const { call, sid } = await connectedCall(B);

    await status(call.id, sid, "ringing");
    expect((await row(call.id)).status).toBe("ringing");
    await status(call.id, sid, "answered");
    const answered = await row(call.id);
    expect(answered.status).toBe("in_progress");
    expect(answered.answered_at).not.toBeNull();
    // Late "initiated" and "ringing" after answer → ignored.
    await status(call.id, sid, "initiated");
    await status(call.id, sid, "ringing");
    expect((await row(call.id)).status).toBe("in_progress");

    await status(call.id, sid, "completed", { CallDuration: "95" });
    expect(afterTasks.tasks.length).toBe(2); // CRM feed + summary, scheduled exactly once
    let r = await row(call.id);
    expect(r).toMatchObject({ status: "completed", duration_sec: 95 });
    expect(r.ended_at).not.toBeNull();

    // Dial action arrives after, with a different duration + a late "in-progress" → no change, nothing re-scheduled.
    const dc = await dialCompleteRoute.POST(twilioReq(`/api/consultant-voice/dial-complete?callId=${call.id}`, { CallSid: sid, DialCallStatus: "completed", DialCallSid: newCallSid(), DialCallDuration: "90" }));
    expect(await dc.text()).toContain("<Hangup/>");
    await status(call.id, sid, "in-progress");
    r = await row(call.id);
    expect(r).toMatchObject({ status: "completed", duration_sec: 95 });
    expect(afterTasks.tasks.length).toBe(2);
    afterTasks.tasks.length = 0;

    // A callback for this callId with a foreign parent CallSid is ignored.
    const res = await status(call.id, newCallSid(), "failed");
    expect(res.status).toBe(200);
    expect((await row(call.id)).status).toBe("completed");
  });

  test("unanswered call: no-answer → completed, summary skipped, no talk time", async () => {
    await sql`update public.consultant_calls set status = 'completed', ended_at = coalesce(ended_at, now()) where consultant_id = ${B.id}`;
    const { call, sid } = await connectedCall(B);
    await status(call.id, sid, "ringing");
    await dialCompleteRoute.POST(twilioReq(`/api/consultant-voice/dial-complete?callId=${call.id}`, { CallSid: sid, DialCallStatus: "no-answer" }));
    const r = await row(call.id);
    expect(r).toMatchObject({ status: "completed", summary_status: "skipped", answered_at: null, duration_sec: null });
  });

  test("'answered' arriving AFTER 'completed' revives the summary and keeps talk time correct", async () => {
    await sql`update public.consultant_calls set status = 'completed', ended_at = coalesce(ended_at, now()) where consultant_id = ${M.id}`;
    const { call, sid } = await connectedCall(M);
    await status(call.id, sid, "completed", { CallDuration: "120" });
    expect((await row(call.id)).summary_status).toBe("skipped");
    await new Promise((r) => setTimeout(r, 1100)); // the late callback lands a second after the end
    await status(call.id, sid, "answered");
    const r = await row(call.id);
    expect(r).toMatchObject({ status: "completed", summary_status: "pending", duration_sec: 120 });
    // Talk time is 120 s everywhere, never negative or zero.
    const stats = await todayStats(sql, M.id);
    expect(stats.talkTimeSec).toBe(120);
    const { talkSeconds } = await import("@/lib/consultant/server/summarise");
    expect(talkSeconds(r as never)).toBe(120);
    await recordCallInCrm(sql, call.id);
    const [comm] = await sql`select metadata from public.client_communications where metadata->>'consultant_call_id' = ${call.id}`;
    expect(comm.metadata.talk_sec).toBe(120);
  });

  test("recording webhook stores the sid; proxy streams only to users who can see the lead", async () => {
    await sql`update public.consultant_calls set status = 'completed', ended_at = coalesce(ended_at, now()) where consultant_id = ${A.id}`;
    const { call, sid } = await connectedCall(A);
    const q = `?callId=${call.id}`;
    // Non-completed status / malformed sid → ignored.
    await recordingHook.POST(twilioReq(`/api/consultant-voice/recording${q}`, { CallSid: sid, RecordingSid: newRecordingSid(), RecordingStatus: "in-progress" }));
    await recordingHook.POST(twilioReq(`/api/consultant-voice/recording${q}`, { CallSid: sid, RecordingSid: "https://evil.example/rec.mp3", RecordingStatus: "completed" }));
    expect((await row(call.id)).recording_sid).toBeNull();
    const rsid = newRecordingSid();
    await recordingHook.POST(twilioReq(`/api/consultant-voice/recording${q}`, { CallSid: sid, RecordingSid: rsid, RecordingStatus: "completed", RecordingDuration: "61" }));
    expect((await row(call.id))).toMatchObject({ recording_sid: rsid, recording_duration_sec: 61 });

    const fetched: string[] = [];
    const realFetch = global.fetch;
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetched.push(String(input));
      expect((init?.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-length": "3" } });
    }) as typeof fetch;
    try {
      actAs(consultantSession(B));
      expect((await recordingProxy.GET(jsonReq("GET", "/x"), ctx(call.id))).status).toBe(404);
      expect(fetched).toEqual([]);
      actAs(consultantSession(A));
      const ok = await recordingProxy.GET(jsonReq("GET", "/x"), ctx(call.id));
      expect(ok.status).toBe(200);
      expect(ok.headers.get("content-type")).toBe("audio/mpeg");
      expect(ok.headers.get("cache-control")).toContain("no-store");
      expect(fetched).toEqual([`https://api.twilio.com/2010-04-01/Accounts/AC${"0".repeat(32)}/Recordings/${rsid}.mp3`]);
      // Call JSON exposes only a boolean, never the Twilio sid or URL.
      const detail = await (await callRoute.GET(jsonReq("GET", "/x"), ctx(call.id))).text();
      expect(detail).toContain('"hasRecording":true');
      expect(detail).not.toContain(rsid);
      expect(detail).not.toContain("twilio.com");
      actAs(managerSession(M));
      expect((await recordingProxy.GET(jsonReq("GET", "/x"), ctx(call.id))).status).toBe(200);
    } finally {
      global.fetch = realFetch;
    }
  });

  test("CRM feed: one client_communications row + one consultant_call activity per call, even when concurrent", async () => {
    await sql`update public.consultant_calls set status = 'completed', ended_at = coalesce(ended_at, now()) where consultant_id = ${B.id}`;
    const { lead, call, sid } = await connectedCall(B);
    await status(call.id, sid, "answered");
    await status(call.id, sid, "completed", { CallDuration: "42" });
    afterTasks.tasks.length = 0;
    await Promise.all(Array.from({ length: 10 }, () => recordCallInCrm(sql, call.id)));

    // Wrap-up (also moves the lead) refreshes the same row.
    actAs(consultantSession(A));
    expect((await callRoute.PATCH(jsonReq("PATCH", "/x", { disposition: "demo_booked" }), ctx(call.id))).status).toBe(404);
    actAs(consultantSession(B));
    const wrap = await callRoute.PATCH(jsonReq("PATCH", "/x", { disposition: "demo_booked", salesStage: "discovery_booked", nextAction: "Demo", nextActionAt: "2026-10-02T09:00:00+02:00" }), ctx(call.id));
    expect(wrap.status).toBe(200);
    expect((await body<Call>(wrap)).disposition).toBe("demo_booked");

    const comms = await sql`select subject, body_preview, metadata from public.client_communications where client_id = ${lead.id} and channel = 'call'`;
    expect(comms.length).toBe(1);
    expect(comms[0].metadata).toMatchObject({ consultant_call_id: call.id, vertical: "clinics", disposition: "demo_booked" });
    expect(comms[0].subject).toContain("Demo booked");
    expect(JSON.stringify(comms)).not.toContain(lead.phone!);
    const acts = await sql`select action_type, details from public.crm_activity where client_id = ${lead.id} order by created_at`;
    expect(acts.filter((a) => a.action_type === "consultant_call").length).toBe(1);
    expect(acts.some((a) => a.action_type === "consultant_stage_change" && a.details.source === "call" && a.details.call_id === call.id)).toBe(true);
    expect(JSON.stringify(acts)).not.toContain(lead.phone!);
    const [l] = await sql`select sales_stage, next_action, next_action_at from public.clients where id = ${lead.id}`;
    expect(l.sales_stage).toBe("discovery_booked");
    expect(l.next_action).toBe("Demo");
    expect(new Date(l.next_action_at).toISOString()).toBe("2026-10-02T07:00:00.000Z");
  });
});
