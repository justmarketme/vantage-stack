/**
 * Backfill: every existing clinic landing-page enquiry (`clinic_blueprints`) becomes an
 * UNASSIGNED Clinics lead in the VantageStack CRM (`public.clients`, vertical = 'clinics'),
 * exactly as new enquiries now do on submit (lib/clinics/store.ts → upsertClinicLeadFromEnquiry).
 *
 *   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/consultant-backfill-clinic-leads.ts --dry-run
 *   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/consultant-backfill-clinic-leads.ts
 *
 * Idempotent: leads are deduped by phone / email, so re-running creates nothing new.
 * --dry-run reports what WOULD happen and writes nothing (not even the schema).
 * Prints counts only — never names, phone numbers or emails. Never prints the connection string.
 * Target the APP database (Supabase project tinkmipmxunwvyemhalu) — never via the Supabase MCP.
 */
import { connectCrmDb } from "../lib/crm/db";
import { portalStatusValues } from "../lib/consultant/config";
import { ensureConsultantSchema } from "../lib/consultant/schema";
import { upsertClinicLeadFromEnquiry, type ClinicLeadResult } from "../lib/consultant/server/clinicLeads";
import { errorTag } from "../lib/consultant/server/http";
import { CLINICS_VERTICAL, normalizeE164 } from "../lib/consultant/types";

type BlueprintRow = {
  id: number;
  practice_name: string;
  contact_name: string;
  role: string;
  email: string;
  whatsapp: string;
  website_url: string;
  source: string;
};

async function dryRunOutcome(
  db: NonNullable<Awaited<ReturnType<typeof connectCrmDb>>>,
  r: BlueprintRow,
): Promise<ClinicLeadResult["outcome"]> {
  const phone = normalizeE164(r.whatsapp);
  if (!phone) return "invalid_phone";
  const email = r.email.trim().toLowerCase() || null;
  const hasVertical = await db`
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clients' and column_name = 'vertical'`;
  if (hasVertical.length) {
    const existing = await db`
      select 1 from public.clients
      where vertical = ${CLINICS_VERTICAL} and (phone = ${phone} or (${email}::text is not null and lower(email) = ${email}))
      limit 1`;
    if (existing.length) return "exists";
  }
  if (email) {
    const other = await db`select 1 from public.clients where lower(email) = ${email} limit 1`;
    if (other.length) return "email_in_other_vertical";
  }
  return "created";
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const db = await connectCrmDb();
  if (!db) {
    console.error("No database URL. Set SUPABASE_DATABASE_POOLER_URL or DATABASE_URL in .env.local.");
    process.exit(1);
  }
  const counts: Record<string, number> = {};
  try {
    const exists = await db`select to_regclass('public.clinic_blueprints') is not null as ok`;
    if (!exists[0]?.ok) {
      console.log("[consultant:backfill] no clinic_blueprints table — nothing to do");
      return;
    }
    if (!dryRun) await ensureConsultantSchema(db, portalStatusValues());

    const rows = await db<BlueprintRow[]>`
      select id::int, practice_name, contact_name, role, email, whatsapp, website_url, source
      from clinic_blueprints order by id asc`;
    const seen = new Set<string>(); // dry run: dedupe within this batch too
    for (const r of rows) {
      let outcome: string;
      try {
        if (dryRun) {
          const keys = [normalizeE164(r.whatsapp), r.email.trim().toLowerCase()].filter((k): k is string => !!k);
          outcome = keys.some((k) => seen.has(k)) ? "exists" : await dryRunOutcome(db, r);
          if (outcome === "created") keys.forEach((k) => seen.add(k));
        } else outcome = (
              await upsertClinicLeadFromEnquiry(db, {
                practiceName: r.practice_name,
                contactName: r.contact_name,
                role: r.role,
                email: r.email,
                whatsapp: r.whatsapp,
                websiteUrl: r.website_url,
                source: r.source,
                blueprintId: r.id,
              })
            ).outcome;
      } catch (e) {
        outcome = `error(${errorTag(e)})`;
      }
      counts[outcome] = (counts[outcome] ?? 0) + 1;
    }
    console.log(`[consultant:backfill] ${dryRun ? "DRY RUN — " : ""}${rows.length} enquiries`);
    for (const [k, v] of Object.entries(counts)) console.log(`  ${(dryRun && k === "created" ? "would create" : k).padEnd(26)} ${v}`);
    if (Object.keys(counts).some((k) => k.startsWith("error"))) process.exitCode = 2;
  } finally {
    await db.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error("[consultant:backfill] failed:", errorTag(e));
  process.exit(1);
});
