import { NextResponse } from "next/server";
import { withCrmHandler } from "../../../../../lib/crm/http";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { leads = [], industry = "" } = body as {
    leads?: Array<{
      id: string;
      placeId?: string;
      businessName: string;
      phone: string | null;
      email: string | null;
      address: string;
      rating: number | null;
      website: string | null;
      fbHandle?: string | null;
      igHandle?: string | null;
      category?: string | null;
      ownerName?: string | null;
      yearsInBusiness?: number | null;
    }>;
    industry?: string;
  };

  if (!industry.trim()) {
    return NextResponse.json({ ok: false, error: "Industry is required" }, { status: 400 });
  }
  if (!leads.length) {
    return NextResponse.json({ ok: false, error: "No leads provided" }, { status: 400 });
  }

  return withCrmHandler(async (db) => {
    // Ensure extra columns exist (single round-trip)
    await db.unsafe(`
      alter table public.clients add column if not exists place_id text;
      alter table public.clients add column if not exists source text;
      alter table public.clients add column if not exists google_rating numeric(3,1);
      alter table public.clients add column if not exists address text;
      alter table public.clients add column if not exists owner_name text;
      alter table public.clients add column if not exists years_in_business int;
      alter table public.clients add column if not exists social_fb text;
      alter table public.clients add column if not exists social_ig text;
      create unique index if not exists clients_place_id_uidx on public.clients (place_id) where place_id is not null;
    `);

    // Build rows — use real email if available, otherwise a stable internal placeholder
    const rows = leads
      .filter((l) => l.businessName?.trim())
      .map((lead) => {
        const name = lead.businessName.trim();
        const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
        const ts = Date.now();
        const email = lead.email?.trim()
          ? lead.email.trim().toLowerCase()
          : `scrape+${slug}+${ts}@internal.vantagestack`;
        return {
          name,
          email,
          whatsapp: lead.phone ?? null,
          website_url: lead.website ?? null,
          industry,
          address: lead.address && lead.address !== "—" ? lead.address : null,
          google_rating: lead.rating ?? null,
          place_id: lead.placeId ?? null,
          source: "lead_scraper",
          status: "manually-added",
          company: name,
          owner_name: lead.ownerName ?? null,
          years_in_business: lead.yearsInBusiness ?? null,
          social_fb: lead.fbHandle ?? null,
          social_ig: lead.igHandle ?? null,
        };
      });

    if (!rows.length) {
      return NextResponse.json({ ok: true, imported: 0 });
    }

    // Single batch insert — conflict on place_id (dedup) or email (dedup real emails)
    const result = await db`
      insert into public.clients ${db(rows, [
        "name","email","whatsapp","website_url","industry",
        "address","google_rating","place_id","source","status","company",
        "owner_name","years_in_business","social_fb","social_ig",
      ])}
      on conflict (place_id) where place_id is not null do nothing
      returning id
    `.catch(async () => {
      // Fallback: insert one-by-one if batch fails (e.g. email unique conflict)
      let count = 0;
      for (const row of rows) {
        await db`
          insert into public.clients ${db([row], [
            "name","email","whatsapp","website_url","industry",
            "address","google_rating","place_id","source","status","company",
            "owner_name","years_in_business","social_fb","social_ig",
          ])}
          on conflict do nothing
        `.catch(() => null);
        count++;
      }
      return Array.from({ length: count }, (_, i) => ({ id: i }));
    });

    return NextResponse.json({ ok: true, imported: result.length });
  });
}
