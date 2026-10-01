/**
 * Wave 2 · Agent 4.1 — events + Emma end to end against a REAL Postgres and a REAL local HTTP
 * receiver (no fetch mock on the event path):
 *   stage change → outbox event + 2 deliveries → dispatcher → signed POST → receiver verifies
 *   `X-VS-Signature` with `verifyBody`; receiver 500 → backoff → dead → admin retry → delivered;
 *   n8n ingress signed + idempotent (`leads.import` from Apollo, `emma.send` consent paths);
 *   inbound STOP → opted out with exactly one confirmation.
 * Twilio is mocked only at the fetch boundary (`sendDueMessages({ fetchImpl })`).
 * Skipped unless CONSULTANT_IT_PG_URL is set (see harness.ts).
 */
import "./mocks";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
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
  twilioReq,
  type Member,
  type TestDb,
} from "./harness";
import { signBody, verifyBody } from "@/lib/consultant/auth/signing";
import { permissionsFor } from "@/lib/admin/roles";
import { portalStatusValues } from "@/lib/consultant/config";
import { ensureConsultantSchema } from "@/lib/consultant/schema";
import { resetSingletonPool } from "@/lib/crm/db";
import { dispatchDue } from "@/lib/consultant/server/events/dispatch";
import { sendDueMessages } from "@/lib/consultant/server/emma/sender";
import * as leadsRoute from "@/app/api/consultant/leads/route";
import * as leadRoute from "@/app/api/consultant/leads/[id]/route";
import * as claimRoute from "@/app/api/consultant/leads/[id]/claim/route";
import * as callRoute from "@/app/api/consultant/calls/[id]/route";
import * as ingressRoute from "@/app/api/webhooks/n8n-ingress/route";
import * as inboundRoute from "@/app/api/webhooks/emma-inbound/route";
import * as retryRoute from "@/app/api/consultant/admin/dead-letters/[kind]/[id]/retry/route";
import type { Lead } from "@/lib/consultant/types";

applyTestEnv();
const N8N_SECRET = "it-e2e-n8n-secret-0123456789";
const EMMA_SECRET = "it-e2e-emma-owner-secret-9876543210";
process.env.N8N_SIGNING_SECRET = N8N_SECRET;
process.env.EMMA_EVENTS_SECRET = EMMA_SECRET;
process.env.TWILIO_WHATSAPP_FROM = "+27100000001";
delete process.env.EMMA_DRY_RUN; // real send path; Twilio is faked at fetch

type Received = { path: string; verified: boolean; eventId: string | null; type: string | null; raw: string };

/** A real HTTP receiver that verifies the signature exactly like n8n / EMMA must. */
function startReceiver() {
  const received: Received[] = [];
  const status: Record<string, number> = { "/n8n": 200, "/emma": 200 };
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const path = req.url ?? "";
      const secret = path === "/n8n" ? N8N_SECRET : EMMA_SECRET;
      const sig = req.headers["x-vs-signature"];
      const verified = verifyBody(secret, raw, typeof sig === "string" ? sig : null, 300);
      let parsed: { id?: string; type?: string } = {};
      try {
        parsed = JSON.parse(raw);
      } catch {
        // recorded as unparsed
      }
      received.push({ path, verified, eventId: parsed.id ?? null, type: parsed.type ?? null, raw });
      res.statusCode = verified ? (status[path] ?? 404) : 401;
      res.end();
    });
  });
  return { server, received, status };
}

