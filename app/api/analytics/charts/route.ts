import { NextResponse } from "next/server";
import { withApiMonitoring } from "../../../../lib/monitoring/api";
import { connectAnalyticsDb, ensureAnalyticsTables } from "../../../../lib/analytics/db";
import { generateRevenueChartData } from "../../../../lib/analytics/engine-v2";
import { connectSchedulerDb, ensureSchedulerTables, listLatestRunsByJob, closeSchedulerDb } from "../../../../lib/scheduler-engine/db";

async function handler(req: Request) {
  const { searchParams } = new URL(req.url);
  const start_date = searchParams.get("start_date") || undefined;
  const end_date = searchParams.get("end_date") || undefined;
  const granularity = (searchParams.get("granularity") as any) || undefined;

  const db = connectAnalyticsDb();
  try {
    if (!db) return NextResponse.json({ ok: false, error: "Missing DATABASE_URL" }, { status: 500 });
    await ensureAnalyticsTables(db);

    const revenue = await generateRevenueChartData(db, { start_date, end_date, granularity });

    const start = start_date ? new Date(start_date) : new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    const end = end_date ? new Date(end_date) : new Date();

    const acquisitionRows = await db<Array<{ day: string; count: number }>>`
      select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, count(*)::int as count
      from public.clients
      where created_at >= ${start.toISOString()}::timestamptz
        and created_at < ${end.toISOString()}::timestamptz
      group by 1
      order by 1 asc
      limit 180
    `;
    const acquisition = {
      labels: acquisitionRows.map((r) => String(r.day)),
      datasets: [{ label: "Blueprint submissions", data: acquisitionRows.map((r) => Number(r.count ?? 0)) }],
    };

    const upsellRows = await db<Array<{ service_name: string; accepted: number; sent: number }>>`
      with sent as (
        select service_name::text as service_name, count(*)::int as sent
        from public.upsells
        where status='sent'
          and coalesce(sent_at, created_at) >= ${start.toISOString()}::timestamptz
          and coalesce(sent_at, created_at) < ${end.toISOString()}::timestamptz
        group by 1
      ),
      acc as (
        select service_name::text as service_name, count(*)::int as accepted
        from public.upsells
        where status='accepted'
          and coalesce(sent_at, created_at) >= ${start.toISOString()}::timestamptz
          and coalesce(sent_at, created_at) < ${end.toISOString()}::timestamptz
        group by 1
      )
      select coalesce(s.service_name, a.service_name, 'Unknown') as service_name,
             coalesce(a.accepted, 0)::int as accepted,
             coalesce(s.sent, 0)::int as sent
      from sent s
      full outer join acc a on a.service_name = s.service_name
      order by accepted desc, sent desc
      limit 20
    `;
    const upsellPerformance = {
      labels: upsellRows.map((r) => String(r.service_name || "Unknown")),
      datasets: [
        { label: "Upsell sent", data: upsellRows.map((r) => Number(r.sent ?? 0)) },
        { label: "Upsell accepted", data: upsellRows.map((r) => Number(r.accepted ?? 0)) },
      ],
    };

    // Agent performance from scheduler table (if configured).
    const sched = connectSchedulerDb();
    let agentPerformance: any = { ok: false, jobs: [] as any[] };
    try {
      if (sched) {
        await ensureSchedulerTables(sched);
        const names = ["research-batch", "morning-briefing", "weekly-reports"];
        const latest = await listLatestRunsByJob(sched, names);
        agentPerformance = {
          ok: true,
          jobs: names.map((n) => ({ name: n, last_run: latest.get(n) ?? null })),
        };
      }
    } finally {
      if (sched) await closeSchedulerDb(sched);
    }

    return NextResponse.json({
      ok: true,
      revenue,
      acquisition,
      upsellPerformance,
      agentPerformance,
    });
  } finally {
    if (db) await db.end({ timeout: 5 });
  }
}

export const GET = withApiMonitoring({ route: "/api/analytics/charts", method: "GET", handler });

