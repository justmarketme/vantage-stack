type Dashboard = {
  ok: boolean;
  updated_at: string;
  uptime: null | { window_hours: number; uptime_pct: number };
  api: { status: string; p95_ms: number | null; error_rate: number | null; recent_points: any[] };
  api_endpoints?: Array<{
    route: string;
    method: string;
    avg_ms: number;
    p95_ms: number;
    error_rate: number;
    count: number;
    status: "green" | "yellow" | "red";
  }>;
  checks: any;
};

async function getDashboard(): Promise<Dashboard> {
  const base = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  const url = base ? `${base}/api/monitoring/dashboard` : "http://localhost:3000/api/monitoring/dashboard";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Monitoring dashboard fetch failed: ${res.status}`);
  return (await res.json()) as Dashboard;
}

function dot(status: string) {
  const cls =
    status === "green"
      ? "bg-emerald-400"
      : status === "yellow"
        ? "bg-amber-400"
        : status === "red"
          ? "bg-rose-400"
          : "bg-white/30";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`} />;
}

function badge(status: string) {
  const cls =
    status === "green"
      ? "bg-emerald-500/15 text-emerald-200 border-emerald-500/30"
      : status === "yellow"
        ? "bg-amber-500/15 text-amber-200 border-amber-500/30"
        : status === "red"
          ? "bg-rose-500/15 text-rose-200 border-rose-500/30"
          : "bg-white/5 text-white/70 border-white/10";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${cls}`}>{status}</span>;
}

function metric(label: string, value: string, hint?: string) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="text-xs uppercase tracking-[0.14em] text-textMuted">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="font-heading text-2xl tracking-tight text-textPrimary">{value}</div>
        {hint ? <div className="text-xs text-textMuted">{hint}</div> : null}
      </div>
    </div>
  );
}

export default async function MonitoringPage() {
  const data = await getDashboard();

  const uptimePct = data.uptime?.uptime_pct ?? null;
  const apiP95 = data.api?.p95_ms ?? null;
  const apiErr = data.api?.error_rate ?? null;
  const apiEndpoints = data.api_endpoints ?? [];

  const uptimeChecks = data.checks?.uptime ?? {};
  const thirdParty = data.checks?.third_party ?? {};
  const db = data.checks?.database ?? { status: "unknown" };
  const dbSize = data.checks?.database_size ?? null;

  const uptimeServices = Object.entries(uptimeChecks) as Array<[string, any]>;
  const thirdPartyServices = Object.entries(thirdParty) as Array<[string, any]>;

  return (
    <main className="vs-container pt-28 pb-16">
      <div className="max-w-6xl">
        <div className="flex items-end justify-between gap-6">
          <div>
            <h1 className="font-heading text-3xl tracking-tight">System Health</h1>
            <p className="mt-2 text-sm text-textMuted">
              Updated <span className="text-textPrimary">{new Date(data.updated_at).toISOString().replace("T", " ").slice(0, 19)}Z</span>
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-textMuted">
            <span className="text-textPrimary">API</span> {badge(data.api.status)}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {metric("Uptime (est.)", uptimePct === null ? "—" : `${uptimePct}%`, "last 24h")}
          {metric("API p95", apiP95 === null ? "—" : `${Math.round(apiP95)}ms`, "last 1h")}
          {metric("Error rate", apiErr === null ? "—" : `${apiErr}%`, "last 1h")}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-white/10 bg-black/30 overflow-hidden">
            <div className="border-b border-white/10 px-5 py-4">
              <div className="text-xs uppercase tracking-[0.14em] text-textMuted">Uptime monitors</div>
              <div className="mt-1 text-sm text-textPrimary">Critical services (5 min cadence)</div>
            </div>
            <div className="divide-y divide-white/5">
              {uptimeServices.length ? (
                uptimeServices.map(([name, v]) => (
                  <div key={name} className="flex items-center justify-between gap-4 px-5 py-4">
                    <div className="flex items-center gap-3">
                      {dot(v.status)}
                      <div className="font-medium text-textPrimary">{name}</div>
                    </div>
                    <div className="text-xs text-textMuted">
                      {v.checked_at ? new Date(v.checked_at).toISOString().replace("T", " ").slice(0, 19) + "Z" : "—"}
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-5 py-6 text-sm text-textMuted">
                  No uptime status recorded yet. Configure UptimeRobot/BetterUptime and point it at your `/api/health` and `/api/monitoring/*` URLs (including the Telegram heartbeat).
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-black/30 overflow-hidden">
            <div className="border-b border-white/10 px-5 py-4">
              <div className="text-xs uppercase tracking-[0.14em] text-textMuted">Database</div>
              <div className="mt-1 space-y-2 text-sm text-textPrimary">
                <div className="flex items-center gap-2">
                  {badge(db.status ?? "unknown")}
                  <span className="text-textMuted">{db.details ?? ""}</span>
                </div>
                {dbSize ? (
                  <div className="flex items-center gap-2">
                    {badge(dbSize.status ?? "unknown")}
                    <span className="text-textMuted">
                      {dbSize.details ?? ""}
                      {dbSize.size_mb != null && dbSize.limit_mb != null ? ` (${Math.round(dbSize.size_mb)}MB/${Math.round(dbSize.limit_mb)}MB)` : ""}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="px-5 py-5 text-sm text-textMuted">
              Deep checks run via <code className="text-textPrimary">/api/health?deep=1</code>. Slow-query alerting is surfaced via Telegram (queries &gt; 1s).
            </div>
          </section>
        </div>

        <section className="mt-8 rounded-2xl border border-white/10 bg-black/30 overflow-hidden">
          <div className="border-b border-white/10 px-5 py-4">
            <div className="text-xs uppercase tracking-[0.14em] text-textMuted">API endpoints (avg / p95)</div>
            <div className="mt-1 text-sm text-textPrimary">Top endpoints by p95 latency (last 1h)</div>
          </div>
          <div className="divide-y divide-white/5">
            {apiEndpoints.length ? (
              apiEndpoints.map((e) => (
                <div key={`${e.method}_${e.route}`} className="grid grid-cols-12 gap-3 px-5 py-4 text-sm items-center">
                  <div className="col-span-5">
                    <div className="flex items-center gap-3">
                      {dot(e.status)}
                      <div className="font-medium text-textPrimary">
                        <span className="font-mono text-xs text-textMuted">{e.method}</span> {e.route}
                      </div>
                    </div>
                  </div>
                  <div className="col-span-3 text-xs text-textMuted">
                    avg: <span className="text-textPrimary">{Math.round(e.avg_ms)}ms</span>
                  </div>
                  <div className="col-span-2 text-xs text-textMuted">
                    p95: <span className="text-textPrimary">{Math.round(e.p95_ms)}ms</span>
                  </div>
                  <div className="col-span-2 text-xs text-textMuted">
                    err: <span className="text-textPrimary">{e.error_rate}%</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-5 py-6 text-sm text-textMuted">No API timings recorded yet. Wrap additional routes with the monitoring wrapper.</div>
            )}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-white/10 bg-black/30 overflow-hidden">
          <div className="border-b border-white/10 px-5 py-4">
            <div className="text-xs uppercase tracking-[0.14em] text-textMuted">Third‑party APIs</div>
            <div className="mt-1 text-sm text-textPrimary">Hourly health checks (alert after 3 consecutive failures)</div>
          </div>
          <div className="divide-y divide-white/5">
            {thirdPartyServices.length ? (
              thirdPartyServices.map(([name, v]) => (
                <div key={name} className="grid grid-cols-12 gap-3 px-5 py-4 text-sm">
                  <div className="col-span-4 flex items-center gap-3">
                    {dot(v.status)}
                    <div className="font-medium text-textPrimary">{name}</div>
                  </div>
                  <div className="col-span-4 text-xs text-textMuted">{v.details ?? "—"}</div>
                  <div className="col-span-2 text-xs text-textMuted">
                    fails: <span className="text-textPrimary">{v.consecutive_failures ?? 0}</span>
                  </div>
                  <div className="col-span-2 text-xs text-textMuted">
                    {v.checked_at ? new Date(v.checked_at).toISOString().replace("T", " ").slice(0, 19) + "Z" : "—"}
                  </div>
                </div>
              ))
            ) : (
              <div className="px-5 py-6 text-sm text-textMuted">
                No third‑party status recorded yet. Enable the cron route and set provider keys in your environment.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

