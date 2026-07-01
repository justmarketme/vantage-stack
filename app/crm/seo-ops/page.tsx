"use client";

import { useCallback, useEffect, useState } from "react";

// ───────────────────────────────────────────────────────────────────────────
// CRM › SEO Ops — live monitor for the SEO/marketing operation Cowork runs.
// Renders the data Cowork writes to crm_dashboard_data/ (COWORK_INTERFACE.md).
// This tab only reads (via /api/crm/seo-ops); it never authors the data.
// ───────────────────────────────────────────────────────────────────────────

const REFRESH_MS = 20_000;

type SubAgent = {
  agent_name: string;
  current_task: string;
  status: string;
  progress_percent: number;
  tasks_completed: number;
  last_update: string;
};
type PipelineItem = {
  piece_id: string;
  title: string;
  status: string;
  owner_next?: string;
  platform_targets?: string[];
  created_date?: string;
  scheduled_publish?: string;
};
type NextJob = { job: string; when: string; status: string };
type AnalyticsSnapshot = {
  gsc_impressions_week?: number;
  gsc_clicks_week?: number;
  ga4_sessions_week?: number;
  social_posts_published?: number;
  ads_live?: number;
  ai_citations_detected?: number;
  note?: string;
};
type Dashboard = {
  goal?: string;
  why?: string;
  last_updated?: string;
  overview?: { total_tasks_active?: number; completed_this_week?: number; pending_review?: number };
  sub_agents?: SubAgent[];
  content_pipeline?: PipelineItem[];
  analytics_snapshot?: AnalyticsSnapshot;
  next_scheduled?: NextJob[];
};
type ApiResponse = {
  ok: boolean;
  source: string;
  dashboard: Dashboard | null;
  dashboard_error: string | null;
  events: unknown[];
  events_error: string | null;
};

function timeAgo(dateStr?: string) {
  if (!dateStr) return "—";
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Maps a free-text status to a colour family. Cowork uses a loose vocabulary
// (Ready / Idle / running / awaiting_review / review / live / living …), so we
// classify by keyword rather than an exhaustive enum.
function statusTone(status: string): string {
  const s = (status || "").toLowerCase();
  if (s.includes("await") || s.includes("review") || s.includes("pending")) return "amber";
  if (s.includes("run") || s.includes("progress") || s.includes("build")) return "blue";
  if (s.includes("live") || s.includes("ready") || s.includes("done") || s.includes("pass")) return "emerald";
  if (s.includes("idle")) return "muted";
  return "sky";
}
const TONE_CLASSES: Record<string, string> = {
  amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  blue: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  sky: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  muted: "bg-white/5 text-textMuted border-white/10",
};
const BAR_CLASSES: Record<string, string> = {
  amber: "bg-amber-400",
  blue: "bg-blue-400",
  emerald: "bg-emerald-400",
  sky: "bg-sky-400",
  muted: "bg-white/20",
};

function StatusBadge({ status }: { status: string }) {
  const tone = statusTone(status);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${TONE_CLASSES[tone]}`}
    >
      {status || "—"}
    </span>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-white/[0.08] bg-[#16161A] p-4 md:p-5 ${className}`}
    >
      {children}
    </div>
  );
}

const ANALYTICS_LABELS: { key: keyof AnalyticsSnapshot; label: string }[] = [
  { key: "gsc_impressions_week", label: "GSC impressions" },
  { key: "gsc_clicks_week", label: "GSC clicks" },
  { key: "ga4_sessions_week", label: "GA4 sessions" },
  { key: "social_posts_published", label: "Social posts" },
  { key: "ads_live", label: "Ads live" },
  { key: "ai_citations_detected", label: "AI citations" },
];

