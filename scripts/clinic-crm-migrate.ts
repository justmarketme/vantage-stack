/**
 * Applies the Clinic CRM schema (lib/clinic-crm/schema.ts → CLINIC_CRM_DDL).
 * Idempotent: every statement is CREATE … IF NOT EXISTS / ENABLE RLS, so re-running is safe.
 *
 *   npm run clinic-crm:migrate
 *
 * Connection: the app's own resolver (lib/crm/db.ts) — SUPABASE_DATABASE_POOLER_URL,
 * else DATABASE_URL (direct db.<ref>.supabase.co URLs are rewritten to the IPv4 session
 * pooler). Point it at the APP database (Supabase project tinkmipmxunwvyemhalu).
 * Never prints the connection string.
 */
import { connectCrmDb, getCrmDbUrl } from "../lib/crm/db";
import { CLINIC_CRM_DDL } from "../lib/clinic-crm/schema";

function redactedHost(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}`;
  } catch {
    return "(unparseable URL)";
  }
}

async function main() {
  const raw = getCrmDbUrl();
  if (!raw) {
    console.error("No database URL. Set SUPABASE_DATABASE_POOLER_URL or DATABASE_URL in .env.local.");
    process.exit(1);
  }
  console.log(`[clinic-crm:migrate] target ${redactedHost(raw)}`);

  const db = await connectCrmDb();
  if (!db) throw new Error("Could not open a database connection");
  try {
    for (const [i, stmt] of CLINIC_CRM_DDL.entries()) {
      await db.unsafe(stmt);
      const label = stmt.replace(/\s+/g, " ").slice(0, 72);
      console.log(`  ${String(i + 1).padStart(2)}/${CLINIC_CRM_DDL.length}  ${label}`);
    }
    const [{ n }] = await db<{ n: number }[]>`
      SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'clinic_crm'`;
    const [{ rls }] = await db<{ rls: number }[]>`
      SELECT count(*)::int AS rls FROM pg_tables WHERE schemaname = 'clinic_crm' AND rowsecurity`;
    console.log(`[clinic-crm:migrate] done — ${n} tables in clinic_crm, ${rls} with RLS enabled`);
  } finally {
    await db.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error("[clinic-crm:migrate] failed:", (e as Error).message);
  process.exit(1);
});
