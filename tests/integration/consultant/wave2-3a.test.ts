/**
 * Wave 2 · Agent 3A against a REAL Postgres: outbox dispatcher (claim / backoff / dead-letter /
 * retry / no double-send), payment + commission, n8n ingress idempotency, Emma consent gate +
 * STOP handling + dry-run sending, tier awarding idempotency, lead insights.
 * Skipped unless CONSULTANT_IT_PG_URL is set (see harness.ts).
 *
 * This file registers its own session mock (instead of ./mocks) because it needs the wave-2
 * `permission` guard and `permissions` on the session.
 */
type Sess = { memberId: string | null; isManager: boolean; canCall: boolean; permissions: string[] } | null;

jest.mock("@/lib/consultant/auth/session", () => {
  const { NextResponse } = jest.requireActual("next/server");
  const deny = (status: number, error: string) => NextResponse.json({ error }, { status });
  return {
    __esModule: true,
    requireConsultant: async (opts?: { manager?: boolean; call?: boolean; permission?: string }) => {
      const s = (globalThis as { __3aSession?: Sess }).__3aSession ?? null;
      if (!s) return deny(401, "Unauthorized");
      if (opts?.manager && !s.isManager) return deny(403, "Managers only");
      if (opts?.permission && !s.permissions.includes(opts.permission)) return deny(403, "Forbidden");
      return s;
    },
  };
});

jest.mock("next/server", () => {
  const actual = jest.requireActual("next/server");
  return {
    ...actual,
    after: (fn: () => unknown) => {
      (globalThis as { __3aAfter?: (() => unknown)[] }).__3aAfter?.push(fn);
    },
  };
});

import type { Sql } from "postgres";
import { applyTestEnv, createTestDatabase, describeDb, insertMember, twilioReq, type Member, type TestDb } from "./harness";
import { signBody } from "@/lib/consultant/auth/signing";
import { portalStatusValues } from "@/lib/consultant/config";
import { ensureConsultantSchema } from "@/lib/consultant/schema";
import { resetSingletonPool } from "@/lib/crm/db";
import { dispatchDue } from "@/lib/consultant/server/events/dispatch";
import { sendDueMessages } from "@/lib/consultant/server/emma/sender";
import { awardTiers } from "@/lib/consultant/server/repo/rewards";
import { metricValue } from "@/lib/consultant/server/repo/metrics";
import * as paymentRoute from "@/app/api/consultant/deals/[leadId]/payment/route";
import * as ingressRoute from "@/app/api/webhooks/n8n-ingress/route";
import * as inboundRoute from "@/app/api/webhooks/emma-inbound/route";
import * as retryRoute from "@/app/api/consultant/admin/dead-letters/[kind]/[id]/retry/route";
import * as leadRoute from "@/app/api/consultant/leads/[id]/route";
import * as wrapUpRoute from "@/app/api/consultant/calls/[id]/route";
import * as metricsRoute from "@/app/api/consultant/metrics/route";
import * as leaderboardRoute from "@/app/api/consultant/leaderboard/route";
import * as healthRoute from "@/app/api/consultant/admin/health/route";
import * as deadLettersRoute from "@/app/api/consultant/admin/dead-letters/route";
import * as settingsRoute from "@/app/api/consultant/settings/gamification/route";
import * as messagesRoute from "@/app/api/consultant/messages/route";
import type { Deal, FunnelMetrics, Leaderboard, LeadDetail, SystemHealth } from "@/lib/consultant/types";

applyTestEnv();
const N8N_SECRET = "it-n8n-secret";
process.env.N8N_SIGNING_SECRET = N8N_SECRET;
process.env.EMMA_DRY_RUN = "true";
(globalThis as { __3aAfter?: (() => unknown)[] }).__3aAfter = [];

