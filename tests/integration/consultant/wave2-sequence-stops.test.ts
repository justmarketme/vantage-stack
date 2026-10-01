/**
 * Emma sequence stop conditions against a REAL Postgres: n8n only handles timing, the app
 * decides at send time whether a sequence step still makes sense (lead replied, meeting moved,
 * deal advanced…). Skipped unless CONSULTANT_IT_PG_URL is set (see harness.ts).
 */
import "./mocks";
import type { Sql } from "postgres";
import { applyTestEnv, createTestDatabase, describeDb, insertMember, type Member, type TestDb } from "./harness";
import { signBody } from "@/lib/consultant/auth/signing";
import { portalStatusValues } from "@/lib/consultant/config";
import { ensureConsultantSchema } from "@/lib/consultant/schema";
import { resetSingletonPool } from "@/lib/crm/db";
import * as ingressRoute from "@/app/api/webhooks/n8n-ingress/route";

applyTestEnv();
const N8N_SECRET = "it-stops-n8n-secret-0123456789";
process.env.N8N_SIGNING_SECRET = N8N_SECRET;
process.env.TWILIO_WHATSAPP_FROM = "+27100000001";

describeDb("wave 2 · Emma sequence stop conditions (real Postgres)", () => {
  let tdb: TestDb;
  let sql: Sql;
  let A: Member;

  beforeAll(async () => {
    tdb = await createTestDatabase();
    sql = tdb.sql;
    process.env.DATABASE_URL = tdb.url;
    await ensureConsultantSchema(sql, portalStatusValues());
    A = await insertMember(sql, "alicestops", "sales_consultant", "Alice Stops");
  }, 60_000);

  afterAll(async () => {
    await resetSingletonPool();
    await tdb?.drop();
  });

  let n = 0;
  /** An inbound (social) lead with a scheduled discovery meeting; returns the event ids. */
  async function leadWithMeeting() {
    n++;
    const [lead] = await sql<{ id: string }[]>`
      insert into public.clients (name, company, email, phone, vertical, sales_stage, sales_stage_changed_at, status, consultant_id, lead_source)
      values (${`Stops Clinic ${n}`}, ${`Stops Clinic ${n}`}, ${`stops${n}@internal.vantagestack`}, ${`+2783${8000000 + n}`}, 'clinics',
        'discovery_booked', now(), 'lead', ${A.id}::uuid, 'social_inbound')
      returning id::text`;
    const startsAt = new Date(Date.now() + 2 * 86_400_000);
    const [meeting] = await sql<{ id: string }[]>`
      insert into public.consultant_meetings (client_id, consultant_id, kind, starts_at, ends_at)
      values (${lead.id}::uuid, ${A.id}::uuid, 'discovery', ${startsAt}, ${new Date(startsAt.getTime() + 30 * 60_000)})
      returning id::text`;
    const [scheduled] = await sql<{ id: string }[]>`
      select id::text from public.consultant_events where client_id = ${lead.id}::uuid and type = 'meeting.scheduled'`;
    return { leadId: lead.id, meetingId: meeting.id, scheduledEventId: scheduled.id };
  }

  async function send(leadId: string, key: string, sinceEventId: string, stopIf: string[]) {
    const raw = JSON.stringify({ action: "emma.send", idempotencyKey: key, leadId, template: "lead_discovery_reminder", variables: { meetingTime: "Thu 2 Oct, 10:00" }, sinceEventId, stopIf });
    const res = await ingressRoute.POST(new Request("http://localhost/api/webhooks/n8n-ingress", {
      method: "POST",
      headers: { "content-type": "application/json", "x-vs-signature": signBody(N8N_SECRET, raw) },
      body: raw,
    }));
    expect(res.status).toBe(200);
    return ((await res.json()) as { result: Record<string, unknown> }).result;
  }

  const STOPS = ["meeting_rescheduled", "lead_replied", "stage_advanced", "opted_out", "lead_lost"];

  test("nothing changed → the reminder is queued", async () => {
    const l = await leadWithMeeting();
    expect(await send(l.leadId, `stops-${n}-a`, l.scheduledEventId, STOPS)).toMatchObject({ status: "queued" });
  });

  test("meeting moved → the old reminder is skipped (meeting_rescheduled) and nothing is queued", async () => {
    const l = await leadWithMeeting();
    await sql`update public.consultant_meetings set starts_at = starts_at + interval '1 day', ends_at = ends_at + interval '1 day' where id = ${l.meetingId}::uuid`;
    expect(await send(l.leadId, `stops-${n}-b`, l.scheduledEventId, STOPS)).toEqual({ skipped: "stop_condition", stop: "meeting_rescheduled" });
    expect((await sql`select count(*)::int as c from public.consultant_messages where client_id = ${l.leadId}::uuid`)[0].c).toBe(0);
  });

  test("the clinic replied after the event → skipped (lead_replied)", async () => {
    const l = await leadWithMeeting();
    await sql`insert into public.consultant_audit_log (actor_kind, action, entity, entity_id, at)
              values ('twilio', 'emma.inbound_reply', 'lead', ${l.leadId}, now() + interval '1 second')`;
    expect(await send(l.leadId, `stops-${n}-c`, l.scheduledEventId, STOPS)).toEqual({ skipped: "stop_condition", stop: "lead_replied" });
  });

  test("deal moved forward → skipped (stage_advanced); deal lost → skipped (lead_lost)", async () => {
    const l1 = await leadWithMeeting();
    await sql`update public.clients set sales_stage = 'proposal' where id = ${l1.leadId}::uuid`;
    expect(await send(l1.leadId, `stops-${n}-d`, l1.scheduledEventId, STOPS)).toEqual({ skipped: "stop_condition", stop: "stage_advanced" });
    const l2 = await leadWithMeeting();
    await sql`update public.clients set sales_stage = 'lost' where id = ${l2.leadId}::uuid`;
    expect(await send(l2.leadId, `stops-${n}-e`, l2.scheduledEventId, STOPS)).toEqual({ skipped: "stop_condition", stop: "lead_lost" });
  });

  test("a replay of a stopped step returns the same answer (idempotent) and the skip is audited without PII", async () => {
    const l = await leadWithMeeting();
    await sql`update public.consultant_meetings set status = 'cancelled' where id = ${l.meetingId}::uuid`;
    const key = `stops-${n}-f`;
    const first = await send(l.leadId, key, l.scheduledEventId, STOPS);
    const again = await send(l.leadId, key, l.scheduledEventId, STOPS);
    expect(first).toEqual({ skipped: "stop_condition", stop: "meeting_rescheduled" });
    expect(again).toEqual(first);
    const audits = await sql<{ m: string }[]>`select meta::text as m from public.consultant_audit_log where action = 'n8n.emma.send' and entity_id = ${l.leadId}`;
    expect(audits.length).toBe(1);
    expect(audits[0].m).not.toMatch(/\+27|@internal|Thu 2 Oct/);
  });
});
