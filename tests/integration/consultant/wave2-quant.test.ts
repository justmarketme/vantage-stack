/**
 * Wave 2 · Agent 4.3 quant audit against a REAL Postgres — the numbers that decide payouts:
 * commission frozen at payment (a later rate change never rewrites it), `paid` only via the
 * payment route, exactly one deal + one deal.paid under concurrent confirmations, funnel ratios
 * from PAID deals, SAST month/quarter boundaries in SQL (incl. Dec → Jan), Tier 1/2 at the exact
 * thresholds, Tier 3 top-N with ties, idempotent awarding, leaderboard points from the live
 * settings, and fairness (no cross-crediting; a reassigned lead's paid deal stays with its seller).
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
  managerSession,
  runAs,
  type Member,
  type TestDb,
} from "./harness";
import { portalStatusValues } from "@/lib/consultant/config";
import { ensureConsultantSchema } from "@/lib/consultant/schema";
import { resetSingletonPool } from "@/lib/crm/db";
import { periodRange } from "@/lib/consultant/metrics/periods";
import { funnel, metricValue } from "@/lib/consultant/server/repo/metrics";
import { leaderboard } from "@/lib/consultant/server/repo/leaderboard";
import { awardTiers } from "@/lib/consultant/server/repo/rewards";
import * as paymentRoute from "@/app/api/consultant/deals/[leadId]/payment/route";
import * as leadRoute from "@/app/api/consultant/leads/[id]/route";
import * as callRoute from "@/app/api/consultant/calls/[id]/route";
import * as metricsRoute from "@/app/api/consultant/metrics/route";
import * as settingsRoute from "@/app/api/consultant/settings/gamification/route";
import * as goalsRoute from "@/app/api/consultant/goals/route";
import type { Deal, FunnelMetrics, GamificationSettings, Goal } from "@/lib/consultant/types";

applyTestEnv();

describeDb("wave 2 · quant audit (real Postgres)", () => {
  let tdb: TestDb;
  let sql: Sql;
  let A: Member, B: Member, M: Member;
  let seq = 0;

  beforeAll(async () => {
    tdb = await createTestDatabase();
    sql = tdb.sql;
    process.env.DATABASE_URL = tdb.url;
    await ensureConsultantSchema(sql, portalStatusValues());
    A = await insertMember(sql, "aliceq", "sales_consultant", "Alice Quant");
    B = await insertMember(sql, "bongaq", "sales_consultant", "Bonga Quant");
    M = await insertMember(sql, "mandyq", "agent_manager", "Mandy Manager");
  }, 60_000);

  afterAll(async () => {
    delete process.env.CONSULTANT_COMMISSION_RATE;
    await resetSingletonPool();
    await tdb?.drop();
  });

  async function lead(owner: Member | null, stage = "proposal"): Promise<string> {
    seq++;
    const rows = await sql<{ id: string }[]>`
      insert into public.clients (name, company, email, phone, vertical, sales_stage, sales_stage_changed_at, status, consultant_id, assigned_to, lead_source)
      values (${`Q Clinic ${seq}`}, ${`Q Clinic ${seq}`}, ${`q${seq}@internal.vantagestack`}, ${`+2784${String(1000000 + seq)}`},
        'clinics', ${stage}, now(), 'lead', ${owner?.id ?? null}::uuid, ${owner?.username ?? null}, 'public_scrape')
      returning id::text`;
    return rows[0].id;
  }
  const asManager = () => actAs(managerSession(M)); // agent_manager holds confirm_payments
  const pay = (leadId: string, amount: number, reference: string, paidAt = new Date(Date.now() - 60_000).toISOString()) =>
    paymentRoute.POST(jsonReq("POST", "/p", { amount, reference, paidAt }), { params: Promise.resolve({ leadId }) });
  const dealOf = async (leadId: string) =>
    (await sql`select consultant_id::text as c, payment_amount::int as amount, commission_rate::float as rate, commission_amount::int as commission from public.deals where client_id = ${leadId}::uuid`)[0];
  const today = () => ({ from: new Date(Date.now() - 86_400_000).toISOString(), to: new Date(Date.now() + 86_400_000).toISOString() });

  test("commission = round(amount × 25%) frozen at payment; a later rate change never recomputes it", async () => {
    asManager();
    const first = await lead(A);
    const r1 = await pay(first, 10002, "EFT-Q-001"); // 2500.5 → half-up → 2501
    expect(r1.status).toBe(200);
    expect(await body<Deal>(r1)).toMatchObject({ commissionRate: 0.25, commissionAmount: 2501, paymentAmount: 10002, consultantId: A.id });

    process.env.CONSULTANT_COMMISSION_RATE = "0.3";
    try {
      const second = await lead(A);
      expect(await body<Deal>(await pay(second, 10001, "EFT-Q-002"))).toMatchObject({ commissionRate: 0.3, commissionAmount: 3000 }); // 3000.3 → 3000
      // The first deal is untouched — also after an idempotent replay under the new rate.
      expect((await pay(first, 10002, "EFT-Q-001")).status).toBe(200);
      expect(await dealOf(first)).toMatchObject({ rate: 0.25, commission: 2501 });
      const { from, to } = today();
      expect(await metricValue(sql, A.id, "commission", from, to)).toBe(2501 + 3000);
      expect(await metricValue(sql, A.id, "revenue", from, to)).toBe(20003);
      const lb = await leaderboard(sql, "today", "revenue");
      expect(lb.rows.find((r) => r.consultantId === A.id)).toMatchObject({ commission: 5501, revenuePaid: 20003, dealsPaid: 2 });
    } finally {
      delete process.env.CONSULTANT_COMMISSION_RATE;
    }
  });

  test("`paid` is set only by the payment route: lead PATCH and wrap-up to/from paid → 409, nothing written", async () => {
    const id = await lead(A, "won");
    actAs(consultantSession(A));
    const toPaid = await leadRoute.PATCH(jsonReq("PATCH", "/x", { salesStage: "paid" }), ctx(id));
    expect(toPaid.status).toBe(409);
    asManager(); // not even a manager
    expect((await leadRoute.PATCH(jsonReq("PATCH", "/x", { salesStage: "paid" }), ctx(id))).status).toBe(409);
    const [call] = await sql<{ id: string }[]>`
      insert into public.consultant_calls (client_id, consultant_id, to_number, status, ended_at)
      values (${id}::uuid, ${A.id}::uuid, '+27841000000', 'completed', now()) returning id::text`;
    actAs(consultantSession(A));
    expect((await callRoute.PATCH(jsonReq("PATCH", "/x", { salesStage: "paid" }), ctx(call.id))).status).toBe(409);
    expect((await sql`select sales_stage from public.clients where id = ${id}::uuid`)[0].sales_stage).toBe("won");
    expect((await sql`select count(*)::int as n from public.deals where client_id = ${id}::uuid and paid_at is not null`)[0].n).toBe(0);

    asManager();
    expect((await pay(id, 15000, "EFT-Q-LOCK")).status).toBe(200);
    for (const stage of ["won", "lost", "proposal", "new"]) {
      actAs(consultantSession(A));
      expect((await leadRoute.PATCH(jsonReq("PATCH", "/x", { salesStage: stage }), ctx(id))).status).toBe(409);
    }
    // Other fields on a paid lead are still editable.
    expect((await leadRoute.PATCH(jsonReq("PATCH", "/x", { nextAction: "Onboarding call" }), ctx(id))).status).toBe(200);
    expect((await sql`select sales_stage from public.clients where id = ${id}::uuid`)[0].sales_stage).toBe("paid");
  });

  test("concurrent confirmations: exactly one deal, one deal.paid, one deal.won, one audit row; a racing different reference loses with 409", async () => {
    for (const withDeal of [false, true]) {
      const id = await lead(A, withDeal ? "proposal" : "won");
      if (withDeal) {
        await sql`insert into public.deals (client_id, proposal_status, deal_value, service_type, vertical, consultant_id, sent_at)
                  values (${id}::uuid, 'sent', 9000, 'x', 'clinics', ${A.id}::uuid, now())`;
      }
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          runAs(managerSession(M), () => pay(id, 9000, i === 9 ? "EFT-RACE-OTHER" : "EFT-RACE")),
        ),
      );
      const codes = results.map((r) => r.status);
      expect(codes.every((c) => c === 200 || c === 409)).toBe(true);
      const winners = await sql`select payment_reference from public.deals where client_id = ${id}::uuid`;
      expect(winners.length).toBe(1);
      // Whichever reference committed first, every request with the OTHER reference got 409.
      const ref = winners[0].payment_reference as string;
      results.forEach((r, i) => expect(r.status).toBe((i === 9 ? "EFT-RACE-OTHER" : "EFT-RACE") === ref ? 200 : 409));
      const ev = await sql<{ type: string; n: number }[]>`
        select type, count(*)::int as n from public.consultant_events where client_id = ${id}::uuid and type in ('deal.paid', 'deal.won') group by type order by type`;
      expect(ev).toEqual([{ type: "deal.paid", n: 1 }, { type: "deal.won", n: 1 }]);
      expect((await sql`select count(*)::int as n from public.consultant_audit_log where action = 'payment.confirmed' and meta->>'leadId' = ${id}`)[0].n).toBe(1);
      expect(await dealOf(id)).toMatchObject({ amount: 9000, commission: 2250, c: A.id });
    }
  });

  test("funnel ratios come from PAID deals; zero denominators are null, never NaN", async () => {
    const C = await insertMember(sql, "cleoq", "sales_consultant", "Cleo Funnel");
    const id = await lead(C);
    // 10 dials, 4 answered
    for (let i = 0; i < 10; i++) {
      await sql`insert into public.consultant_calls (client_id, consultant_id, to_number, status, started_at, answered_at, ended_at)
                values (${id}::uuid, ${C.id}::uuid, '+27841000001', 'completed', now() - interval '2 minutes',
                        ${i < 4 ? sql`now() - interval '1 minute'` : null}, now())`;
    }
    // two deals WON, only one PAID
    const id2 = await lead(C, "won");
    await sql`insert into public.deals (client_id, proposal_status, deal_value, service_type, vertical, consultant_id, sent_at, accepted_at, won_at)
              values (${id2}::uuid, 'accepted', 12000, 'x', 'clinics', ${C.id}::uuid, now(), now(), now())`;
    asManager();
    expect((await pay(id, 12000, "EFT-FUNNEL")).status).toBe(200);

    actAs(consultantSession(C));
    const f = await body<FunnelMetrics>(await metricsRoute.GET(jsonReq("GET", "/api/consultant/metrics?period=today")));
    expect(f).toMatchObject({ dials: 10, connects: 4, won: 2, paid: 1, revenuePaid: 12000, commission: 3000, avgSale: 12000 });
    expect(f.rates.closeFromDials).toBeCloseTo(0.1, 10);
    expect(f.rates.closeFromConnects).toBeCloseTo(0.25, 10);
    expect(f.rates.connectRate).toBeCloseTo(0.4, 10);
    expect(f.rates.showRate).toBeNull(); // no meetings held or no-shows
    expect(f.rates.meetingToPaid).toBeNull();

    const D = await insertMember(sql, "dumaq", "sales_consultant", "Duma Empty");
    actAs(consultantSession(D));
    const empty = await body<FunnelMetrics>(await metricsRoute.GET(jsonReq("GET", "/api/consultant/metrics?period=quarter")));
    expect(Object.values(empty.rates).every((v) => v === null)).toBe(true);
    expect(empty).toMatchObject({ avgSale: null, salesCycleDays: null, velocityPerDay: null, paid: 0 });
    expect(JSON.stringify(empty)).not.toMatch(/NaN|Infinity/);
  });

  test("SAST boundaries in SQL: a payment at 23:59:59 SAST on 31 Dec is December/Q4; one second later is January/Q1", async () => {
    const E = await insertMember(sql, "eloq", "sales_consultant", "Elo Boundary");
    const decLast = "2026-12-31T21:59:59.000Z"; // 31 Dec 23:59:59 SAST
    const janFirst = "2026-12-31T22:00:00.000Z"; // 1 Jan 00:00:00 SAST
    for (const [paidAt, amount] of [[decLast, 1000], [janFirst, 2000]] as const) {
      const id = await lead(E, "won");
      await sql`insert into public.deals (client_id, proposal_status, deal_value, service_type, vertical, consultant_id, accepted_at, won_at, paid_at, payment_amount, commission_rate, commission_amount)
                values (${id}::uuid, 'accepted', ${amount}, 'x', 'clinics', ${E.id}::uuid, ${paidAt}, ${paidAt}, ${paidAt}, ${amount}, 0.25, ${amount / 4})`;
    }
    const inDec = new Date("2026-12-15T10:00:00Z");
    const inJan = new Date("2027-01-15T10:00:00Z");
    const val = (period: "month" | "quarter" | "week", at: Date) => {
      const r = periodRange(period, at);
      return metricValue(sql, E.id, "revenue", r.from, r.to);
    };
    expect(await val("month", inDec)).toBe(1000);
    expect(await val("month", inJan)).toBe(2000);
    expect(await val("quarter", inDec)).toBe(1000);
    expect(await val("quarter", inJan)).toBe(2000);
    // ISO week Mon 28 Dec – Sun 3 Jan SAST spans the year: both payments are in it.
    expect(await val("week", new Date("2027-01-01T08:00:00Z"))).toBe(3000);
    expect((await funnel(sql, { consultantId: E.id }, "month", inJan)).revenuePaid).toBe(2000);
  });

  test("tiers: R29 999 / R30 000 / R75 000 exact boundaries; Tier 3 top-3 with ties; re-runs award nothing new", async () => {
    // A closed SAST month far from any other test data: March 2026.
    const tier = async (rev: number) => {
      const m = await insertMember(sql, `t${rev}`, "sales_consultant", `Tier ${rev}`);
      const id = await lead(m, "won");
      await sql`insert into public.deals (client_id, proposal_status, deal_value, service_type, vertical, consultant_id, accepted_at, won_at, paid_at, payment_amount, commission_rate, commission_amount)
                values (${id}::uuid, 'accepted', ${rev}, 'x', 'clinics', ${m.id}::uuid, '2026-03-10T08:00:00Z', '2026-03-10T08:00:00Z', '2026-03-10T08:00:00Z', ${rev}, 0.25, ${Math.round(rev / 4)})`;
      return m;
    };
    const below = await tier(29999);
    const at1 = await tier(30000);
    const at2 = await tier(75000);
    const now = new Date("2026-03-20T10:00:00Z"); // day 20: no previous-month grace, 78 days into Q1: no Tier 3
    await awardTiers(sql, now);
    const got = async (m: Member) => (await sql`select tier from public.consultant_rewards where consultant_id = ${m.id}::uuid order by tier`).map((r) => r.tier);
    expect(await got(below)).toEqual([]);
    expect(await got(at1)).toEqual(["tier1_monthly_achiever"]);
    expect(await got(at2)).toEqual(["tier1_monthly_achiever", "tier2_high_performer"]);

    // Tier 3 for a closed quarter (Q2 2026), awarded in the first days of Q3.
    const q = async (name: string, rev: number) => {
      const m = await insertMember(sql, name, "sales_consultant", name);
      const id = await lead(m, "won");
      await sql`insert into public.deals (client_id, proposal_status, deal_value, service_type, vertical, consultant_id, accepted_at, won_at, paid_at, payment_amount, commission_rate, commission_amount)
                values (${id}::uuid, 'accepted', ${rev}, 'x', 'clinics', ${m.id}::uuid, '2026-05-12T08:00:00Z', '2026-05-12T08:00:00Z', '2026-05-12T08:00:00Z', ${rev}, 0.25, ${Math.round(rev / 4)})`;
      return m;
    };
    const q1 = await q("q_first", 200000);
    const q2 = await q("q_second", 180000);
    const q3a = await q("q_third_a", 160000);
    const q3b = await q("q_third_b", 160000); // tied for 3rd → both qualify
    const q5 = await q("q_fifth", 155000); // rank 5 → no
    const early = new Date("2026-07-02T08:00:00Z"); // 2 Jul SAST: within the Tier 3 grace window
    const first = await awardTiers(sql, early);
    const t3 = await sql<{ c: string }[]>`select consultant_id::text as c from public.consultant_rewards where tier = 'tier3_quarter_top' and period_key = '2026-Q2'`;
    expect(t3.map((r) => r.c).sort()).toEqual([q1.id, q2.id, q3a.id, q3b.id].sort());
    expect(t3.map((r) => r.c)).not.toContain(q5.id);
    expect(first.awarded).toBe(4);

    const before = (await sql`select count(*)::int as n from public.consultant_events where type = 'reward.tier_achieved'`)[0].n;
    const again = await awardTiers(sql, early);
    expect(again.awarded).toBe(0);
    await awardTiers(sql, now);
    expect((await sql`select count(*)::int as n from public.consultant_events where type = 'reward.tier_achieved'`)[0].n).toBe(before);
    expect((await sql`select count(*)::int as n from public.consultant_rewards`)[0].n).toBe(3 + 4);
  });

  test("leaderboard points come from the live settings (PUT by manage_gamification), not constants", async () => {
    const P = await insertMember(sql, "pointsq", "sales_consultant", "Pat Points");
    const id = await lead(P);
    for (let i = 0; i < 3; i++) {
      await sql`insert into public.consultant_calls (client_id, consultant_id, to_number, status, started_at, answered_at, ended_at)
                values (${id}::uuid, ${P.id}::uuid, '+27841000002', 'completed', now(), ${i === 0 ? sql`now()` : null}, now())`;
    }
    const row = async () => (await leaderboard(sql, "today", "points")).rows.find((r) => r.consultantId === P.id)!;
    expect((await row()).points).toBe(3 * 1 + 1 * 2); // defaults: dial 1, connect 2

    actAs(consultantSession(P));
    const current = await (await settingsRoute.GET()).json() as GamificationSettings;
    const custom = { ...current, points: { ...current.points, dial: 5, connect: 11 } };
    expect((await settingsRoute.PUT(jsonReq("PUT", "/s", custom))).status).toBe(403); // a consultant can't
    actAs({ ...managerSession(M), role: "acquisition_creative", canCall: false, permissions: ["use_consultant_portal", "manage_gamification", "view_team_performance"] });
    expect((await settingsRoute.PUT(jsonReq("PUT", "/s", custom))).status).toBe(200);
    expect((await row()).points).toBe(3 * 5 + 1 * 11);
  });

  test("Why Board daily plan uses the LIVE close-ratio target (same as the Performance calculator), not the config default", async () => {
    const G = await insertMember(sql, "goalq", "sales_consultant", "Gugu Goals"); // no activity → default rates
    actAs({ ...managerSession(M), role: "acquisition_creative", canCall: false, permissions: ["use_consultant_portal", "manage_gamification", "view_team_performance"] });
    const current = await (await settingsRoute.GET()).json() as GamificationSettings;
    expect((await settingsRoute.PUT(jsonReq("PUT", "/s", { ...current, closeTargetFromConnects: 0.25 }))).status).toBe(200);
    try {
      actAs(consultantSession(G));
      const targetDate = new Date(Date.now() + 40 * 86_400_000 + 2 * 3_600_000).toISOString().slice(0, 10);
      const res = await goalsRoute.POST(jsonReq("POST", "/g", { title: "Holiday", targetDate, metric: "revenue", targetValue: 45000 }));
      expect(res.status).toBe(201);
      const goal = await body<Goal>(res);
      // R45 000 ÷ R15 000 avg sale = 3 deals → ⌈3 ÷ 0.25⌉ = 12 answered calls (0.30 would say 10).
      expect(goal.dailyPlan).toMatchObject({ dealsNeeded: 3, connectsNeeded: 12, dialsNeeded: 40 });
      const metrics = await body<FunnelMetrics>(await metricsRoute.GET(jsonReq("GET", "/api/consultant/metrics?period=month")));
      expect(metrics.defaults?.closeTargetFromConnects).toBe(0.25);
    } finally {
      actAs({ ...managerSession(M), role: "acquisition_creative", canCall: false, permissions: ["use_consultant_portal", "manage_gamification", "view_team_performance"] });
      await settingsRoute.PUT(jsonReq("PUT", "/s", current));
    }
  });

  test("fairness: a payment for A never credits B; a reassigned lead's paid deal stays with the consultant on the deal", async () => {
    const { from, to } = today();
    const bBefore = { rev: await metricValue(sql, B.id, "revenue", from, to), com: await metricValue(sql, B.id, "commission", from, to) };
    const aBefore = await metricValue(sql, A.id, "revenue", from, to);
    const id = await lead(A);
    asManager();
    expect((await pay(id, 20000, "EFT-FAIR-1")).status).toBe(200);
    expect(await metricValue(sql, A.id, "revenue", from, to)).toBe(aBefore + 20000);
    expect(await metricValue(sql, B.id, "revenue", from, to)).toBe(bBefore.rev);
    expect(await metricValue(sql, B.id, "commission", from, to)).toBe(bBefore.com);

    // Manager reassigns the (paid) lead to B: the deal — and its credit — stays with A.
    asManager();
    expect((await leadRoute.PATCH(jsonReq("PATCH", "/x", { consultantId: B.id }), ctx(id))).status).toBe(200);
    expect((await sql`select consultant_id::text as c from public.clients where id = ${id}::uuid`)[0].c).toBe(B.id);
    expect((await dealOf(id)).c).toBe(A.id);
    expect(await metricValue(sql, A.id, "revenue", from, to)).toBe(aBefore + 20000);
    expect(await metricValue(sql, B.id, "revenue", from, to)).toBe(bBefore.rev);

    // A won-but-unpaid deal reassigned to B, then paid: credit goes to the consultant on the deal (A).
    const won = await lead(A, "won");
    await sql`insert into public.deals (client_id, proposal_status, deal_value, service_type, vertical, consultant_id, sent_at, accepted_at, won_at)
              values (${won}::uuid, 'accepted', 8000, 'x', 'clinics', ${A.id}::uuid, now(), now(), now())`;
    expect((await leadRoute.PATCH(jsonReq("PATCH", "/x", { consultantId: B.id }), ctx(won))).status).toBe(200);
    expect((await pay(won, 8000, "EFT-FAIR-2")).status).toBe(200);
    expect(await dealOf(won)).toMatchObject({ c: A.id, commission: 2000 });
    const lb = await leaderboard(sql, "today", "revenue");
    expect(lb.rows.find((r) => r.consultantId === B.id)?.revenuePaid ?? 0).toBe(bBefore.rev);
  });
});
