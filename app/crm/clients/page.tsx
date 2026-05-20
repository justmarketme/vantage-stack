"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Tooltip } from "../../../components/ui/Tooltip";
import { SERVICE_INTEREST_LABELS } from "../../../lib/blueprint/schema";

type Row = {
  id: string;
  name: string;
  company: string;
  industry: string;
  status: string;
  created_at: string;
  last_activity: string;
  next_action: string | null;
  email?: string;
  monthly_budget?: number;
  service_interest?: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  "blueprint-submitted": "bg-purple-500/15 text-purple-300 border-purple-500/30",
  "manually-added": "bg-white/5 text-white/60 border-white/10",
  "report-sent": "bg-blue-500/15 text-blue-300 border-blue-500/30",
  "proposal-sent": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "active-client": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "upsell-sent": "bg-pink-500/15 text-pink-300 border-pink-500/30",
  "churned": "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

function statusClass(s: string) {
  return STATUS_COLORS[s] ?? "bg-white/5 text-white/50 border-white/10";
}

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function avatarColor(id: string) {
  const colors = [
    "bg-blue-500/30 text-blue-200",
    "bg-purple-500/30 text-purple-200",
    "bg-emerald-500/30 text-emerald-200",
    "bg-amber-500/30 text-amber-200",
    "bg-rose-500/30 text-rose-200",
    "bg-pink-500/30 text-pink-200",
    "bg-sky-500/30 text-sky-200",
    "bg-orange-500/30 text-orange-200",
  ];
  const idx = id.charCodeAt(0) % colors.length;
  return colors[idx];
}

function timeAgo(dateStr: string) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 30) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const STATUSES = [
  "blueprint-submitted",
  "manually-added",
  "report-sent",
  "proposal-sent",
  "active-client",
  "upsell-sent",
  "churned",
];

