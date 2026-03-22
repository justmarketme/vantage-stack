import type { Sql } from "postgres";

export type ActiveClientRow = {
  id: string;
  name: string;
  email: string | null;
  status?: string | null;
  last_active_at?: string | null;
};

export type WeeklyMetrics = {
  week_window: { since_iso: string; until_iso: string };
  prev_week_window: { since_iso: string; until_iso: string };
  totals: {
    visitors: number;
    new_leads: number;
    conversion_rate: number; // 0-1
    cost_per_lead_usd: number | null;
    revenue_attributed_usd: number | null;
  };
  wow: {
    visitors_delta: number;
    visitors_delta_pct: number | null;
    trend: "positive" | "negative" | "flat";
  };
  daily_visitors_last_14d: Array<{ date: string; visitors: number }>;
};

function env(name: string) {
  return (process.env[name] || "").trim();
}

function toNumber(v: any): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function utcWindow(days: number, until = new Date()) {
  const untilIso = until.toISOString();
  const since = new Date(until.getTime() - days * 24 * 60 * 60 * 1000);
  const sinceIso = since.toISOString();
  return { since_iso: sinceIso, until_iso: untilIso };
}

export async function listActiveClients(db: Sql): Promise<ActiveClientRow[]> {
  const sqlOverride = env("WEEKLY_SQL_ACTIVE_CLIENTS");
  if (sqlOverride) {
    const rows = await db.unsafe(sqlOverride, []);
    return (rows ?? []).map((r: any) => ({
      id: String(r.id),
      name: String(r.name ?? "Unknown"),
      email: r.email ? String(r.email) : null,
      status: r.status ? String(r.status) : null,
      last_active_at: r.last_active_at ? String(r.last_active_at) : null,
    }));
  }

  await db.unsafe(`
    create table if not exists clients (
      id text primary key,
      name text,
      email text,
      status text,
      last_active_at timestamptz
    );
  `);

  const rows = await db.unsafe(
    `
    select
      id::text as id,
      coalesce(name, 'Unknown')::text as name,
      nullif(email,'')::text as email,
      status::text as status,
      last_active_at::timestamptz as last_active_at
    from clients
    where status = 'active-client'
      and last_active_at is not null
      and last_active_at >= (now() at time zone 'UTC') - interval '14 days'
    order by name asc
  `,
    [],
  );

  return (rows ?? []).map((r: any) => ({
    id: String(r.id),
    name: String(r.name ?? "Unknown"),
    email: r.email ? String(r.email) : null,
    status: r.status ? String(r.status) : null,
    last_active_at: r.last_active_at ? new Date(r.last_active_at).toISOString() : null,
  }));
}

export async function hasWeeklyReportForWindow(db: Sql, clientId: string, weekOfIsoDate: string) {
  // weekOfIsoDate is stored in reports.source->>'week_of'
  const rows = await db.unsafe(
    `
    select id
    from reports
    where report_type = 'weekly-performance'
      and client_id = $1
      and (source->>'week_of') = $2
    limit 1
  `,
    [clientId, weekOfIsoDate],
  );
  return Boolean(rows?.length);
}

export async function computeWeeklyMetrics(params: {
  db: Sql;
  client_id: string;
  week: { since_iso: string; until_iso: string };
  prev_week: { since_iso: string; until_iso: string };
}): Promise<WeeklyMetrics> {
  const { db, client_id, week, prev_week } = params;

  const aggSql =
    env("WEEKLY_SQL_WEEKLY_METRICS") ||
    `
    -- Default expectation: campaign data is stored in reports rows as jsonb source.
    -- We aggregate last 7 days and previous 7 days from report_type='campaign-daily'.
    with src as (
      select
        created_at,
        source
      from reports
      where client_id = $1
        and report_type = 'campaign-daily'
        and created_at >= $2::timestamptz
        and created_at < $3::timestamptz
    )
    select
      coalesce(sum((source->>'visitors')::float8), 0)::float8 as visitors,
      coalesce(sum((source->>'new_leads')::float8), 0)::float8 as new_leads,
      coalesce(sum((source->>'ad_spend_usd')::float8), 0)::float8 as ad_spend_usd,
      nullif(coalesce(sum((source->>'revenue_attributed_usd')::float8), 0)::float8, 0)::float8 as revenue_attributed_usd
    from src
  `;

  const [cur, prev] = await Promise.all([
    db.unsafe(aggSql, [client_id, week.since_iso, week.until_iso]),
    db.unsafe(aggSql, [client_id, prev_week.since_iso, prev_week.until_iso]),
  ]);

  const curRow = cur?.[0] ?? {};
  const prevRow = prev?.[0] ?? {};

  const visitors = Math.max(0, Math.round(toNumber(curRow.visitors) ?? 0));
  const new_leads = Math.max(0, Math.round(toNumber(curRow.new_leads) ?? 0));
  const spend = toNumber(curRow.ad_spend_usd);
  const revenue = toNumber(curRow.revenue_attributed_usd);

  const prevVisitors = Math.max(0, Math.round(toNumber(prevRow.visitors) ?? 0));

  const conversion_rate = visitors > 0 ? new_leads / visitors : 0;
  const cost_per_lead_usd = new_leads > 0 && spend != null ? spend / new_leads : null;
  const revenue_attributed_usd = revenue != null ? revenue : null;

  const visitors_delta = visitors - prevVisitors;
  const visitors_delta_pct = prevVisitors > 0 ? visitors_delta / prevVisitors : null;
  const trend = visitors_delta > 0 ? "positive" : visitors_delta < 0 ? "negative" : "flat";

  const trendSql =
    env("WEEKLY_SQL_TRAFFIC_TREND") ||
    `
    with days as (
      select
        (created_at at time zone 'UTC')::date as day,
        coalesce((source->>'visitors')::float8, 0)::float8 as visitors
      from reports
      where client_id = $1
        and report_type = 'campaign-daily'
        and created_at >= $2::timestamptz
        and created_at < $3::timestamptz
    )
    select day::text as date, coalesce(sum(visitors),0)::float8 as visitors
    from days
    group by day
    order by day asc
  `;

  const last14 = utcWindow(14, new Date(week.until_iso));
  const trendRows = await db.unsafe(trendSql, [client_id, last14.since_iso, last14.until_iso]);
  const daily_visitors_last_14d = (trendRows ?? []).map((r: any) => ({
    date: String(r.date),
    visitors: Math.max(0, Math.round(toNumber(r.visitors) ?? 0)),
  }));

  return {
    week_window: week,
    prev_week_window: prev_week,
    totals: { visitors, new_leads, conversion_rate, cost_per_lead_usd, revenue_attributed_usd },
    wow: { visitors_delta, visitors_delta_pct, trend },
    daily_visitors_last_14d,
  };
}