export default function SeoOpsPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/crm/seo-ops", { credentials: "same-origin", cache: "no-store" });
      const json = (await res.json()) as ApiResponse;
      setData(json);
      setFetchedAt(Date.now());
    } catch {
      // keep last-known data; a transient fetch failure shouldn't blank the tab
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const dash = data?.dashboard ?? null;

  return (
    <div className="space-y-5 md:space-y-7">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold text-textPrimary">SEO Ops</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              Live
            </span>
          </div>
          <p className="mt-0.5 text-sm text-textMuted">
            Everything Cowork is doing on the SEO plan — content, agents, pipeline, analytics.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-textMuted/70">
          <span>
            {dash?.last_updated ? `Data updated ${timeAgo(dash.last_updated)}` : "No data yet"}
            {fetchedAt ? ` · checked ${timeAgo(new Date(fetchedAt).toISOString())}` : ""}
          </span>
          <button
            onClick={load}
            disabled={refreshing}
            className="rounded-lg border border-white/10 px-2.5 py-1.5 font-medium text-textMuted hover:bg-white/5 hover:text-textPrimary transition disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {loading && !dash && (
        <div className="animate-pulse space-y-4">
          <div className="h-24 rounded-xl bg-white/[0.04]" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-white/[0.04]" />
            ))}
          </div>
        </div>
      )}

      {/* Empty / waiting state */}
      {!loading && !dash && (
        <Card className="text-center">
          <p className="text-sm font-medium text-textPrimary">Waiting for operation data</p>
          <p className="mx-auto mt-2 max-w-md text-xs text-textMuted">
            Cowork hasn&rsquo;t published <code className="text-textMuted/80">dashboard_template.json</code> to
            the shared folder yet. This tab renders it live as soon as it appears.
          </p>
          {data?.dashboard_error && (
            <p className="mt-2 text-[10px] text-textMuted/50">status: {data.dashboard_error}</p>
          )}
        </Card>
      )}

      {dash && (
        <>
          {/* Goal + Why */}
          {(dash.goal || dash.why) && (
            <Card>
              {dash.goal && (
                <>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-textMuted/60">The goal</p>
                  <p className="mt-1 text-sm text-textPrimary md:text-base">{dash.goal}</p>
                </>
              )}
              {dash.why && (
                <>
                  <p className="mt-4 text-[10px] uppercase tracking-[0.18em] text-textMuted/60">Why</p>
                  <p className="mt-1 text-sm text-textMuted">{dash.why}</p>
                </>
              )}
            </Card>
          )}

          {/* Overview */}
          {dash.overview && (
            <div className="grid grid-cols-3 gap-3 md:gap-4">
              {[
                { label: "Active tasks", value: dash.overview.total_tasks_active ?? 0, tone: "blue" },
                { label: "Done this week", value: dash.overview.completed_this_week ?? 0, tone: "emerald" },
                { label: "Pending review", value: dash.overview.pending_review ?? 0, tone: "amber" },
              ].map((s) => (
                <Card key={s.label}>
                  <div className={`text-2xl font-bold tracking-tight ${
                    s.tone === "amber" ? "text-amber-300" : s.tone === "emerald" ? "text-emerald-300" : "text-blue-300"
                  }`}>
                    {s.value}
                  </div>
                  <div className="mt-0.5 text-xs font-medium text-textMuted">{s.label}</div>
                </Card>
              ))}
            </div>
          )}

          {/* Sub-agents */}
          {dash.sub_agents && dash.sub_agents.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-textPrimary">Agents</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {dash.sub_agents.map((a) => {
                  const tone = statusTone(a.status);
                  return (
                    <Card key={a.agent_name}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-textPrimary">{a.agent_name}</span>
                        <StatusBadge status={a.status} />
                      </div>
                      <p className="mt-1.5 text-xs text-textMuted line-clamp-2">{a.current_task}</p>
                      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className={`h-full rounded-full transition-all ${BAR_CLASSES[tone]}`}
                          style={{ width: `${Math.max(0, Math.min(100, a.progress_percent ?? 0))}%` }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[10px] text-textMuted/60">
                        <span>{a.tasks_completed ?? 0} completed</span>
                        <span>{timeAgo(a.last_update)}</span>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {/* Content pipeline */}
          {dash.content_pipeline && dash.content_pipeline.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-textPrimary">Content pipeline</h2>
              <Card className="!p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wider text-textMuted/60">
                        <th className="px-4 py-3 font-medium">Piece</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Next</th>
                        <th className="px-4 py-3 font-medium">Targets</th>
                        <th className="px-4 py-3 font-medium">Publish</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dash.content_pipeline.map((p) => (
                        <tr key={p.piece_id} className="border-t border-white/[0.06]">
                          <td className="px-4 py-3">
                            <div className="font-medium text-textPrimary/90">{p.title}</div>
                            <div className="text-[10px] text-textMuted/50">{p.piece_id}</div>
                          </td>
                          <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                          <td className="px-4 py-3 text-xs text-textMuted">{p.owner_next ?? "—"}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {(p.platform_targets ?? []).map((t) => (
                                <span key={t} className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-textMuted">
                                  {t}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-textMuted/80">{p.scheduled_publish ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </section>
          )}

          {/* Analytics + schedule */}
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            {dash.analytics_snapshot && (
              <section>
                <h2 className="mb-3 text-sm font-semibold text-textPrimary">Analytics snapshot</h2>
                <Card>
                  <div className="grid grid-cols-3 gap-3">
                    {ANALYTICS_LABELS.map(({ key, label }) => (
                      <div key={key} className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2.5 text-center">
                        <div className="text-lg font-semibold text-textPrimary">
                          {Number(dash.analytics_snapshot?.[key] ?? 0)}
                        </div>
                        <div className="mt-0.5 text-[10px] text-textMuted/70">{label}</div>
                      </div>
                    ))}
                  </div>
                  {dash.analytics_snapshot.note && (
                    <p className="mt-3 text-[11px] leading-relaxed text-textMuted/60">
                      {dash.analytics_snapshot.note}
                    </p>
                  )}
                </Card>
              </section>
            )}

            {dash.next_scheduled && dash.next_scheduled.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold text-textPrimary">Scheduled jobs</h2>
                <Card className="!p-0">
                  <ul className="divide-y divide-white/[0.06]">
                    {dash.next_scheduled.map((j) => (
                      <li key={j.job} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm text-textPrimary/90">{j.job}</div>
                          <div className="text-[10px] text-textMuted/60">{j.when}</div>
                        </div>
                        <StatusBadge status={j.status} />
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>
            )}
          </div>

          <p className="text-[10px] text-textMuted/40">
            Cowork owns this data; this tab renders it read-only and refreshes every {REFRESH_MS / 1000}s.
          </p>
        </>
      )}
    </div>
  );
}
