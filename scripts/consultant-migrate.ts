/**
 * Applies the Consultant Portal schema (lib/consultant/schema.ts → ensureConsultantSchema):
 * additive `vertical` / sales columns on public.clients + public.deals, the consultant_*
 * tables (RLS on, no policies), and any CRM status enum values the portal writes.
 * Idempotent — every statement is IF NOT EXISTS, so re-running is safe.
 *
 *   npm run consultant:migrate
 *
 * Connection: the app's own resolver (lib/crm/db.ts) — SUPABASE_DATABASE_POOLER_URL, else
 * DATABASE_URL. Point it at the APP database (Supabase project tinkmipmxunwvyemhalu).
 * NEVER apply this through the Supabase MCP: that MCP is connected to a different project.
 * Never prints the connection string.
 */
import { connectCrmDb, getCrmDbUrl } from "../lib/crm/db";
import { portalStatusValues } from "../lib/consultant/config";
import { ensureConsultantSchema } from "../lib/consultant/schema";

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
  console.log(`[consultant:migrate] target ${redactedHost(raw)}`);

  const db = await connectCrmDb();
  if (!db) throw new Error("Could not open a database connection");
  try {
    const statuses = portalStatusValues();
    await ensureConsultantSchema(db, statuses);

    const tables = await db<{ name: string; rls: boolean }[]>`
      select c.relname::text as name, c.relrowsecurity as rls
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'consultant\\_%'
      order by c.relname`;
    for (const t of tables) console.log(`  table  ${t.name.padEnd(28)} RLS ${t.rls ? "on" : "OFF"}`);

    const cols = await db<{ tbl: string; col: string }[]>`
      select table_name::text as tbl, column_name::text as col
      from information_schema.columns
      where table_schema = 'public'
        and ((table_name = 'clients' and column_name in
              ('vertical','sales_stage','sales_stage_changed_at','consultant_id','contact_name',
               'contact_role','phone','lead_source','lost_reason','next_action_at'))
          or (table_name = 'deals' and column_name in ('vertical','consultant_id')))
      order by table_name, column_name`;
    for (const c of cols) console.log(`  column ${c.tbl}.${c.col}`);
    console.log(`  status values ensured: ${statuses.join(", ")}`);

    const rlsOff = tables.filter((t) => !t.rls).length;
    console.log(`[consultant:migrate] done — ${tables.length} consultant_* tables, ${cols.length} CRM columns${rlsOff ? `, WARNING: ${rlsOff} table(s) without RLS` : ""}`);
    if (rlsOff) process.exitCode = 2;
  } finally {
    await db.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error("[consultant:migrate] failed:", (e as Error).message);
  process.exit(1);
});
