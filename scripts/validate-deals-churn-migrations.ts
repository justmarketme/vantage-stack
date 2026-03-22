#!/usr/bin/env node
/**
 * Apply migrations 005 and 006, then run validation queries.
 * Run: npx tsx scripts/validate-deals-churn-migrations.ts
 * Requires: DATABASE_URL in .env.local
 */
import { config } from "dotenv";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const envPath = join(repoRoot, ".env.local");

if (existsSync(envPath)) {
  config({ path: envPath, override: true });
}

const url = (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "").trim();
if (!url) {
  console.error("ERROR: DATABASE_URL or SUPABASE_DB_URL required in .env.local");
  process.exit(1);
}

async function main() {
  const db = postgres(url, { max: 3, prepare: false });
  const migrationsDir = join(repoRoot, "mcp", "database-architect", "migrations");

  try {
    // 1. Apply 005_deals_and_churn.sql
    const sql005 = await readFile(join(migrationsDir, "005_deals_and_churn.sql"), "utf-8");
    await db.unsafe(sql005);
    console.log("✓ Applied 005_deals_and_churn.sql");

    // 2. Apply 006_deals_acceptance_trigger.sql
    const sql006 = await readFile(join(migrationsDir, "006_deals_acceptance_trigger.sql"), "utf-8");
    await db.unsafe(sql006);
    console.log("✓ Applied 006_deals_acceptance_trigger.sql");

    // 3. Run user's exact validation queries
    console.log("\n--- Query 1: to_regclass (deals table, auto_mark_churned function) ---");
    const regclassRows = await db<Array<{ deals: string | null; func: string | null }>>`
      select
        to_regclass('public.deals')::text as deals,
        to_regclass('public.auto_mark_churned_inactive_clients')::text as func
    `;
    const r = regclassRows[0];
    console.log("  deals:", r?.deals ?? "null");
    console.log("  auto_mark_churned_inactive_clients:", r?.func ?? "null");
    // Note: to_regclass on a function returns null; the function is in pg_proc, not pg_class

    console.log("\n--- Query 2: Triggers (set_churn_date, set_latest_deal_accepted_on_activation) ---");
    // Migration uses trigger names: trg_clients_set_churn_date, trg_deals_set_accepted_at
    // User query used function names; we check both for robustness
    const triggerRows = await db<Array<{ trigger_name: string; event_object_table: string; action_timing: string; event_manipulation: string }>>`
      select trigger_name, event_object_table, action_timing, event_manipulation
      from information_schema.triggers
      where trigger_name in ('set_churn_date', 'set_latest_deal_accepted_on_activation', 'trg_clients_set_churn_date', 'trg_deals_set_accepted_at')
      order by trigger_name
    `;
    if (triggerRows.length === 0) {
      console.log("  (no rows - trigger names in DB are trg_clients_set_churn_date, trg_deals_set_accepted_at)");
    }
    for (const t of triggerRows) {
      console.log(`  ${t.trigger_name} | ${t.event_object_table} | ${t.action_timing} ${t.event_manipulation}`);
    }

    const dealsExists = r?.deals && r.deals !== "null";
    const triggerCount = triggerRows.length;
    const expectedTriggers = ["trg_clients_set_churn_date", "trg_deals_set_accepted_at"];
    const found = new Set(triggerRows.map((t) => t.trigger_name));
    const hasBothTriggers = expectedTriggers.every((name) => found.has(name));

    if (dealsExists && hasBothTriggers) {
      console.log("\n✓ Both migrations are live. Validation passed.");
    } else {
      console.log("\n⚠ Check:", { dealsExists, hasBothTriggers, found: [...found] });
    }
  } finally {
    await db.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error("Error:", e?.message ?? e);
  process.exit(1);
});
