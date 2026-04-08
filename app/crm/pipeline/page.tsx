"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type PipelineClient = {
  id: string;
  name: string;
  company?: string;
  industry?: string;
  monthly_budget?: number;
  next_action?: string;
  last_activity?: string;
  date_entered_stage?: string;
};

type Stage = {
  id: string;
  stage?: string;
  clients: PipelineClient[];
};

const STAGE_CONFIG: Record<string, { label: string; color: string; dot: string; badge: string }> = {
  "blueprint-submitted": {
    label: "Blueprint Submitted",
    color: "border-t-purple-500",
    dot: "bg-purple-400",
    badge: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  },
  "report-sent": {
    label: "Report Sent",
    color: "border-t-blue-500",
    dot: "bg-blue-400",
    badge: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  },
  "proposal-sent": {
    label: "Proposal Sent",
    color: "border-t-amber-500",
    dot: "bg-amber-400",
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  "active-client": {
    label: "Active Client",
    color: "border-t-emerald-500",
    dot: "bg-emerald-400",
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  "upsell-sent": {
    label: "Upsell",
    color: "border-t-pink-500",
    dot: "bg-pink-400",
    badge: "bg-pink-500/15 text-pink-300 border-pink-500/30",
  },
};

const STAGE_ORDER = ["blueprint-submitted", "report-sent", "proposal-sent", "active-client", "upsell-sent"];

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function avatarColor(id: string) {
  const colors = [
    "bg-blue-500/25 text-blue-200",
    "bg-purple-500/25 text-purple-200",
    "bg-emerald-500/25 text-emerald-200",
    "bg-amber-500/25 text-amber-200",
    "bg-rose-500/25 text-rose-200",
    "bg-pink-500/25 text-pink-200",
  ];
  return colors[id.charCodeAt(0) % colors.length];
}

function fmtMoney(n: number | undefined) {
  if (!n) return null;
  if (n >= 1000) return `R${(n / 1000).toFixed(1)}k`;
  return `R${n}`;
}

function timeAgo(dateStr?: string) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d}d ago`;
  return null;
}

export default function PipelinePage() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/crm/pipeline", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok && data.error) throw new Error(data.error);
        setStages(data.stages ?? []);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Build a map for quick lookup
  const stageMap: Record<string, PipelineClient[]> = {};
  for (const s of stages) stageMap[s.id ?? s.stage ?? ""] = s.clients;

  const totalValue = stages.reduce(
    (sum, s) => sum + s.clients.reduce((cs, c) => cs + (c.monthly_budget ?? 0), 0),
    0
  );
  const totalContacts = stages.reduce((sum, s) => sum + s.clients.length, 0);

  return (
    <div className="space-y-6 h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-textPrimary">Pipeline</h1>
          <p className="text-sm text-textMuted mt-0.5 truncate">
            {loading ? "Loading…" : `${totalContacts} contacts · R${(totalValue / 1000).toFixed(1)}k pipeline value`}
          </p>
        </div>
        <Link
          href="/crm/clients/new"
          className="flex-shrink-0 flex items-center gap-2 rounded-lg bg-accent px-3 md:px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 transition"
        >
          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span className="hidden sm:inline">Add Contact</span>
          <span className="sm:hidden">Add</span>
        </Link>
      </div>
      {/* Mobile scroll hint */}
      <p className="text-xs text-textMuted/40 md:hidden">← Swipe to see all stages →</p>

      {err && <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300">{err}</div>}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-textMuted py-8">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-accent" />
          Loading pipeline…
        </div>
      )}

      {/* Kanban Board */}
      {!loading && (
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "calc(100vh - 220px)" }}>
          {STAGE_ORDER.map((stageKey) => {
            const cfg = STAGE_CONFIG[stageKey];
            const clients = stageMap[stageKey] ?? [];
            const stageValue = clients.reduce((s, c) => s + (c.monthly_budget ?? 0), 0);

            return (
              <div
                key={stageKey}
                className={`flex-shrink-0 w-72 rounded-xl border border-white/[0.08] bg-[#13131A] border-t-2 ${cfg.color} flex flex-col`}
              >
                {/* Column Header */}
                <div className="px-4 py-3 border-b border-white/[0.06]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                      <Link
                        href={`/crm/clients?status=${stageKey}`}
                        className="text-sm font-semibold text-textPrimary hover:text-accent transition"
                        title={`View all ${cfg.label} contacts`}
                      >
                        {cfg.label}
                      </Link>
                    </div>
                    <Link
                      href={`/crm/clients?status=${stageKey}`}
                      className="rounded-full bg-white/[0.06] hover:bg-accent/20 hover:text-accent px-2 py-0.5 text-xs font-semibold text-textMuted transition"
                      title={`View all ${clients.length} contacts in this stage`}
                    >
                      {clients.length}
                    </Link>
                  </div>
                  {stageValue > 0 && (
                    <div className="mt-1.5 text-xs text-textMuted">
                      R{(stageValue / 1000).toFixed(1)}k MRR
                    </div>
                  )}
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {clients.length === 0 && (
                    <div className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center">
                      <p className="text-xs text-textMuted">No contacts</p>
                    </div>
                  )}

                  {clients.map((c) => (
                    <Link
                      key={c.id}
                      href={`/crm/clients/${c.id}`}
                      className="block rounded-lg border border-white/[0.07] bg-[#1C1C24] p-3.5 hover:border-white/[0.15] hover:bg-[#20202A] transition-all group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold ${avatarColor(c.id)}`}>
                          {initials(c.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-textPrimary truncate group-hover:text-white transition">
                            {c.name}
                          </div>
                          {c.company && (
                            <div className="text-xs text-textMuted truncate">{c.company}</div>
                          )}
                        </div>
                      </div>

                      {(c.monthly_budget || c.industry) && (
                        <div className="mt-3 flex items-center justify-between">
                          {c.industry && (
                            <span className="text-[10px] uppercase tracking-wider text-textMuted/60">{c.industry}</span>
                          )}
                          {fmtMoney(c.monthly_budget) && (
                            <span className="text-xs font-semibold text-emerald-400">{fmtMoney(c.monthly_budget)}/mo</span>
                          )}
                        </div>
                      )}

                      {c.next_action && (
                        <div className="mt-2.5 rounded-md bg-amber-500/8 border border-amber-500/15 px-2 py-1">
                          <p className="text-[11px] text-amber-300/80 truncate">⚡ {c.next_action}</p>
                        </div>
                      )}

                      {stageKey === "blueprint-submitted" && (
                        <div
                          className="mt-2.5 rounded-md bg-purple-500/10 border border-purple-500/20 px-2 py-1 flex items-center gap-1"
                          onClick={(e) => e.preventDefault()}
                        >
                          <Link
                            href={`/crm/blueprint-review/${c.id}`}
                            className="text-[11px] text-purple-300 hover:text-purple-200 font-semibold"
                            onClick={(e) => e.stopPropagation()}
                          >
                            📋 Review Blueprint →
                          </Link>
                        </div>
                      )}

                      {timeAgo(c.date_entered_stage ?? c.last_activity) && (
                        <div className="mt-2 text-[10px] text-textMuted/50">{timeAgo(c.date_entered_stage ?? c.last_activity)}</div>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
