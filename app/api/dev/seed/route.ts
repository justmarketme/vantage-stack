import { NextResponse } from "next/server";
import { connectCrmDb, ensureCrmSchema } from "../../../../lib/crm/db";
import { ensureAnalyticsTables } from "../../../../lib/analytics/db";

/**
 * Dev-only seed endpoint. Creates schema + 5 dummy clients with pipeline events.
 * Hit: POST /api/dev/seed
 */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Not available in production" }, { status: 403 });
  }

  const db = await connectCrmDb();
  if (!db) return NextResponse.json({ ok: false, error: "No database" }, { status: 503 });

  try {
    await ensureCrmSchema(db);
    await ensureAnalyticsTables(db);

    // Ensure base clients table exists
    await db.unsafe(`
      create table if not exists public.clients (
        id uuid primary key default gen_random_uuid(),
        name text not null,
        email text not null unique,
        whatsapp text,
        website_url text,
        industry text,
        revenue_range text,
        monthly_budget integer,
        status text not null default 'blueprint-submitted',
        company text,
        next_action text,
        assigned_to text,
        sop_project_id uuid,
        last_active_at timestamptz,
        activated_at timestamptz,
        churn_date timestamptz,
        created_by text,
        challenges jsonb not null default '[]'::jsonb,
        competitors jsonb not null default '[]'::jsonb,
        current_marketing jsonb not null default '[]'::jsonb,
        tools_used jsonb not null default '[]'::jsonb,
        success_goals jsonb not null default '[]'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
    `);

    await db.unsafe(`
      create table if not exists public.reports (
        id uuid primary key default gen_random_uuid(),
        client_id uuid not null references public.clients(id) on delete cascade,
        health_score integer,
        video_url text,
        report_generated boolean not null default false,
        video_complete boolean not null default false,
        sent_at timestamptz,
        report_markdown text,
        share_token text,
        delivery_complete boolean not null default false,
        created_at timestamptz not null default now()
      );
      create unique index if not exists reports_client_id_uidx on public.reports (client_id);
    `);

    await db.unsafe(`
      create table if not exists public.upsells (
        id uuid primary key default gen_random_uuid(),
        client_id uuid not null references public.clients(id) on delete cascade,
        service_name text not null,
        projected_revenue integer not null default 0,
        status text not null default 'pending',
        sent_at timestamptz,
        accepted_at timestamptz,
        created_at timestamptz not null default now()
      );
      create index if not exists upsells_client_idx on public.upsells (client_id);
    `);

    // Run ensureCrmSchema again now that base tables exist
    await ensureCrmSchema(db);

    // Check if already seeded
    const existing = await db`select count(*)::int as n from public.clients where created_by = 'seed'`;
    const n = Number((existing[0] as { n?: number })?.n ?? 0);
    if (n >= 5) {
      return NextResponse.json({ ok: true, message: "Already seeded", skipped: true });
    }

    const now = new Date();
    const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString();

    const clients = [
      {
        name: "Acme Digital",
        email: "hello@acmedigital.co.za",
        company: "Acme Digital",
        industry: "E-commerce",
        revenue_range: "$500K-1M",
        monthly_budget: 8000,
        status: "active-client",
        activated_at: daysAgo(20),
        monthly_revenue: 8000,
        deal_value: 8000,
      },
      {
        name: "GrowthLab SA",
        email: "info@growthlabsa.co.za",
        company: "GrowthLab SA",
        industry: "SaaS",
        revenue_range: "$1M-5M",
        monthly_budget: 15000,
        status: "proposal-sent",
        monthly_revenue: 0,
        deal_value: 15000,
      },
      {
        name: "BlueSky Ventures",
        email: "team@blueskyventures.co.za",
        company: "BlueSky Ventures",
        industry: "Finance",
        revenue_range: "$5M-10M",
        monthly_budget: 25000,
        status: "active-client",
        activated_at: daysAgo(45),
        monthly_revenue: 25000,
        deal_value: 25000,
      },
      {
        name: "Momentum Media",
        email: "contact@momentummedia.co.za",
        company: "Momentum Media",
        industry: "Marketing",
        revenue_range: "$500K-1M",
        monthly_budget: 6000,
        status: "report-sent",
        monthly_revenue: 0,
        deal_value: 6000,
      },
      {
        name: "Vertex Solutions",
        email: "ops@vertexsolutions.co.za",
        company: "Vertex Solutions",
        industry: "Technology",
        revenue_range: "$1M-5M",
        monthly_budget: 12000,
        status: "blueprint-submitted",
        monthly_revenue: 0,
        deal_value: 12000,
      },
    ];

    for (const c of clients) {
      // Insert client
      const rows = await db`
        insert into public.clients (
          name, email, company, industry, revenue_range, monthly_budget,
          status, activated_at, created_by, last_active_at, created_at, updated_at
        ) values (
          ${c.name}, ${c.email}, ${c.company}, ${c.industry}, ${c.revenue_range},
          ${c.monthly_budget}, ${c.status},
          ${c.activated_at ?? null}::timestamptz,
          'seed',
          ${daysAgo(1)}::timestamptz,
          ${daysAgo(60)}::timestamptz,
          ${daysAgo(1)}::timestamptz
        )
        on conflict (email) do nothing
        returning id::text as id
      `;
      const clientId = (rows[0] as { id?: string })?.id;
      if (!clientId) continue;

      // Insert blueprint_submitted event
      await db`
        insert into public.events (client_id, event_type, timestamp, metadata)
        values (${clientId}::uuid, 'blueprint_submitted', ${daysAgo(55)}::timestamptz, '{}'::jsonb)
      `;

      if (["report-sent", "proposal-sent", "active-client"].includes(c.status)) {
        await db`
          insert into public.events (client_id, event_type, timestamp, metadata)
          values (${clientId}::uuid, 'report_sent', ${daysAgo(40)}::timestamptz, '{}'::jsonb)
        `;
      }

      if (["proposal-sent", "active-client"].includes(c.status)) {
        await db`
          insert into public.events (client_id, event_type, timestamp, metadata)
          values (
            ${clientId}::uuid, 'proposal_sent', ${daysAgo(25)}::timestamptz,
            ${JSON.stringify({ pipeline_value: c.deal_value })}::jsonb
          )
        `;
        // Insert deal
        await db`
          insert into public.deals (client_id, proposal_status, deal_value, service_type, sent_at)
          values (
            ${clientId}::uuid, 'sent', ${c.deal_value}, 'Revenue System',
            ${daysAgo(25)}::timestamptz
          )
        `;
      }

      if (c.status === "active-client") {
        await db`
          insert into public.events (client_id, event_type, timestamp, metadata)
          values (
            ${clientId}::uuid, 'client_activated', ${c.activated_at ?? daysAgo(20)}::timestamptz,
            ${JSON.stringify({ monthly_revenue: c.monthly_revenue })}::jsonb
          )
        `;
        // Update deal to accepted
        await db`
          update public.deals set proposal_status = 'accepted', accepted_at = ${c.activated_at ?? daysAgo(20)}::timestamptz
          where client_id = ${clientId}::uuid
        `;
      }
    }

    return NextResponse.json({ ok: true, message: "Seeded 5 dummy clients with pipeline events" });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