function actAs(m: Member | null, opts: { manager?: boolean; permissions?: string[] } = {}) {
  (globalThis as { __3aSession?: Sess }).__3aSession = m
    ? { memberId: m.id, username: m.username, displayName: m.displayName, role: opts.manager ? "agent_manager" : "sales_consultant", isManager: !!opts.manager, canCall: true, permissions: opts.permissions ?? [] } as unknown as Sess
    : null;
}

const json = (method: string, path: string, body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });

describeDb("wave 2 · 3A integrations (real Postgres)", () => {
  let tdb: TestDb;
  let sql: Sql;
  let A: Member, M: Member;
  let seq = 0;

  beforeAll(async () => {
    tdb = await createTestDatabase();
    sql = tdb.sql;
    process.env.DATABASE_URL = tdb.url;
    await ensureConsultantSchema(sql, portalStatusValues());
    A = await insertMember(sql, "alice3a", "sales_consultant", "Alice Achiever");
    M = await insertMember(sql, "mandy3a", "agent_manager", "Mandy Manager");
  }, 60_000);

  afterAll(async () => {
    await resetSingletonPool();
    await tdb?.drop();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.N8N_EVENTS_WEBHOOK_URL;
    delete process.env.CONSULTANT_EVENT_MAX_ATTEMPTS;
  });

  async function lead(opts: { stage?: string; source?: string; consultant?: Member | null } = {}): Promise<string> {
    seq++;
    const rows = await sql<{ id: string }[]>`
      insert into public.clients (name, company, email, phone, vertical, sales_stage, sales_stage_changed_at, status, consultant_id, lead_source)
      values (${`Clinic ${seq}`}, ${`Clinic ${seq}`}, ${`c${seq}-${Date.now()}@example.test`}, ${`+2782${String(1000000 + seq).slice(-7)}`},
        'clinics', ${opts.stage ?? "new"}, now(), 'lead', ${opts.consultant === null ? null : (opts.consultant ?? A).id}::uuid, ${opts.source ?? "public_scrape"})
      returning id::text
    `;
    return rows[0].id;
  }

  // ── Dispatcher ────────────────────────────────────────────────────────────

  it("dispatcher: backoff on failure, sent on 2xx, unconfigured target left pending", async () => {
    await sql`update public.consultant_event_deliveries set status = 'sent'`; // isolate from earlier inserts
    process.env.N8N_EVENTS_WEBHOOK_URL = "https://n8n.example/hook";
    const id = await lead();
    const ev = await sql<{ id: string }[]>`select id::text from public.consultant_events where client_id = ${id}::uuid and type = 'lead.created'`;
    expect(ev.length).toBe(1);

    let status = 500;
    const fetchImpl = jest.fn(async () => new Response(null, { status })) as unknown as typeof fetch;
    let r = await dispatchDue(sql, { fetchImpl });
    expect(r).toMatchObject({ claimed: 1, retried: 1, sent: 0, skipped: { emma_owner: "url_not_configured" } });
    let d = await sql`select status, attempts, last_error, next_attempt_at > now() as later from public.consultant_event_deliveries where event_id = ${ev[0].id}::uuid and target = 'n8n'`;
    expect(d[0]).toMatchObject({ status: "pending", attempts: 1, last_error: "http_500", later: true });

    // not due yet → nothing claimed
    expect((await dispatchDue(sql, { fetchImpl })).claimed).toBe(0);

    await sql`update public.consultant_event_deliveries set next_attempt_at = now() where event_id = ${ev[0].id}::uuid`;
    status = 204;
    r = await dispatchDue(sql, { fetchImpl });
    expect(r.sent).toBe(1);
    d = await sql`select status, sent_at is not null as sent from public.consultant_event_deliveries where event_id = ${ev[0].id}::uuid order by target`;
    expect(d.map((x) => x.status)).toEqual(["pending", "sent"]); // emma_owner untouched (pending), n8n sent
    const call = (fetchImpl as unknown as jest.Mock).mock.calls[1][1] as RequestInit;
    const payload = JSON.parse(call.body as string);
    expect(payload).toMatchObject({ id: ev[0].id, type: "lead.created", vertical: "clinics" });
    expect(JSON.stringify(payload)).not.toMatch(/\+27|@example/); // no phone / email in events
  });

  it("dispatcher: dead after max attempts, retryable from admin; concurrent runs never double-send", async () => {
    await sql`update public.consultant_event_deliveries set status = 'sent' where status = 'pending'`;
    process.env.N8N_EVENTS_WEBHOOK_URL = "https://n8n.example/hook";
    process.env.CONSULTANT_EVENT_MAX_ATTEMPTS = "2";
    const id = await lead();
    const [ev] = await sql<{ id: string }[]>`select id::text from public.consultant_events where client_id = ${id}::uuid`;
    const failing = jest.fn(async () => new Response(null, { status: 503 })) as unknown as typeof fetch;
    await dispatchDue(sql, { fetchImpl: failing });
    await sql`update public.consultant_event_deliveries set next_attempt_at = now() where event_id = ${ev.id}::uuid`;
    const r = await dispatchDue(sql, { fetchImpl: failing });
    expect(r.dead).toBe(1);
    expect((await sql`select status from public.consultant_event_deliveries where event_id = ${ev.id}::uuid and target = 'n8n'`)[0].status).toBe("dead");

    actAs(A);
    expect((await retryRoute.POST(json("POST", "/x"), { params: Promise.resolve({ kind: "event", id: ev.id }) })).status).toBe(403);
    actAs(M, { manager: true, permissions: ["view_system_health"] });
    const res = await retryRoute.POST(json("POST", "/x"), { params: Promise.resolve({ kind: "event", id: ev.id }) });
    expect(res.status).toBe(200);
    expect((await sql`select status, attempts from public.consultant_event_deliveries where event_id = ${ev.id}::uuid and target = 'n8n'`)[0]).toMatchObject({ status: "pending", attempts: 0 });
    expect((await retryRoute.POST(json("POST", "/x"), { params: Promise.resolve({ kind: "event", id: ev.id }) })).status).toBe(409);

    // five more events, two concurrent dispatchers: each delivery POSTed exactly once
    for (let i = 0; i < 5; i++) await lead();
    const ok = jest.fn(async () => {
      await new Promise((r2) => setTimeout(r2, 5));
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;
    const [r1, r2] = await Promise.all([dispatchDue(sql, { fetchImpl: ok }), dispatchDue(sql, { fetchImpl: ok })]);
    expect(r1.sent + r2.sent).toBe(6);
    expect((ok as unknown as jest.Mock).mock.calls.length).toBe(6);
    const ids = (ok as unknown as jest.Mock).mock.calls.map((c) => (c[1] as RequestInit & { headers: Record<string, string> }).headers["X-VS-Event-Id"]);
    expect(new Set(ids).size).toBe(6);
  });

  // ── Payment + commission ──────────────────────────────────────────────────

  it("payment: permission, commission frozen + rounded, stage paid, events, idempotent replay, conflicts", async () => {
    const id = await lead({ stage: "proposal" });
    await sql`insert into public.deals (client_id, proposal_status, deal_value, service_type, vertical, consultant_id, sent_at)
              values (${id}::uuid, 'sent', 12000, 'x', 'clinics', ${A.id}::uuid, now())`;
    const input = { amount: 10002, reference: "EFT-001", paidAt: new Date(Date.now() - 3600_000).toISOString() };
    const ctx = { params: Promise.resolve({ leadId: id }) };

    actAs(A);
    expect((await paymentRoute.POST(json("POST", "/p", input), ctx)).status).toBe(403);

    actAs(M, { manager: true, permissions: ["confirm_payments"] });
    const res = await paymentRoute.POST(json("POST", "/p", input), { params: Promise.resolve({ leadId: id }) });
    expect(res.status).toBe(200);
    const deal = (await res.json()) as Deal;
    expect(deal).toMatchObject({ status: "paid", paymentAmount: 10002, commissionRate: 0.25, commissionAmount: 2501, confirmedByName: "Mandy Manager", consultantId: A.id });
    expect(deal.wonAt).not.toBeNull();
    const [c] = await sql`select sales_stage, status::text as status from public.clients where id = ${id}::uuid`;
    expect(c).toMatchObject({ sales_stage: "paid", status: "active-client" });
    const types = (await sql`select type from public.consultant_events where client_id = ${id}::uuid order by occurred_at`).map((r) => r.type);
    expect(types).toEqual(expect.arrayContaining(["deal.paid", "deal.won", "lead.stage_changed"]));
    expect((await sql`select 1 from public.consultant_audit_log where action = 'payment.confirmed' and meta->>'leadId' = ${id}`).length).toBe(1);

    // replay → same deal, no new events
    const before = (await sql`select count(*)::int as n from public.consultant_events where client_id = ${id}::uuid`)[0].n;
    expect((await paymentRoute.POST(json("POST", "/p", input), { params: Promise.resolve({ leadId: id }) })).status).toBe(200);
    expect((await sql`select count(*)::int as n from public.consultant_events where client_id = ${id}::uuid`)[0].n).toBe(before);
    // different reference → 409
    expect((await paymentRoute.POST(json("POST", "/p", { ...input, reference: "EFT-002" }), { params: Promise.resolve({ leadId: id }) })).status).toBe(409);
    // proof path not issued to this manager → 400
    const other = await lead({ stage: "won" });
    const bad = { ...input, proofPath: `payment_proof/${A.id}/00000000-0000-4000-8000-000000000000.pdf` };
    expect((await paymentRoute.POST(json("POST", "/p", bad), { params: Promise.resolve({ leadId: other }) })).status).toBe(400);
    // lost lead → 409
    const lost = await lead({ stage: "lost" });
    expect((await paymentRoute.POST(json("POST", "/p", input), { params: Promise.resolve({ leadId: lost }) })).status).toBe(409);

    expect(await metricValue(sql, A.id, "commission", new Date(Date.now() - 86_400_000).toISOString(), new Date(Date.now() + 1000).toISOString())).toBeGreaterThanOrEqual(2501);

    // GET leads/[id] carries score + deal + consent
    actAs(A);
    const detail = (await (await leadRoute.GET(json("GET", "/l"), { params: Promise.resolve({ id }) })).json()) as LeadDetail;
    expect(detail.lead.deal?.status).toBe("paid");
    expect(detail.lead.score).toMatchObject({ winProbability: 1, model: "heuristic-v1" });
    expect(detail.lead.messagingConsent).toBe("none");
  });

  // ── Tier awarding ─────────────────────────────────────────────────────────

  it("tier awarding is idempotent and emits reward.tier_achieved once", async () => {
    const B = await insertMember(sql, "bongi3a", "sales_consultant", "Bongi Big");
    const id = await lead({ stage: "won", consultant: B });
    await sql`insert into public.deals (client_id, proposal_status, deal_value, service_type, vertical, consultant_id, paid_at, payment_amount, commission_amount)
              values (${id}::uuid, 'accepted', 80000, 'x', 'clinics', ${B.id}::uuid, now(), 80000, 20000)`;
    await awardTiers(sql);
    await awardTiers(sql);
    const rewards = await sql`select tier from public.consultant_rewards where consultant_id = ${B.id}::uuid order by tier`;
    expect(rewards.map((r) => r.tier)).toEqual(["tier1_monthly_achiever", "tier2_high_performer"]);
    const ev = await sql`select count(*)::int as n from public.consultant_events where type = 'reward.tier_achieved' and consultant_id = ${B.id}::uuid`;
    expect(ev[0].n).toBe(2);
  });

  // ── n8n ingress ───────────────────────────────────────────────────────────

  function signed(body: unknown): Request {
    const raw = JSON.stringify(body);
    return new Request("http://localhost/api/webhooks/n8n-ingress", {
      method: "POST",
      headers: { "content-type": "application/json", "x-vs-signature": signBody(N8N_SECRET, raw) },
      body: raw,
    });
  }

  it("ingress: idempotent replay, consent gate result, key/action conflict, set_next_action", async () => {
    const ping = { action: "ping", idempotencyKey: "ping-key-0001" };
    const p1 = await ingressRoute.POST(signed(ping));
    expect(await p1.json()).toEqual({ ok: true, result: { pong: true } });
    expect(await (await ingressRoute.POST(signed(ping))).json()).toEqual({ ok: true, result: { pong: true }, replay: true });

    const scraped = await lead({ source: "public_scrape" });
    const send = { action: "emma.send", idempotencyKey: "seq-noshow-0001", leadId: scraped, template: "lead_no_show_reengage", variables: {} };
    const s1 = await (await ingressRoute.POST(signed(send))).json();
    expect(s1.result).toMatchObject({ skipped: "no_consent" });
    const s2 = await (await ingressRoute.POST(signed(send))).json();
    expect(s2).toMatchObject({ replay: true, result: { messageId: s1.result.messageId } });
    expect((await sql`select count(*)::int as n from public.consultant_messages where client_id = ${scraped}::uuid`)[0].n).toBe(1);
    expect((await sql`select status, last_error from public.consultant_messages where id = ${s1.result.messageId}::uuid`)[0]).toMatchObject({ status: "skipped", last_error: "no_consent" });

    const inbound = await lead({ source: "landing_page" });
    const s3 = await (await ingressRoute.POST(signed({ ...send, idempotencyKey: "seq-noshow-0002", leadId: inbound }))).json();
    expect(s3.result).toMatchObject({ status: "queued" });

    expect((await ingressRoute.POST(signed({ action: "ping", idempotencyKey: "seq-noshow-0002" }))).status).toBe(409);
    expect((await ingressRoute.POST(signed({ ...send, idempotencyKey: "seq-bad-tpl-01", leadId: inbound, template: "consultant_lead_replied" }))).status).toBe(400);
    expect((await ingressRoute.POST(signed({ ...send, idempotencyKey: "seq-missing-01", leadId: "00000000-0000-4000-8000-000000000000" }))).status).toBe(404);
    // a failed action does NOT burn the key
    expect((await sql`select 1 from public.consultant_ingress_keys where idempotency_key = 'seq-missing-01'`).length).toBe(0);

    const imp = {
      action: "leads.import",
      idempotencyKey: "import-batch-0001",
      batch: { provider: "serper", leads: [{ businessName: "Imported Aesthetics", phone: "082 555 0101", email: null, website: null, address: null, placeId: null, ownerName: null, sourceUrl: "https://maps.example/x" }] },
    };
    const i1 = await (await ingressRoute.POST(signed(imp))).json();
    expect(i1.result).toMatchObject({ imported: 1 });
    expect(await (await ingressRoute.POST(signed(imp))).json()).toMatchObject({ replay: true, result: { imported: 1 } });
    expect((await sql`select count(*)::int as n from public.clients where phone = '+27825550101'`)[0].n).toBe(1);
    expect((await sql`select meta->>'imported' as n from public.consultant_audit_log where action = 'n8n.leads.import'`)[0].n).toBe("1");

    const at = new Date(Date.now() + 86_400_000).toISOString();
    const na = await ingressRoute.POST(signed({ action: "lead.set_next_action", idempotencyKey: "next-act-0001", leadId: inbound, nextAction: "Call back", nextActionAt: at }));
    expect(na.status).toBe(200);
    expect((await sql`select next_action from public.clients where id = ${inbound}::uuid`)[0].next_action).toBe("Call back");
    expect((await sql`select count(*)::int as n from public.consultant_audit_log where actor_kind = 'n8n'`)[0].n).toBeGreaterThanOrEqual(4);
  });

  // ── Emma: call consent, STOP, send-time gate, dry-run send ────────────────

  it("emma: call consent → sendable; STOP opts out with ONE confirmation; queued messages then skip", async () => {
    const id = await lead({ source: "public_scrape" });
    const phone = (await sql`select phone from public.clients where id = ${id}::uuid`)[0].phone as string;
    const call = await sql<{ id: string }[]>`
      insert into public.consultant_calls (client_id, consultant_id, to_number, status, ended_at) values (${id}::uuid, ${A.id}::uuid, ${phone}, 'completed', now()) returning id::text`;
    actAs(A);
    const wr = await wrapUpRoute.PATCH(json("PATCH", "/c", { whatsappConsent: true }), { params: Promise.resolve({ id: call[0].id }) });
    expect(wr.status).toBe(200);
    expect((await sql`select source, opted_in_call_id::text as c from public.consultant_contact_consent where client_id = ${id}::uuid`)[0]).toMatchObject({ source: "call", c: call[0].id });

    // opted in → a queued message is sent (dry run)
    await sql`update public.consultant_messages set status = 'sent' where status in ('queued','failed','sending')`;
    const q = await (await ingressRoute.POST(signed({ action: "emma.send", idempotencyKey: `emma-${id}`, leadId: id, template: "lead_proposal_nudge", variables: {} }))).json();
    expect(q.result.status).toBe("queued");
    const rep = await sendDueMessages(sql);
    expect(rep.sent).toBe(1);
    expect((await sql`select status, twilio_sid from public.consultant_messages where id = ${q.result.messageId}::uuid`)[0].status).toBe("sent");

    // queue another, then the clinic replies STOP twice
    const q2 = await (await ingressRoute.POST(signed({ action: "emma.send", idempotencyKey: `emma2-${id}`, leadId: id, template: "lead_proposal_nudge", variables: {} }))).json();
    const stop = (sid: string) => twilioReq("/api/webhooks/emma-inbound", { From: `whatsapp:${phone}`, To: "whatsapp:+27100000000", Body: "STOP", MessageSid: sid });
    expect((await inboundRoute.POST(stop("SMaaaaaaaa1"))).status).toBe(200);
    expect((await inboundRoute.POST(stop("SMaaaaaaaa2"))).status).toBe(200);
    expect((await sql`select opted_out_at is not null as out from public.consultant_contact_consent where client_id = ${id}::uuid`)[0].out).toBe(true);
    const confirmations = await sql`select id from public.consultant_messages where client_id = ${id}::uuid and template = 'lead_opt_out_confirmation'`;
    expect(confirmations.length).toBe(1);

    // consultant consent on a later call cannot reverse the opt-out
    await wrapUpRoute.PATCH(json("PATCH", "/c", { whatsappConsent: true }), { params: Promise.resolve({ id: call[0].id }) });
    expect((await sql`select opted_out_at is not null as out from public.consultant_contact_consent where client_id = ${id}::uuid`)[0].out).toBe(true);

    await sendDueMessages(sql);
    expect((await sql`select status, last_error from public.consultant_messages where id = ${q2.result.messageId}::uuid`)[0]).toMatchObject({ status: "skipped", last_error: "opted_out" });
    expect((await sql`select status from public.consultant_messages where id = ${confirmations[0].id}::uuid`)[0].status).toBe("sent"); // transactional
    // bad signature → 403, nothing written
    expect((await inboundRoute.POST(twilioReq("/api/webhooks/emma-inbound", { From: `whatsapp:${phone}`, Body: "START", MessageSid: "SMbbb" }, "bad"))).status).toBe(403);
    expect((await sql`select opted_out_at is not null as out from public.consultant_contact_consent where client_id = ${id}::uuid`)[0].out).toBe(true);
    // no body text in the audit log
    const auditRows = await sql`select meta::text as m from public.consultant_audit_log where entity_id = ${id}`;
    for (const r of auditRows) expect(r.m).not.toMatch(/STOP|\+27/);
  });

  // ── Read models: metrics, leaderboard, settings, health, dead letters, messages ──

  it("metrics / leaderboard / settings / health / dead-letters / messages run against real SQL", async () => {
    actAs(A);
    const own = await metricsRoute.GET(json("GET", "/api/consultant/metrics?period=month"));
    expect(own.status).toBe(200);
    const f = (await own.json()) as FunnelMetrics;
    expect(f.paid).toBeGreaterThanOrEqual(1);
    expect(f.commission).toBeGreaterThanOrEqual(2501);
    expect(f.defaults).toEqual({ connectRate: 0.3, avgSale: 15000, commissionRate: 0.25, closeTargetFromConnects: 0.3 });
    expect(f.rates.closeFromConnects === null || typeof f.rates.closeFromConnects === "number").toBe(true);
    expect((await metricsRoute.GET(json("GET", "/api/consultant/metrics?consultantId=team"))).status).toBe(403);
    expect((await metricsRoute.GET(json("GET", "/api/consultant/metrics?period=year"))).status).toBe(400);

    actAs(M, { manager: true });
    const team = await (await metricsRoute.GET(json("GET", "/api/consultant/metrics?consultantId=team&period=quarter"))).json();
    expect(team.team.revenuePaid).toBeGreaterThanOrEqual(90002);
    expect(team.byConsultant.length).toBeGreaterThanOrEqual(2);

    actAs(A);
    const lb = (await (await leaderboardRoute.GET(json("GET", "/api/consultant/leaderboard?period=month&rankBy=revenue"))).json()) as Leaderboard;
    expect(lb.rows[0]).toMatchObject({ name: "Bongi Big", rank: 1, revenuePaid: 80000, commission: 20000 });
    expect(lb.rows[0].tiers.find((t) => t.tier === "tier2_high_performer")?.achieved).toBe(true);

    // settings: defaults, forbidden PUT, manager PUT, validation
    const defaults = await (await settingsRoute.GET()).json();
    expect(defaults.tier1.monthlyRevenue).toBe(30000);
    expect((await settingsRoute.PUT(json("PUT", "/s", defaults))).status).toBe(403);
    actAs(M, { manager: true, permissions: ["manage_gamification"] });
    expect((await settingsRoute.PUT(json("PUT", "/s", { ...defaults, quarterTarget: 300000 }))).status).toBe(200);
    expect((await (await settingsRoute.GET()).json()).quarterTarget).toBe(300000);
    expect((await settingsRoute.PUT(json("PUT", "/s", { ...defaults, quarterTarget: -1 }))).status).toBe(400);

    actAs(M, { manager: true, permissions: ["view_system_health"] });
    const h = (await (await healthRoute.GET()).json()) as SystemHealth;
    expect(h.database.ok).toBe(true);
    expect(h.n8n.configured).toBe(false);
    expect(h.emmaOwner.pending).toBeGreaterThan(0);
    const dl = await (await deadLettersRoute.GET()).json();
    expect(Array.isArray(dl.events) && Array.isArray(dl.messages)).toBe(true);

    // messages: owner sees history, another consultant doesn't
    const leadWithMsgs = (await sql`select client_id::text as id from public.consultant_messages where audience = 'lead' and client_id is not null limit 1`)[0].id as string;
    const owner = (await sql`select consultant_id::text as c from public.clients where id = ${leadWithMsgs}::uuid`)[0].c as string;
    actAs(owner === A.id ? A : M, { manager: owner !== A.id });
    const msgs = await (await messagesRoute.GET(json("GET", `/api/consultant/messages?leadId=${leadWithMsgs}`))).json();
    expect(msgs.length).toBeGreaterThan(0);
    expect(JSON.stringify(msgs)).not.toMatch(/\+27|Reply STOP/);
    const stranger = await insertMember(sql, "sam3a", "sales_consultant", "Sam Stranger");
    actAs(stranger);
    expect((await messagesRoute.GET(json("GET", `/api/consultant/messages?leadId=${leadWithMsgs}`))).status).toBe(404);
  });
});
