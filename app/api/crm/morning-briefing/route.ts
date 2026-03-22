import { NextResponse } from "next/server";
import postgres from "postgres";
import { withApiMonitoring } from "../../../../lib/monitoring/api";

async function ensureBriefingsTable(db: any) {
  await db.unsafe(`
    create table if not exists briefings (
      id text primary key,
      briefing_date date not null,
      created_at timestamptz not null,
      sent_at timestamptz,
      client_count_scanned int not null,
      alerts_found int not null,
      competitor_moves_found int not null,
      opportunities_found int not null,
      briefing_json jsonb,
      briefing_text text
    );
    create index if not exists briefings_date_idx on briefings (briefing_date);
  `);
}

async function handler(req: Request) {
  const url = new URL(req.url);
  const tz = process.env.BRIEFING_TIMEZONE || "Africa/Johannesburg";
  const pgUrl = process.env.BRIEFING_PG_URL || "";

  if (!pgUrl) {
    return NextResponse.json({ ok: false, error: "BRIEFING_PG_URL missing" }, { status: 500 });
  }

  const db = postgres(pgUrl, { max: 5, prepare: false });
  try {
    await ensureBriefingsTable(db);

    // Prefer “today in configured timezone”; fall back to latest record.
    const record =
      (await db`
        select
          id,
          briefing_date,
          created_at,
          sent_at,
          client_count_scanned,
          alerts_found,
          competitor_moves_found,
          opportunities_found,
          briefing_json,
          briefing_text
        from briefings
        where briefing_date = (now() at time zone ${tz})::date
        order by created_at desc
        limit 1
      `.catch(() => [] as any[]))?.[0] ?? null;

    const fallback =
      record ??
      (await db`
        select
          id,
          briefing_date,
          created_at,
          sent_at,
          client_count_scanned,
          alerts_found,
          competitor_moves_found,
          opportunities_found,
          briefing_json,
          briefing_text
        from briefings
        order by created_at desc
        limit 1
      `.catch(() => [] as any[]))?.[0] ??
        null;

    return NextResponse.json({ ok: true, briefing: fallback, timezone: tz }, { status: 200 });
  } finally {
    await db.end({ timeout: 5 });
  }
}

export const GET = withApiMonitoring({ route: "/api/crm/morning-briefing", method: "GET", handler });

