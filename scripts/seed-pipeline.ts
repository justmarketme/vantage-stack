/**
 * One-shot pipeline seed script.
 * Run: npx tsx scripts/seed-pipeline.ts
 */
import postgres from "postgres";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load .env.local
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const url =
  process.env.SUPABASE_DATABASE_POOLER_URL ||
  process.env.DATABASE_URL;

if (!url) {
  console.error("No DATABASE_URL found in .env.local");
  process.exit(1);
}

const db = postgres(url, { ssl: "require", max: 1 });

async function seed() {
  console.log("Seeding pipeline dummy data…");

  const now = new Date();
  const ago = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();

  const clients = [
    { name: "Thabo Nkosi", email: "thabo@nkosifa.co.za", company: "Nkosi Financial Advisors", industry: "Financial Services", revenue_range: "R500k–R1M", monthly_budget: 12000, status: "blueprint-submitted", phone: "+27 82 111 2233" },
    { name: "Sarah van der Berg", email: "sarah@smiledentalsa.co.za", company: "Smile Dental SA", industry: "Dental & Healthcare", revenue_range: "R1M–R5M", monthly_budget: 18000, status: "blueprint-submitted", phone: "+27 71 234 5678" },
    { name: "Ravi Pillay", email: "ravi@radiantaesthetic.co.za", company: "Radiant Aesthetic Clinic", industry: "Aesthetic Clinic", revenue_range: "R500k–R1M", monthly_budget: 15000, status: "report-sent", phone: "+27 83 345 6789" },
    { name: "Lerato Mokoena", email: "lerato@premiumprop.co.za", company: "Premium Property Group", industry: "Real Estate", revenue_range: "R5M+", monthly_budget: 25000, status: "report-sent", phone: "+27 72 456 7890" },
    { name: "Pieter Botha", email: "pieter@bothabuilds.co.za", company: "Botha Construction", industry: "Construction", revenue_range: "R1M–R5M", monthly_budget: 20000, status: "proposal-sent", phone: "+27 82 567 8901" },
    { name: "Nomsa Zulu", email: "nomsa@glamourhair.co.za", company: "Glamour Hair & Beauty", industry: "Hair & Beauty", revenue_range: "R200k–R500k", monthly_budget: 8000, status: "proposal-sent", phone: "+27 71 678 9012" },
    { name: "Craig Williams", email: "craig@nexustechsa.co.za", company: "Nexus Tech SA", industry: "Technology", revenue_range: "R5M+", monthly_budget: 40000, status: "active-client", phone: "+27 83 789 0123", activated_at: ago(30) },
    { name: "Aisha Patel", email: "aisha@beautybyaisha.co.za", company: "Beauty by Aisha", industry: "Aesthetic Clinic", revenue_range: "R500k–R1M", monthly_budget: 14000, status: "active-client", phone: "+27 72 890 1234", activated_at: ago(15) },
    { name: "Willem Fourie", email: "willem@fouriecapital.co.za", company: "Fourie Capital", industry: "Financial Services", revenue_range: "R1M–R5M", monthly_budget: 30000, status: "upsell-sent", phone: "+27 82 901 2345", activated_at: ago(60) },
  ] as const;

  for (const c of clients) {
    try {
      const rows = await db`
        insert into public.clients (
          name, email, company, industry, revenue_range, monthly_budget,
          status, activated_at, whatsapp, created_by, created_at, updated_at
        ) values (
          ${c.name}, ${c.email}, ${c.company}, ${c.industry}, ${c.revenue_range},
          ${c.monthly_budget}, ${c.status},
          ${"activated_at" in c ? (c as { activated_at?: string }).activated_at ?? null : null}::timestamptz,
          ${"phone" in c ? (c as { phone?: string }).phone ?? null : null},
          'seed-pipeline',
          ${ago(Math.floor(Math.random() * 30 + 5))}::timestamptz,
          now()
        )
        on conflict (email) do update set
          status = excluded.status,
          monthly_budget = excluded.monthly_budget,
          activated_at = excluded.activated_at,
          updated_at = now()
        returning id::text as id
      `;
      const id = (rows[0] as { id: string }).id;
      console.log(`  ✓ ${c.name} (${c.status}) → ${id}`);
    } catch (e) {
      console.error(`  ✗ ${c.name}:`, e instanceof Error ? e.message : e);
    }
  }

  console.log("\nDone. Refresh the Pipeline page.");
  await db.end();
}

seed().catch((e) => { console.error(e); process.exit(1); });
