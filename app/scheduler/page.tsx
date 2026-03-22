"use client";

import { useEffect, useState } from "react";
import { Navbar } from "../../components/layout/Navbar";

type DashboardResponse = {
  ok: boolean;
  timezone: string;
  jobs: Array<{
    name: string;
    path: string;
    schedule: string;
    timezone: string;
    next_run_utc: string | null;
    last_run: null | {
      id: string;
      job_name: string;
      started_at: string;
      finished_at?: string;
      status: "success" | "partial" | "failed";
      attempt: number;
      max_attempts: number;
      error?: { message: string };
    };
  }>;
};

function statusPill(status: string) {
  const cls =
    status === "success"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : status === "partial"
        ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
        : "bg-rose-500/15 text-rose-300 border-rose-500/30";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${cls}`}>{status}</span>;
}

export default function SchedulerPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/scheduler/dashboard", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`Dashboard fetch failed: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        setData(json as DashboardResponse);
        setError(null);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setData(null);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <Navbar />
      <main className="vs-container pt-28 pb-16">
        <div className="max-w-5xl">
          <h1 className="font-heading text-3xl tracking-tight text-textPrimary">Scheduler Dashboard</h1>

          {loading && (
            <p className="mt-4 text-sm text-textMuted animate-pulse">Loading jobs…</p>
          )}

          {error && (
            <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6">
              <p className="font-medium text-rose-200">API error</p>
              <p className="mt-2 text-sm text-rose-200/80">{error}</p>
              <p className="mt-2 text-xs text-textMuted">
                Ensure DATABASE_URL or SCHEDULER_PG_URL is set in .env.local and the database is reachable.
              </p>
            </div>
          )}

          {!loading && !error && data && (
            <>
              <p className="mt-2 text-sm text-textMuted">
                Timezone: <span className="text-textPrimary">{data.timezone}</span>
              </p>

              <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                <div className="grid grid-cols-12 gap-0 border-b border-white/10 px-4 py-3 text-xs uppercase tracking-[0.14em] text-textMuted">
                  <div className="col-span-3">Job</div>
                  <div className="col-span-3">Schedule</div>
                  <div className="col-span-3">Next run (UTC)</div>
                  <div className="col-span-3">Last run</div>
                </div>

                {data.jobs.map((j) => {
                  const last = j.last_run;
                  const lastLine = last
                    ? `${new Date(last.started_at).toISOString().replace("T", " ").slice(0, 19)}Z • attempt ${last.attempt}/${last.max_attempts}`
                    : "—";
                  return (
                    <div key={j.name} className="grid grid-cols-12 gap-0 px-4 py-4 text-sm border-b border-white/5">
                      <div className="col-span-3">
                        <div className="font-medium text-textPrimary">{j.name}</div>
                        <div className="mt-1 text-xs text-textMuted">{j.path}</div>
                      </div>
                      <div className="col-span-3 font-mono text-xs text-textPrimary">{j.schedule}</div>
                      <div className="col-span-3 text-xs text-textPrimary font-mono">{j.next_run_utc ?? "—"}</div>
                      <div className="col-span-3">
                        <div className="flex items-center gap-2">
                          {last ? statusPill(last.status) : statusPill("failed")}
                          <span className="text-xs text-textMuted">{lastLine}</span>
                        </div>
                        {last?.error?.message ? (
                          <div className="mt-1 text-xs text-rose-200/80">{last.error.message}</div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="mt-4 text-xs text-textMuted">
                Tip: cron jobs are defined in vercel.json and run on Vercel.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
