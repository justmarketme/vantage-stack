/**
 * Labelled test clinics on PRODUCTION — the first-run plan instead of a paid staging branch.
 *
 *   npm run consultant:test-clinics                      # list: how many test clinics, and what hangs off them
 *   npm run consultant:test-clinics -- --delete          # dry run: what WOULD be deleted, changes nothing
 *   npm run consultant:test-clinics -- --delete --confirm  # deletes them, in one transaction
 *
 * A "test clinic" is a Clinics-vertical lead whose name starts with `TEST · ` (TEST, space, middle
 * dot, space — see TEST_CLINIC_PREFIX). Consultants create them through the normal Add Lead form
 * with THEIR OWN mobile as the clinic number, so every call, WhatsApp and calendar invite goes to
 * someone on the team. See docs/consultant-portal/DEPLOY.md → "First run on production".
 *
 * Nothing else is ever touched: the filter is `vertical = 'clinics' AND name LIKE 'TEST · %'`,
 * applied inside the same transaction that deletes. Rows hanging off a test clinic go with it
 * (portal tables cascade; its Clinics deal and CRM activity rows are deleted explicitly). If any
 * other table still references one of them, the whole transaction rolls back and the script
 * names the table — nothing is half-deleted. The audit log and the event outbox are kept (they
 * hold ids, not contact details) so the history of the test stays explainable.
 *
 * Output: counts and test-clinic names only (they are ours). Never phones, emails or the DB URL.
 */
import type { Sql } from "postgres";
import { connectCrmDb, getCrmDbUrl } from "../lib/crm/db";
import { CLINICS_VERTICAL } from "../lib/consultant/types";

export const TEST_CLINIC_PREFIX = "TEST · ";

/** True for a name that marks a production test clinic. Case-sensitive on purpose. */
export function isTestClinicName(name: string | null | undefined): boolean {
  return typeof name === "string" && name.startsWith(TEST_CLINIC_PREFIX) && name.length > TEST_CLINIC_PREFIX.length;
}

/** LIKE pattern for the prefix, with LIKE metacharacters escaped (the prefix has none today). */
export function testClinicLikePattern(): string {
  return `${TEST_CLINIC_PREFIX.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const TAG = "[consultant:test-clinics]";

type Found = { id: string; name: string; stage: string | null; calls: number; meetings: number; deals: number };

export async function findTestClinics(db: Sql): Promise<Found[]> {
  const rows = await db<Found[]>`
    select c.id::text as id, c.name, c.sales_stage as stage,
      (select count(*)::int from public.consultant_calls x where x.client_id = c.id) as calls,
      (select count(*)::int from public.consultant_meetings x where x.client_id = c.id) as meetings,
      (select count(*)::int from public.deals x where x.client_id = c.id and x.vertical = ${CLINICS_VERTICAL}) as deals
    from public.clients c
    where c.vertical = ${CLINICS_VERTICAL} and c.name like ${testClinicLikePattern()}
    order by c.name
  `;
  // Belt and braces: re-check in JS so a LIKE surprise can never widen the set.
  return rows.filter((r) => isTestClinicName(r.name));
}

function print(found: Found[]): void {
  if (found.length === 0) {
    console.log(`${TAG} no test clinics (names starting "${TEST_CLINIC_PREFIX}").`);
    return;
  }
  console.log(`${TAG} ${found.length} test clinic(s):`);
  for (const f of found) {
    console.log(`  - ${f.name}  [${f.stage ?? "new"}]  calls=${f.calls} meetings=${f.meetings} deals=${f.deals}`);
  }
}

export async function deleteTestClinics(db: Sql): Promise<number> {
  return db.begin(async (tx) => {
    const t = tx as unknown as Sql;
    const found = await findTestClinics(t);
    const ids = found.map((f) => f.id);
    if (ids.length === 0) return 0;
    await t`delete from public.deals where client_id = any(${ids}::uuid[]) and vertical = ${CLINICS_VERTICAL}`;
    await t`delete from public.consultant_messages where client_id = any(${ids}::uuid[])`;
    await t`delete from public.crm_activity where client_id = any(${ids}::uuid[])`;
    const gone = await t`
      delete from public.clients
      where id = any(${ids}::uuid[]) and vertical = ${CLINICS_VERTICAL} and name like ${testClinicLikePattern()}
    `;
    return gone.count;
  });
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  if (!getCrmDbUrl()) {
    console.error(`${TAG} no database URL configured (.env.local).`);
    process.exit(1);
  }
  const db = await connectCrmDb();
  if (!db) {
    console.error(`${TAG} could not connect to the database.`);
    process.exit(1);
  }
  try {
    const found = await findTestClinics(db);
    print(found);
    if (!args.has("--delete")) return;
    if (!args.has("--confirm")) {
      console.log(`${TAG} dry run — add --confirm to delete these ${found.length} test clinic(s) and their calls, notes, meetings, deals and messages.`);
      return;
    }
    const n = await deleteTestClinics(db);
    console.log(`${TAG} deleted ${n} test clinic(s).`);
  } catch (e) {
    const err = e as { code?: string; table_name?: string; constraint_name?: string };
    if (err.code === "23503") {
      console.error(`${TAG} rolled back — table "${err.table_name ?? "?"}" still references a test clinic (${err.constraint_name ?? "fk"}). Nothing was deleted.`);
    } else {
      console.error(`${TAG} failed (${err.code ?? "error"}). Nothing was deleted.`);
    }
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

// Run only when executed directly (tests import the helpers).
if (process.argv[1] && /consultant-test-clinics\.[cm]?[jt]s$/.test(process.argv[1])) {
  void main();
}
