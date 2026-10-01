/**
 * The production test-clinic cleanup (scripts/consultant-test-clinics.ts) against a REAL
 * Postgres: it must remove "TEST · " Clinics leads and everything hanging off them, and nothing
 * else — not a real clinic, not a look-alike name, not another vertical. Skipped unless
 * CONSULTANT_IT_PG_URL is set (see harness.ts).
 */
import "./mocks";
import type { Sql } from "postgres";
import { applyTestEnv, createTestDatabase, describeDb, insertMember, type Member, type TestDb } from "./harness";
import { portalStatusValues } from "@/lib/consultant/config";
import { ensureConsultantSchema } from "@/lib/consultant/schema";
import { deleteTestClinics, findTestClinics } from "@/scripts/consultant-test-clinics";

applyTestEnv();

describeDb("production test clinics · cleanup (real Postgres)", () => {
  let tdb: TestDb;
  let sql: Sql;
  let A: Member;

  beforeAll(async () => {
    tdb = await createTestDatabase();
    sql = tdb.sql;
    await ensureConsultantSchema(sql, portalStatusValues());
    A = await insertMember(sql, "alicetest", "sales_consultant", "Alice Test");
  }, 60_000);

  afterAll(async () => {
    await tdb?.drop();
  });

  let n = 0;
  async function clinic(name: string, vertical = "clinics"): Promise<string> {
    n++;
    const [row] = await sql<{ id: string }[]>`
      insert into public.clients (name, company, email, phone, vertical, sales_stage, sales_stage_changed_at, status, consultant_id, lead_source)
      values (${name}, ${name}, ${`tc${n}@internal.vantagestack`}, ${`+2782${7000000 + n}`}, ${vertical},
        'proposal', now(), 'lead', ${A.id}::uuid, 'consultant_portal')
      returning id::text`;
    await sql`insert into public.consultant_calls (client_id, consultant_id, to_number, status, ended_at)
              values (${row.id}::uuid, ${A.id}::uuid, ${`+2782${7000000 + n}`}, 'completed', now())`;
    await sql`insert into public.consultant_notes (client_id, body, created_by, created_by_name)
              values (${row.id}::uuid, 'note', ${A.id}::uuid, 'Alice Test')`;
    if (vertical === "clinics") {
      await sql`insert into public.deals (client_id, proposal_status, deal_value, service_type, vertical, consultant_id, sent_at)
                values (${row.id}::uuid, 'sent', 12000, 'x', 'clinics', ${A.id}::uuid, now())`;
    }
    return row.id;
  }

  const exists = async (id: string) =>
    (await sql<{ n: number }[]>`select count(*)::int as n from public.clients where id = ${id}::uuid`)[0].n === 1;

  it("finds and deletes only TEST · Clinics leads, with their calls and deals", async () => {
    const t1 = await clinic("TEST · Jono's mobile");
    const t2 = await clinic("TEST · Thabo");
    const real = await clinic("Lumière Aesthetics");
    const lookAlike = await clinic("Test · lowercase is not a test clinic");
    const noDot = await clinic("TEST - dash is not the marker");
    const prefixOnly = await clinic("TEST · ");
    const otherVertical = await clinic("TEST · but not clinics", "agency");

    const found = await findTestClinics(sql);
    expect(found.map((f) => f.id).sort()).toEqual([t1, t2].sort());
    expect(found.every((f) => f.calls === 1 && f.deals === 1)).toBe(true);

    expect(await deleteTestClinics(sql)).toBe(2);

    expect(await exists(t1)).toBe(false);
    expect(await exists(t2)).toBe(false);
    for (const id of [real, lookAlike, noDot, prefixOnly, otherVertical]) expect(await exists(id)).toBe(true);

    const [left] = await sql<{ calls: number; deals: number }[]>`
      select (select count(*)::int from public.consultant_calls where client_id = any(${[t1, t2]}::uuid[])) as calls,
             (select count(*)::int from public.deals where client_id = any(${[t1, t2]}::uuid[])) as deals`;
    expect(left).toEqual({ calls: 0, deals: 0 });
    const [kept] = await sql<{ n: number }[]>`select count(*)::int as n from public.deals where client_id = ${real}::uuid`;
    expect(kept.n).toBe(1);

    // Running it again is a no-op.
    expect(await deleteTestClinics(sql)).toBe(0);
  });
});