describeDb("wave 2 · events + Emma end to end (real Postgres, real HTTP receiver)", () => {
  let tdb: TestDb;
  let sql: Sql;
  let A: Member, M: Member;
  const rx = startReceiver();
  let base = "";
  const twilioCalls: { url: string; form: URLSearchParams }[] = [];
  const twilioFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    twilioCalls.push({ url: String(url), form: new URLSearchParams(String(init?.body ?? "")) });
    return new Response(JSON.stringify({ sid: `SM${String(twilioCalls.length).padStart(32, "0")}` }), { status: 201 });
  }) as typeof fetch;

  beforeAll(async () => {
    await new Promise<void>((r) => rx.server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(rx.server.address() as AddressInfo).port}`;
    process.env.N8N_EVENTS_WEBHOOK_URL = `${base}/n8n`;
    process.env.EMMA_EVENTS_URL = `${base}/emma`;
    tdb = await createTestDatabase();
    sql = tdb.sql;
    process.env.DATABASE_URL = tdb.url;
    await ensureConsultantSchema(sql, portalStatusValues());
    A = await insertMember(sql, "alicee2e", "sales_consultant", "Alice E2E");
    M = await insertMember(sql, "opse2e", "systems_ops", "Sipho Systems");
  }, 60_000);

  afterAll(async () => {
    delete process.env.N8N_EVENTS_WEBHOOK_URL;
    delete process.env.EMMA_EVENTS_URL;
    delete process.env.CONSULTANT_EVENT_MAX_ATTEMPTS;
    await new Promise<void>((r) => rx.server.close(() => r()));
    await resetSingletonPool();
    await tdb?.drop();
  });

  let phoneN = 0;
  async function newLead(source: string): Promise<{ id: string; phone: string }> {
    phoneN++;
    const phone = `+2783${String(7000000 + phoneN)}`;
    const rows = await sql<{ id: string }[]>`
      insert into public.clients (name, company, email, phone, vertical, sales_stage, sales_stage_changed_at, status, consultant_id, assigned_to, lead_source)
      values (${`E2E Clinic ${phoneN}`}, ${`E2E Clinic ${phoneN}`}, ${`e2e${phoneN}@internal.vantagestack`}, ${phone}, 'clinics', 'new', now(), 'lead',
        ${A.id}::uuid, ${A.username}, ${source})
      returning id::text`;
    return { id: rows[0].id, phone };
  }

  function signed(payload: unknown, secret = N8N_SECRET, nowSec?: number): Request {
    const raw = JSON.stringify(payload);
    return new Request("http://localhost/api/webhooks/n8n-ingress", {
      method: "POST",
      headers: { "content-type": "application/json", "x-vs-signature": signBody(secret, raw, nowSec) },
      body: raw,
    });
  }
  const ingress = async (payload: unknown) => {
    const res = await ingressRoute.POST(signed(payload));
    return { status: res.status, body: (await res.json()) as { ok?: boolean; replay?: boolean; result?: Record<string, unknown> } };
  };

  test("stage change → one event + 2 deliveries in the same transaction → after() delivers, both receivers verify the signature", async () => {
    afterTasks.tasks.length = 0;
    await sql`update public.consultant_event_deliveries set status = 'sent'`;
    actAs(consultantSession(A));
    const created = await leadsRoute.POST(jsonReq("POST", "/api/consultant/leads", { clinicName: "Signal Skin", phone: "082 600 0101" }));
    expect(created.status).toBe(201);
    const lead = await body<Lead>(created);
    rx.received.length = 0;
    await sql`update public.consultant_event_deliveries set status = 'sent'`; // only the stage change from here
    afterTasks.tasks.length = 0;

    const res = await leadRoute.PATCH(jsonReq("PATCH", "/x", { salesStage: "contacted" }), ctx(lead.id));
    expect(res.status).toBe(200);
    const events = await sql<{ id: string; payload: Record<string, unknown> }[]>`
      select id::text, payload from public.consultant_events where client_id = ${lead.id}::uuid and type = 'lead.stage_changed'`;
    expect(events.length).toBe(1);
    const deliveries = await sql`select target, status from public.consultant_event_deliveries where event_id = ${events[0].id}::uuid order by target`;
    expect(deliveries.map((d) => `${d.target}:${d.status}`)).toEqual(["emma_owner:pending", "n8n:pending"]);
    expect(events[0].payload).toMatchObject({ id: events[0].id, type: "lead.stage_changed", vertical: "clinics" });
    expect(JSON.stringify(events[0].payload)).not.toMatch(/\+27|600 ?0101|@internal/); // no PII in events

    await drainAfter(); // the request's after() kick — no cron needed
    const got = rx.received.filter((r) => r.eventId === events[0].id);
    expect(got.map((r) => r.path).sort()).toEqual(["/emma", "/n8n"]);
    expect(got.every((r) => r.verified)).toBe(true);
    expect((await sql`select count(*)::int as n from public.consultant_event_deliveries where event_id = ${events[0].id}::uuid and status = 'sent'`)[0].n).toBe(2);

    // The receiver's check is meaningful: a body altered in transit, or the other target's secret, fails.
    const raw = got[0].raw;
    const header = signBody(N8N_SECRET, raw);
    expect(verifyBody(N8N_SECRET, raw.replace("contacted", "paid"), header, 300)).toBe(false);
    expect(verifyBody(EMMA_SECRET, raw, header, 300)).toBe(false);
    expect(verifyBody(N8N_SECRET, raw, signBody(N8N_SECRET, raw, Math.floor(Date.now() / 1000) - 3600), 300)).toBe(false);
  });

  test("claim and a wrap-up stage move are delivered by the request's after() kick too (staging has no cron)", async () => {
    await sql`update public.consultant_event_deliveries set status = 'sent' where status = 'pending'`;
    const [pool] = await sql<{ id: string }[]>`
      insert into public.clients (name, company, email, phone, vertical, sales_stage, sales_stage_changed_at, status, lead_source)
      values ('Pool Clinic', 'Pool Clinic', 'pool-e2e@internal.vantagestack', '+27836000777', 'clinics', 'new', now(), 'lead', 'public_scrape')
      returning id::text`;
    await sql`update public.consultant_event_deliveries set status = 'sent' where status = 'pending'`;
    rx.received.length = 0;
    afterTasks.tasks.length = 0;
    actAs(consultantSession(A));
    expect((await claimRoute.POST(jsonReq("POST", "/x"), ctx(pool.id))).status).toBe(200);
    const [call] = await sql<{ id: string }[]>`
      insert into public.consultant_calls (client_id, consultant_id, to_number, status, ended_at)
      values (${pool.id}::uuid, ${A.id}::uuid, '+27836000777', 'completed', now()) returning id::text`;
    expect((await callRoute.PATCH(jsonReq("PATCH", "/x", { salesStage: "contacted" }), ctx(call.id))).status).toBe(200);
    await drainAfter();
    const types = rx.received.filter((r) => r.path === "/n8n").map((r) => r.type).sort();
    expect(types).toEqual(["lead.claimed", "lead.stage_changed"]);
    expect((await sql`select count(*)::int as n from public.consultant_event_deliveries where status = 'pending'`)[0].n).toBe(0);
  });

  test("receiver 500 → exponential backoff → dead after max → admin retry re-queues → delivered exactly once", async () => {
    process.env.CONSULTANT_EVENT_MAX_ATTEMPTS = "3";
    await sql`update public.consultant_event_deliveries set status = 'sent' where status = 'pending'`;
    const { id } = await newLead("public_scrape");
    await leadRoute.PATCH(jsonReq("PATCH", "/x", { salesStage: "contacted" }), ctx(id));
    const [ev] = await sql<{ id: string }[]>`select id::text from public.consultant_events where client_id = ${id}::uuid and type = 'lead.stage_changed'`;
    await sql`update public.consultant_event_deliveries set status = 'sent' where event_id <> ${ev.id}::uuid and status = 'pending'`;
    rx.status["/n8n"] = 500;
    rx.received.length = 0;

    const delays: number[] = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
      await sql`update public.consultant_event_deliveries set next_attempt_at = now() where event_id = ${ev.id}::uuid and status = 'pending'`;
      const r = await dispatchDue(sql);
      const [d] = await sql<{ status: string; attempts: number; last_error: string; wait: number }[]>`
        select status, attempts, last_error, extract(epoch from (next_attempt_at - now()))::float as wait
        from public.consultant_event_deliveries where event_id = ${ev.id}::uuid and target = 'n8n'`;
      expect(d.attempts).toBe(attempt);
      expect(d.last_error).toBe("http_500");
      if (attempt < 3) {
        expect(r.retried).toBeGreaterThanOrEqual(1);
        expect(d.status).toBe("pending");
        delays.push(d.wait);
      } else {
        expect(r.dead).toBe(1);
        expect(d.status).toBe("dead");
      }
    }
    expect(delays[1]).toBeGreaterThan(delays[0] * 1.5); // exponential, not fixed
    expect(rx.received.filter((r) => r.path === "/n8n" && r.eventId === ev.id).length).toBe(3);
    expect(rx.received.filter((r) => r.path === "/emma" && r.eventId === ev.id).length).toBe(1); // the healthy target was not re-sent
    expect(rx.received.every((r) => r.verified)).toBe(true);

    // dead is terminal: the dispatcher never picks it up again
    expect((await dispatchDue(sql)).claimed).toBe(0);

    // A consultant can't retry; Systems & Operations (view_system_health) can.
    actAs(consultantSession(A));
    const params = { params: Promise.resolve({ kind: "event", id: ev.id }) };
    expect((await retryRoute.POST(jsonReq("POST", "/x"), params)).status).toBe(403);
    actAs({ ...managerSession(M), role: "systems_ops", canCall: false, permissions: permissionsFor("systems_ops") });
    const retried = await retryRoute.POST(jsonReq("POST", "/x"), { params: Promise.resolve({ kind: "event", id: ev.id }) });
    expect(retried.status).toBe(200);
    expect((await sql`select status, attempts from public.consultant_event_deliveries where event_id = ${ev.id}::uuid and target = 'n8n'`)[0]).toMatchObject({ status: "pending", attempts: 0 });
    expect((await sql`select 1 from public.consultant_audit_log where action = 'dead_letter.retry_event' and entity_id = ${ev.id}`).length).toBe(1);

    rx.status["/n8n"] = 200;
    afterTasks.tasks.length = 0;
    expect((await dispatchDue(sql)).sent).toBe(1);
    expect((await dispatchDue(sql)).claimed).toBe(0);
    expect(rx.received.filter((r) => r.path === "/n8n" && r.eventId === ev.id).length).toBe(4); // 3 failed + 1 delivered
    expect((await sql`select status from public.consultant_event_deliveries where event_id = ${ev.id}::uuid and target = 'n8n'`)[0].status).toBe("sent");
    delete process.env.CONSULTANT_EVENT_MAX_ATTEMPTS;
  });

  test("n8n ingress: unsigned / wrong secret / stale → 401 and nothing runs; leads.import (apollo) is idempotent", async () => {
    const batch = {
      provider: "apollo",
      leads: [
        { businessName: "Apollo Aesthetics", phone: "021 555 0144", email: "info@apollo-aesthetics.example", website: "apollo-aesthetics.example", address: null, placeId: null, ownerName: null, contactName: "Dr Mokoena", contactRole: "Owner", sourceUrl: "https://apollo.example/org/1" },
        { businessName: "Offshore Clinic", phone: "+44 20 7946 0000", email: null, website: null, address: null, placeId: null, ownerName: null, sourceUrl: "https://apollo.example/org/2" },
      ],
    };
    const payload = { action: "leads.import", idempotencyKey: "apollo-batch-0001", batch };
    const raw = JSON.stringify(payload);
    const unsigned = new Request("http://localhost/api/webhooks/n8n-ingress", { method: "POST", headers: { "content-type": "application/json" }, body: raw });
    expect((await ingressRoute.POST(unsigned)).status).toBe(401);
    expect((await ingressRoute.POST(signed(payload, "not-the-secret"))).status).toBe(401);
    expect((await ingressRoute.POST(signed(payload, N8N_SECRET, Math.floor(Date.now() / 1000) - 3600))).status).toBe(401);
    expect((await sql`select count(*)::int as n from public.clients where phone = '+27215550144'`)[0].n).toBe(0);

    const first = await ingress(payload);
    expect(first.status).toBe(200);
    expect(first.body.result).toMatchObject({ imported: 1, duplicates: 0, rejectedNonZaPhone: 1 });
    const replay = await ingress(payload);
    expect(replay.body).toMatchObject({ replay: true, result: { imported: 1 } });
    const rows = await sql`select consultant_id, sales_stage, lead_source, source, source_url from public.clients where phone = '+27215550144'`;
    expect(rows).toEqual([{ consultant_id: null, sales_stage: "new", lead_source: "public_scrape", source: "apollo", source_url: "https://apollo.example/org/1" }]);
    // Same clinics under a NEW key: deduped, not duplicated.
    const again = await ingress({ ...payload, idempotencyKey: "apollo-batch-0002" });
    expect(again.body.result).toMatchObject({ imported: 0, duplicates: 1 });
    const audits = await sql<{ m: string }[]>`select meta::text as m from public.consultant_audit_log where action = 'n8n.leads.import'`;
    expect(audits.length).toBe(2);
    for (const a of audits) expect(a.m).not.toMatch(/\+27|555 ?0144|apollo-aesthetics|Mokoena/);
  });

  test("emma.send: inbound social lead queued; scraped lead skipped no_consent → wrap-up consent → queued + sent via Twilio; STOP → opted_out + exactly one confirmation", async () => {
    await sql`update public.consultant_messages set status = 'sent' where status in ('queued', 'failed', 'sending')`;
    twilioCalls.length = 0;
    const send = (leadId: string, key: string) => ingress({ action: "emma.send", idempotencyKey: key, leadId, template: "lead_proposal_nudge", variables: {} });

    // (a) inbound social enquiry → Emma may follow up
    const social = await newLead("social_inbound");
    const a = await send(social.id, "e2e-social-0001");
    expect(a.body.result).toMatchObject({ status: "queued" });

    // (b) outbound public-domain lead, no consent → skipped, recorded (never dropped silently)
    const scraped = await newLead("public_scrape");
    const b = await send(scraped.id, "e2e-scrape-0001");
    expect(b.body.result).toMatchObject({ skipped: "no_consent" });
    expect((await sql`select status, last_error from public.consultant_messages where id = ${b.body.result!.messageId as string}::uuid`)[0]).toEqual({ status: "skipped", last_error: "no_consent" });

    // (c) the consultant ticks "agreed to WhatsApp follow-up" on the wrap-up
    const [call] = await sql<{ id: string }[]>`
      insert into public.consultant_calls (client_id, consultant_id, to_number, status, ended_at)
      values (${scraped.id}::uuid, ${A.id}::uuid, ${scraped.phone}, 'completed', now()) returning id::text`;
    actAs(consultantSession(A));
    expect((await callRoute.PATCH(jsonReq("PATCH", "/x", { whatsappConsent: true }), ctx(call.id))).status).toBe(200);
    const c = await send(scraped.id, "e2e-scrape-0002");
    expect(c.body.result).toMatchObject({ status: "queued" });

    const rep = await sendDueMessages(sql, { fetchImpl: twilioFetch });
    expect(rep.sent).toBe(2);
    expect(twilioCalls.length).toBe(2);
    for (const t of twilioCalls) {
      expect(t.url).toMatch(/^https:\/\/api\.twilio\.com\/2010-04-01\/Accounts\/AC0+\/Messages\.json$/);
      expect(t.form.get("From")).toBe("whatsapp:+27100000001");
      expect(t.form.get("To")).toMatch(/^whatsapp:\+27\d{9}$/);
    }
    expect(twilioCalls.map((t) => t.form.get("To")).sort()).toEqual([`whatsapp:${social.phone}`, `whatsapp:${scraped.phone}`].sort());

    // (d) the clinic replies STOP (twice — Twilio retries happen); signed like Twilio signs
    const stop = (sid: string) => twilioReq("/api/webhooks/emma-inbound", { From: `whatsapp:${scraped.phone}`, To: "whatsapp:+27100000001", Body: "STOP", MessageSid: sid });
    expect((await inboundRoute.POST(stop("SMe2e0000000000000000000000000001"))).status).toBe(200);
    expect((await inboundRoute.POST(stop("SMe2e0000000000000000000000000002"))).status).toBe(200);
    expect((await sql`select opted_out_at is not null as out from public.consultant_contact_consent where client_id = ${scraped.id}::uuid`)[0].out).toBe(true);

    const d = await send(scraped.id, "e2e-scrape-0003");
    expect(d.body.result).toMatchObject({ skipped: "opted_out" });
    twilioCalls.length = 0;
    await sendDueMessages(sql, { fetchImpl: twilioFetch });
    const confirmations = await sql`select status from public.consultant_messages where client_id = ${scraped.id}::uuid and template = 'lead_opt_out_confirmation'`;
    expect(confirmations).toEqual([{ status: "sent" }]);
    expect(twilioCalls.length).toBe(1); // only the STOP confirmation went out
    expect(twilioCalls[0].form.get("To")).toBe(`whatsapp:${scraped.phone}`);
    // A later consent tick can't undo an opt-out.
    await callRoute.PATCH(jsonReq("PATCH", "/x", { whatsappConsent: true }), ctx(call.id));
    expect((await send(scraped.id, "e2e-scrape-0004")).body.result).toMatchObject({ skipped: "opted_out" });

    // POPIA: no phone numbers or message bodies in the audit trail or the outbox events
    const audit = await sql<{ m: string }[]>`select meta::text as m from public.consultant_audit_log where entity_id in (${scraped.id}, ${social.id}) or meta->>'leadId' in (${scraped.id}, ${social.id})`;
    expect(audit.length).toBeGreaterThan(0);
    for (const r of audit) expect(r.m).not.toMatch(/\+27|STOP|Reply/);
    const evs = await sql<{ p: string }[]>`select payload::text as p from public.consultant_events where client_id in (${scraped.id}::uuid, ${social.id}::uuid)`;
    for (const e of evs) expect(e.p).not.toMatch(/\+27|STOP/);
  });
});
