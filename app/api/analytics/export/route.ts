import { NextResponse } from "next/server";
import { withApiMonitoring } from "../../../../lib/monitoring/api";
import { connectAnalyticsDb, ensureAnalyticsTables } from "../../../../lib/analytics/db";
import { calculateBusinessMetrics, analyzeFunnel, generateRevenueChartData } from "../../../../lib/analytics/engine-v2";
import { connectSchedulerDb, ensureSchedulerTables, listLatestRunsByJob, closeSchedulerDb } from "../../../../lib/scheduler-engine/db";

function toCsv(rows: Array<Record<string, unknown>>) {
  const cols = Array.from(
    rows.reduce((set, r) => {
      for (const k of Object.keys(r)) set.add(k);
      return set;
    }, new Set<string>()),
  );
  const esc = (v: unknown) => {
    const s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
    const needs = /[",\n]/.test(s);
    return needs ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc((r as any)[c])).join(","))].join("\n") + "\n";
}

async function handler(req: Request) {
  const { searchParams } = new URL(req.url);
  const kind = (searchParams.get("kind") || "metrics").trim(); // metrics|funnel|mrr_delta
  const start_date = searchParams.get("start_date") || undefined;
  const end_date = searchParams.get("end_date") || undefined;

  const db = connectAnalyticsDb();
  try {
    if (!db) return NextResponse.json({ ok: false, error: "Missing DATABASE_URL" }, { status: 500 });
    await ensureAnalyticsTables(db);

    const start = start_date ? new Date(start_date) : new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    const end = end_date ? new Date(end_date) : new Date();

    if (kind === "funnel") {
      const funnel = await analyzeFunnel(db, { start_date, end_date });
      const csv = toCsv(funnel.steps.map((s) => ({ step: s.step, clients: s.clients })));
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="funnel-${funnel.range.start_date}-to-${funnel.range.end_date}.csv"`,
        },
      });
    }

    if (kind === "mrr_delta") {
      const charts = await generateRevenueChartData(db, { start_date, end_date });
      const series = charts.charts.mrr_delta.labels.map((label, idx) => ({
        bucket: label,
        mrr_added: (charts.charts.mrr_delta.datasets[0]?.data as any[])?.[idx] ?? 0,
      }));
      const csv = toCsv(series);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="mrr-delta-${charts.range.start_date}-to-${charts.range.end_date}.csv"`,
        },
      });
    }

    if (kind === "acquisition") {
      const rows = await db<Array<{ day: string; count: number }>>`
        select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
               count(*)::int as count
        from public.clients
        where created_at >= ${start.toISOString()}::timestamptz
          and created_at < ${end.toISOString()}::timestamptz
        group by 1
        order by 1 asc
        limit 180
      `;
      const csv = toCsv(rows.map((r) => ({ day: r.day, blueprint_submissions: Number(r.count ?? 0) })));
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="acquisition-${start.toISOString().slice(0, 10)}-to-${end.toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    if (kind === "upsells") {
      const upsellRows = await db<Array<{ service_name: string; accepted: number; sent: number }>>`
        with sent as (
          select service_name::text as service_name, count(*)::int as sent
          from public.upsells
          where status = 'sent'
            and coalesce(sent_at, created_at) >= ${start.toISOString()}::timestamptz
            and coalesce(sent_at, created_at) < ${end.toISOString()}::timestamptz
          group by 1
        ),
        acc as (
          select service_name::text as service_name, count(*)::int as accepted
          from public.upsells
          where status = 'accepted'
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
      const csv = toCsv(
        upsellRows.map((r) => ({ service_type: String(r.service_name || "Unknown"), upsells_sent: Number(r.sent ?? 0), upsells_accepted: Number(r.accepted ?? 0) })),
      );
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="upsells-${start.toISOString().slice(0, 10)}-to-${end.toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    if (kind === "agent_performance") {
      const sched = connectSchedulerDb();
      try {
        if (!sched) {
          return NextResponse.json({ ok: false, error: "Missing scheduler DB URL" }, { status: 500 });
        }
        await ensureSchedulerTables(sched);
        const names = ["research-batch", "morning-briefing", "weekly-reports"];
        const latest = await listLatestRunsByJob(sched, names);
        const rows = names.map((n) => {
          const last = latest.get(n) ?? null;
          return {
            job_name: n,
            status: last?.status ?? null,
            started_at: last?.started_at ?? null,
            finished_at: last?.finished_at ?? null,
            attempt: last?.attempt ?? null,
            max_attempts: last?.max_attempts ?? null,
          };
        });
        const csv = toCsv(rows);
        return new NextResponse(csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="agent-performance.csv"`,
          },
        });
      } finally {
        if (sched) await closeSchedulerDb(sched);
      }
    }

    const metrics = await calculateBusinessMetrics(db, { start_date, end_date });
    const csv = toCsv([{ ...metrics.metrics, start_date: metrics.range.start_date, end_date: metrics.range.end_date }]);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="metrics-${metrics.range.start_date}-to-${metrics.range.end_date}.csv"`,
      },
    });
  } finally {
    if (db) await db.end({ timeout: 5 });
  }
}

export const GET = withApiMonitoring({ route: "/api/analytics/export", method: "GET", handler });

