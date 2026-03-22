"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { statusBadgeClass } from "../../../components/crm/statusStyles";

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
};

export default function CrmClientsListPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [industry, setIndustry] = useState("");
  const [revenueRange, setRevenueRange] = useState("");

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("per_page", "100");
    p.set("sort", "last_activity");
    if (search.trim()) p.set("search", search.trim());
    if (status) p.set("status", status);
    if (industry.trim()) p.set("industry", industry.trim());
    if (revenueRange.trim()) p.set("revenue_range", revenueRange.trim());
    return p.toString();
  }, [search, status, industry, revenueRange]);

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

  useEffect(() => {
    load();
  }, [load]);

  async function triggerResearch(clientId: string) {
    try {
      const detail = await fetch(`/api/crm/clients/${clientId}`, { credentials: "same-origin" }).then((r) => r.json());
      const p = detail.profile;
      if (!p) return;
      const res = await fetch("/api/research/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          client: {
            id: p.id,
            name: p.name,
            email: p.email,
            website_url: p.website_url,
            industry: p.industry,
          },
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Research trigger failed");
      alert("Research job queued.");
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl text-textPrimary">Clients</h2>
          <p className="text-sm text-textMuted mt-1">{total} total · searchable table</p>
        </div>
        <Link href="/crm/clients/new" className="vs-button-primary text-sm">
          Add new client
        </Link>
      </div>

      <div className="vs-card grid gap-4 md:grid-cols-4">
        <label className="text-xs text-textMuted block space-y-1">
          Search
          <input
            className="vs-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or email"
          />
        </label>
        <label className="text-xs text-textMuted block space-y-1">
          Status
          <select className="vs-input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any</option>
            <option value="blueprint-submitted">blueprint-submitted</option>
            <option value="manually-added">manually-added</option>
            <option value="report-sent">report-sent</option>
            <option value="proposal-sent">proposal-sent</option>
            <option value="active-client">active-client</option>
            <option value="upsell-sent">upsell-sent</option>
            <option value="churned">churned</option>
          </select>
        </label>
        <label className="text-xs text-textMuted block space-y-1">
          Industry contains
          <input className="vs-input" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Health" />
        </label>
        <label className="text-xs text-textMuted block space-y-1">
          Revenue range contains
          <input className="vs-input" value={revenueRange} onChange={(e) => setRevenueRange(e.target.value)} />
        </label>
      </div>

      {loading ? <p className="text-sm text-textMuted">Loading…</p> : null}
      {err ? <p className="text-sm text-rose-300">{err}</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-white/[0.02] text-xs uppercase tracking-wider text-textMuted">
            <tr>
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium">Industry</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">Last activity</th>
              <th className="px-4 py-3 font-medium">Next action</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((r, i) => (
              <tr key={r.id} className={i % 2 === 0 ? "bg-black/20" : "bg-black/10"}>
                <td className="px-4 py-3">
                  <div className="font-medium text-textPrimary">{r.name}</div>
                  <div className="text-xs text-textMuted">{r.company}</div>
                </td>
                <td className="px-4 py-3 text-textMuted">{r.industry}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusBadgeClass(r.status)}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-textMuted whitespace-nowrap">{String(r.created_at).slice(0, 10)}</td>
                <td className="px-4 py-3 text-textMuted whitespace-nowrap">{String(r.last_activity).slice(0, 10)}</td>
                <td className="px-4 py-3 text-textMuted max-w-[200px] truncate">{r.next_action ?? "—"}</td>
                <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                  <Link href={`/crm/clients/${r.id}`} className="text-sky-300 hover:text-sky-200 text-xs font-semibold">
                    Profile
                  </Link>
                  <Link href={`/crm/clients/${r.id}/edit`} className="text-textMuted hover:text-textPrimary text-xs">
                    Edit
                  </Link>
                  <button type="button" onClick={() => triggerResearch(r.id)} className="text-amber-200/90 hover:text-amber-100 text-xs">
                    Research
                  </button>
                  <span className="text-textMuted text-xs">Proposal</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !rows.length ? <div className="p-8 text-center text-sm text-textMuted">No clients match.</div> : null}
      </div>
    </div>
  );
}
