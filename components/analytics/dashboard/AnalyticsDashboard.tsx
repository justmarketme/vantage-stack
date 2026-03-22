"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { KpiCard } from "../KpiCard";
import { ChartCard } from "../ChartCard";
import { ExportButtons } from "../ExportButtons";
import { LineChart, BarChart } from "../charts";

function fmtPct(v: number | null) {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function fmtPctAbs(v: number | null) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(1)}%`;
}

function fmtMoney(v: number) {
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function AnalyticsDashboard() {
  const [metrics, setMetrics] = useState<any>(null);
  const [funnel, setFunnel] = useState<any>(null);
  const [charts, setCharts] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [m, f, c] = await Promise.all([
          fetch("/api/analytics/metrics").then((r) => r.json()),
          fetch("/api/analytics/funnel").then((r) => r.json()),
          fetch("/api/analytics/charts?granularity=day").then((r) => r.json()),
        ]);
        if (cancelled) return;
        setMetrics(m);
        setFunnel(f);
        setCharts(c);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const m = metrics?.metrics ?? {};
  const funnelData = useMemo(() => {
    const steps = Array.isArray(funnel?.steps) ? funnel.steps : [];
    return {
      labels: steps.map((s: any) => String(s.step).replace(/_/g, " ")),
      datasets: [
        {
          label: "Clients",
          data: steps.map((s: any) => Number(s.clients ?? 0)),
          backgroundColor: "rgba(15,23,42,0.82)",
          borderRadius: 10,
        },
      ],
    };
  }, [funnel]);

  const mrrDelta = useMemo(() => {
    const base = charts?.revenue?.charts?.mrr_delta;
    if (!base) return null;
    return {
      labels: base.labels,
      datasets: [
        {
          label: base.datasets?.[0]?.label ?? "MRR added",
          data: base.datasets?.[0]?.data ?? [],
          borderColor: "#0f172a",
          backgroundColor: "rgba(15,23,42,0.10)",
          fill: true,
          tension: 0.35,
          pointRadius: 2,
        },
      ],
    };
  }, [charts]);

  const acquisition = useMemo(() => {
    const base = charts?.acquisition;
    if (!base) return null;
    return {
      labels: base.labels,
      datasets: [
        {
          label: base.datasets?.[0]?.label ?? "Blueprint submissions",
          data: base.datasets?.[0]?.data ?? [],
          borderColor: "#1d4ed8",
          backgroundColor: "rgba(29,78,216,0.10)",
          fill: true,
          tension: 0.35,
          pointRadius: 0,
        },
      ],
    };
  }, [charts]);

  const upsellPerformance = useMemo(() => {
    const base = charts?.upsellPerformance;
    if (!base) return null;
    return {
      labels: base.labels,
      datasets: [
        {
          label: base.datasets?.[0]?.label ?? "Sent",
          data: base.datasets?.[0]?.data ?? [],
          backgroundColor: "rgba(148,163,184,0.55)",
          borderRadius: 8,
        },
        {
          label: base.datasets?.[1]?.label ?? "Accepted",
          data: base.datasets?.[1]?.data ?? [],
          backgroundColor: "rgba(15,23,42,0.82)",
          borderRadius: 8,
        },
      ],
    };
  }, [charts]);

  const forecast = charts?.revenue?.charts?.forecast_next_month?.projection;
  const agentJobs = charts?.agentPerformance?.jobs ?? [];

  return (
    <div className="min-h-screen bg-[#f7f8fb] text-slate-900">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-semibold tracking-wide text-slate-500">Analytics</div>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Business Intelligence</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Revenue, pipeline, funnel conversion, acquisition, upsells, and agent health. Export any view to CSV or a
                PDF snapshot.
              </p>
            </div>
            <div className="mt-4 sm:mt-0">
              <ExportButtons
                exportCsvUrl="/api/analytics/export?kind=metrics"
                exportCsvName="metrics.csv"
                pdfTargetId="analytics-dashboard"
                pdfName="analytics-dashboard.pdf"
              />
            </div>
          </div>
        </motion.div>

        <div id="analytics-dashboard" className="mt-8 space-y-8">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
              <KpiCard label="Monthly recurring revenue (MRR)" value={fmtMoney(Number(m.monthly_recurring_revenue ?? 0))} />
              <KpiCard label="Average revenue per client" value={fmtMoney(Number(m.average_revenue_per_client ?? 0))} />
              <KpiCard label="Total pipeline value" value={fmtMoney(Number(m.total_pipeline_value ?? 0))} />
              <KpiCard
                label="Projected next-month MRR added"
                value={fmtMoney(Number(forecast?.next_month_mrr_added ?? 0))}
                sub="Model uses pipeline + historical conversion + upsell momentum"
              />
              <KpiCard
                label="Churn rate (this month)"
                value={fmtPctAbs(Number(m.churn_rate ?? 0))}
                sub="Churned clients this month / active clients at month start"
              />
              <KpiCard
                label="Client retention"
                value={fmtPctAbs(Math.max(0, 100 - Number(m.churn_rate ?? 0)))}
                sub="Retention = 100% - churn rate"
              />
            </div>
          </motion.div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <ChartCard
                title="Revenue overview"
                subtitle="MRR added over time (from client_activated + upsell_accepted event revenue metadata)"
                right={
                  <ExportButtons
                    exportCsvUrl="/api/analytics/export?kind=mrr_delta"
                    exportCsvName="mrr-delta.csv"
                    pdfTargetId="chart-revenue"
                    pdfName="revenue-overview.pdf"
                  />
                }
              >
                <div id="chart-revenue" className="rounded-xl bg-white">
                  {mrrDelta ? <LineChart data={mrrDelta} height={280} /> : <div className="h-[280px]" />}
                </div>
              </ChartCard>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
              <ChartCard
                title="Pipeline funnel"
                subtitle={`Proposal conversion ${fmtPct(m.proposal_conversion_rate ?? null)} · Activation ${fmtPct(
                  m.client_activation_rate ?? null,
                )} · Upsell ${fmtPct(m.upsell_conversion_rate ?? null)}`}
                right={
                  <ExportButtons
                    exportCsvUrl="/api/analytics/export?kind=funnel"
                    exportCsvName="funnel.csv"
                    pdfTargetId="chart-funnel"
                    pdfName="pipeline-funnel.pdf"
                  />
                }
              >
                <div id="chart-funnel">
                  <BarChart data={funnelData} height={280} />
                </div>
              </ChartCard>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
              <ChartCard
                title="Client acquisition trends"
                subtitle="Blueprint submissions over time"
                right={
                  <ExportButtons
                    exportCsvUrl="/api/analytics/export?kind=acquisition"
                    exportCsvName="acquisition.csv"
                    pdfTargetId="chart-acquisition"
                    pdfName="acquisition-trends.pdf"
                  />
                }
              >
                <div id="chart-acquisition" className="rounded-xl bg-white">
                  {acquisition ? <LineChart data={acquisition} height={280} /> : <div className="h-[280px]" />}
                </div>
              </ChartCard>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
              <ChartCard
                title="Upsell performance"
                subtitle="By service type (from upsells.service_name)"
                right={
                  <ExportButtons
                    exportCsvUrl="/api/analytics/export?kind=upsells"
                    exportCsvName="upsells-performance.csv"
                    pdfTargetId="chart-upsells"
                    pdfName="upsell-performance.pdf"
                  />
                }
              >
                <div id="chart-upsells" className="rounded-xl bg-white">
                  {upsellPerformance ? <BarChart data={upsellPerformance} height={280} stacked /> : <div className="h-[280px]" />}
                </div>
              </ChartCard>
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
            <ChartCard
              title="Agent performance"
              subtitle="Latest job run status from scheduler logs"
              right={
                <ExportButtons
                  exportCsvUrl="/api/analytics/export?kind=agent_performance"
                  exportCsvName="agent-performance.csv"
                  pdfTargetId="chart-agent-performance"
                  pdfName="agent-performance.pdf"
                />
              }
            >
              <div id="chart-agent-performance" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {agentJobs.map((j: any) => {
                  const last = j?.last_run;
                  const status = String(last?.status ?? "unknown");
                  const ok = status === "success";
                  return (
                    <div key={j.name} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-slate-900">{j.name}</div>
                        <div
                          className={[
                            "rounded-full px-2 py-1 text-[11px] font-semibold",
                            ok ? "bg-emerald-50 text-emerald-700" : status === "failed" ? "bg-rose-50 text-rose-700" : "bg-slate-50 text-slate-700",
                          ].join(" ")}
                        >
                          {status}
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        {last?.started_at ? `Last run: ${new Date(last.started_at).toLocaleString()}` : loading ? "Loading…" : "No runs yet"}
                      </div>
                    </div>
                  );
                })}
              </div>
              {loading ? <div className="mt-3 text-xs text-slate-500">Loading dashboard data…</div> : null}
            </ChartCard>
          </motion.div>
        </div>

        <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 text-xs text-slate-600">
          <div className="font-semibold text-slate-900">Revenue data model</div>
          <div className="mt-2 leading-relaxed">
            This dashboard computes MRR from <span className="font-semibold">deals</span> and <span className="font-semibold">upsells</span>: sum of{" "}
            <span className="font-semibold">deals.deal_value</span> for accepted deals plus <span className="font-semibold">upsells.projected_revenue</span> for accepted upsells.{" "}
            Pipeline value is derived from in-flight deals plus in-flight upsells (best-effort).
          </div>
        </div>
      </div>
    </div>
  );
}