function CrmClientsListPageInner() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Pre-populate from ?status= URL param (e.g. when clicking a pipeline stage on dashboard)
  const [status, setStatus] = useState(() => searchParams.get("status") ?? "");
  const [view, setView] = useState<"cards" | "table">("cards");

  // Keep filter in sync if URL changes (browser back/forward)
  useEffect(() => {
    const fromUrl = searchParams.get("status") ?? "";
    setStatus(fromUrl);
  }, [searchParams]);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("per_page", "100");
    p.set("sort", "last_activity");
    if (search.trim()) p.set("search", search.trim());
    if (status) p.set("status", status);
    return p.toString();
  }, [search, status]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/crm/clients?${qs}`, { cache: "no-store", credentials: "same-origin" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load clients");
      setRows((json.clients ?? []) as Row[]);
      setTotal(json.total ?? 0);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => { load(); }, [load]);

  async function triggerResearch(clientId: string) {
    try {
      const detail = await fetch(`/api/crm/clients/${clientId}`, { credentials: "same-origin" }).then((r) => r.json());
      const p = detail.profile;
      if (!p) return;
      const res = await fetch("/api/research/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ client: { id: p.id, name: p.name, email: p.email, website_url: p.website_url, industry: p.industry } }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Research trigger failed");
      alert("Research job queued.");
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-textPrimary">Contacts</h1>
          <p className="text-sm text-textMuted mt-0.5 truncate">
            {loading ? "Loading…" : (
              status
                ? <><span className="text-textPrimary font-medium">{total}</span> in <span className="text-accent font-medium">{status.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</span></>
                : <>{total} total contacts</>
            )}
          </p>
        </div>
        {/* Add button: icon only on mobile, full label on sm+ */}
        <Tooltip content="Add a new contact to your CRM" side="left">
          <Link
            href="/crm/clients/new"
            className="flex-shrink-0 flex items-center gap-2 rounded-lg bg-accent px-3 py-2 md:px-4 text-sm font-semibold text-white hover:bg-accent/90 transition"
          >
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">Add Contact</span>
          </Link>
        </Tooltip>
      </div>

      {/* Active stage filter banner */}
      {status && (
        <div className="flex items-center gap-3 rounded-xl border border-accent/20 bg-accent/5 px-4 py-3">
          <span className="text-sm text-textPrimary min-w-0 truncate">
            Stage: <strong className="text-accent">{status.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</strong>
          </span>
          <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
            <button
              type="button"
              onClick={() => setStatus("")}
              className="flex items-center gap-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/[0.08] px-3 py-1.5 text-xs font-semibold text-textMuted hover:text-textPrimary transition"
            >
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="hidden sm:inline">Clear</span>
            </button>
            <Link
              href="/crm/pipeline"
              className="hidden sm:flex items-center gap-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/[0.08] px-3 py-1.5 text-xs font-semibold text-textMuted hover:text-textPrimary transition"
            >
              View Kanban →
            </Link>
          </div>
        </div>
      )}

      {/* Filters + View Toggle */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Search — full width on mobile */}
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted pointer-events-none" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            className="w-full rounded-lg border border-white/[0.08] bg-[#16161A] pl-9 pr-4 py-2.5 text-sm text-textPrimary placeholder:text-textMuted focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30 transition"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts…"
          />
        </div>

        {/* Status filter — hidden on smallest mobile to save space */}
        <select
          className="hidden sm:block rounded-lg border border-white/[0.08] bg-[#16161A] px-3 py-2.5 text-sm text-textPrimary focus:border-accent/50 focus:outline-none flex-shrink-0"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All Stages</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
          ))}
        </select>

        {/* View toggle */}
        <div className="flex items-center rounded-lg border border-white/[0.08] bg-[#16161A] p-1 flex-shrink-0">
          <Tooltip content="Card view — visual contact cards" side="bottom">
            <button
              type="button"
              onClick={() => setView("cards")}
              className={`rounded-md p-1.5 transition ${view === "cards" ? "bg-white/10 text-textPrimary" : "text-textMuted hover:text-textPrimary"}`}
              title="Card view"
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </button>
          </Tooltip>
          <Tooltip content="Table view — compact list" side="bottom">
            <button
              type="button"
              onClick={() => setView("table")}
              className={`rounded-md p-1.5 transition ${view === "table" ? "bg-white/10 text-textPrimary" : "text-textMuted hover:text-textPrimary"}`}
              title="Table view"
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Mobile status filter — shown only on xs, below search row */}
      <div className="sm:hidden">
        <select
          className="w-full rounded-lg border border-white/[0.08] bg-[#16161A] px-3 py-2.5 text-sm text-textPrimary focus:border-accent/50 focus:outline-none"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All Stages</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
          ))}
        </select>
      </div>

      {err && <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300">{err}</div>}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-textMuted py-8">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-accent" />
          Loading contacts…
        </div>
      )}

      {/* Card View */}
      {!loading && view === "cards" && (
        <div className="grid gap-3 md:gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-xl border border-white/[0.08] bg-[#16161A] p-4 md:p-5 hover:border-white/[0.15] transition-all group flex flex-col gap-3 md:gap-4">
              {/* Top: avatar + name + status */}
              <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 md:h-11 md:w-11 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold ${avatarColor(r.id)}`}>
                  {initials(r.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-textPrimary truncate">{r.name}</span>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass(r.status)}`}>
                      {r.status.replace(/-/g, " ")}
                    </span>
                  </div>
                  <div className="text-xs text-textMuted mt-0.5 truncate">{r.company || r.industry || "—"}</div>
                </div>
              </div>

              {/* Meta */}
              <div className="grid grid-cols-2 gap-2 text-xs text-textMuted">
                <div>
                  <span className="block text-[10px] uppercase tracking-wider text-textMuted/50 mb-0.5">Industry</span>
                  <span className="text-textPrimary/80 truncate block">{r.industry || "—"}</span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase tracking-wider text-textMuted/50 mb-0.5">Last Activity</span>
                  <span className="text-textPrimary/80">{timeAgo(r.last_activity)}</span>
                </div>
                {r.service_interest && (
                  <div className="col-span-2">
                    <span className="block text-[10px] uppercase tracking-wider text-textMuted/50 mb-0.5">Service</span>
                    <span className="inline-block rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-300">
                      {SERVICE_INTEREST_LABELS[r.service_interest as keyof typeof SERVICE_INTEREST_LABELS] ?? r.service_interest}
                    </span>
                  </div>
                )}
                {r.next_action && (
                  <div className="col-span-2">
                    <span className="block text-[10px] uppercase tracking-wider text-textMuted/50 mb-0.5">Next Action</span>
                    <span className="text-amber-300/80 truncate block">{r.next_action}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 border-t border-white/[0.06] pt-3 mt-auto">
                <Tooltip content="Open the full client profile with notes, tasks, and reports" side="bottom">
                  <Link
                    href={`/crm/clients/${r.id}`}
                    className="flex-1 rounded-lg bg-white/5 px-3 py-1.5 text-center text-xs font-semibold text-textPrimary hover:bg-white/10 transition"
                  >
                    View Profile
                  </Link>
                </Tooltip>
                <Tooltip content="Edit contact details" side="bottom">
                  <Link
                    href={`/crm/clients/${r.id}/edit`}
                    className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-textMuted hover:bg-white/10 transition"
                  >
                    Edit
                  </Link>
                </Tooltip>
                {r.status === "blueprint-submitted" && (
                  <Tooltip content="Review and generate this client's strategy blueprint" side="bottom">
                    <Link
                      href={`/crm/blueprint-review/${r.id}`}
                      className="rounded-lg bg-purple-500/15 px-3 py-1.5 text-xs font-semibold text-purple-300 hover:bg-purple-500/25 transition border border-purple-500/20"
                    >
                      Blueprint
                    </Link>
                  </Tooltip>
                )}
                <Tooltip content="Trigger the automated research pipeline for this client" side="bottom">
                  <button
                    type="button"
                    onClick={() => triggerResearch(r.id)}
                    className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-amber-300/80 hover:bg-white/10 transition"
                    title="Run research"
                  >
                    🔍
                  </button>
                </Tooltip>
              </div>
            </div>
          ))}
          {rows.length === 0 && !loading && (
            <div className="col-span-full py-16 text-center">
              <div className="text-4xl mb-3">👥</div>
              <p className="text-sm text-textMuted">No contacts found. Try adjusting your filters.</p>
            </div>
          )}
        </div>
      )}

      {/* Table View — cards on mobile, table on sm+ */}
      {!loading && view === "table" && (
        <>
          {/* Mobile: render as cards */}
          <div className="sm:hidden space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="rounded-xl border border-white/[0.08] bg-[#16161A] p-4 flex items-center gap-3 hover:border-white/[0.15] transition-all">
                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold ${avatarColor(r.id)}`}>
                  {initials(r.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-textPrimary truncate">{r.name}</span>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass(r.status)}`}>
                      {r.status.replace(/-/g, " ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-textMuted truncate">{r.company || r.industry || "—"}</span>
                    <span className="text-textMuted/30">·</span>
                    <span className="text-xs text-textMuted flex-shrink-0">{timeAgo(r.last_activity)}</span>
                  </div>
                </div>
                <Link
                  href={`/crm/clients/${r.id}`}
                  className="flex-shrink-0 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-textPrimary hover:bg-white/10 transition"
                >
                  View
                </Link>
              </div>
            ))}
            {rows.length === 0 && (
              <div className="py-12 text-center text-sm text-textMuted">No contacts match your filters.</div>
            )}
          </div>

          {/* Desktop: full table */}
          <div className="hidden sm:block rounded-xl border border-white/[0.08] overflow-hidden overflow-x-auto">
            <table className="min-w-full text-left text-sm" style={{ minWidth: "640px" }}>
              <thead className="border-b border-white/[0.08] bg-white/[0.02]">
                <tr>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-textMuted">Contact</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-textMuted">Industry</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-textMuted">Service</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-textMuted">Status</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-textMuted">Last Activity</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-textMuted">Next Action</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-textMuted text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold ${avatarColor(r.id)}`}>
                          {initials(r.name)}
                        </div>
                        <div>
                          <div className="font-medium text-textPrimary">{r.name}</div>
                          <div className="text-xs text-textMuted">{r.company || "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-textMuted">{r.industry || "—"}</td>
                    <td className="px-4 py-3">
                      {r.service_interest ? (
                        <span className="inline-flex rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-[11px] text-sky-300">
                          {SERVICE_INTEREST_LABELS[r.service_interest as keyof typeof SERVICE_INTEREST_LABELS] ?? r.service_interest}
                        </span>
                      ) : <span className="text-textMuted/40">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusClass(r.status)}`}>
                        {r.status.replace(/-/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-textMuted whitespace-nowrap">{timeAgo(r.last_activity)}</td>
                    <td className="px-4 py-3 text-sm text-textMuted max-w-[180px] truncate">{r.next_action ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/crm/clients/${r.id}`} className="rounded-md bg-white/5 px-3 py-1 text-xs font-semibold text-textPrimary hover:bg-white/10 transition">
                          View
                        </Link>
                        <Link href={`/crm/clients/${r.id}/edit`} className="rounded-md bg-white/5 px-3 py-1 text-xs font-semibold text-textMuted hover:bg-white/10 transition">
                          Edit
                        </Link>
                        {r.status === "blueprint-submitted" && (
                          <Link href={`/crm/blueprint-review/${r.id}`} className="rounded-md bg-purple-500/15 border border-purple-500/20 px-3 py-1 text-xs font-semibold text-purple-300 hover:bg-purple-500/25 transition">
                            Blueprint
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && !loading && (
              <div className="py-12 text-center text-sm text-textMuted">No contacts match your filters.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function CrmClientsListPage() {
  return <Suspense fallback={<div className="p-6 text-sm text-textMuted">Loading…</div>}><CrmClientsListPageInner /></Suspense>;
}
