"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PdfExportButton } from "../../components/briefing/PdfExportButton";
import { SopCrmTab } from "../../components/crm/SopCrmTab";

type BriefingRecord = {
  id: string;
  briefing_date: string;
  created_at: string;
  sent_at: string | null;
  client_count_scanned: number;
  alerts_found: number;
  competitor_moves_found: number;
  opportunities_found: number;
  briefing_json: any;
  briefing_text: string | null;
};

type ApiResponse = { ok: boolean; briefing: BriefingRecord | null; timezone?: string; error?: string };

function fmtMoney(n: number | undefined) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function CrmPage() {
  const [tab, setTab] = useState<"briefing" | "sops">("briefing");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch("/api/crm/morning-briefing", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const json = (await res.json()) as ApiResponse;
        if (cancelled) return;
        if (res.status === 401) throw new Error("Unauthorized — sign in at /admin/login");
        if (!json.ok) throw new Error(json.error ?? "Failed to load briefing");
        setData(json);
      } catch (e: any) {
        if (cancelled) return;
        setErr(String(e?.message ?? e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const briefing = data?.briefing ?? null;
  const json = briefing?.briefing_json ?? null;
  const meta = json?.meta ?? null;
  const criticalAlerts = Array.isArray(json?.critical_alerts) ? json.critical_alerts : [];
  const competitorMoves = Array.isArray(json?.competitor_moves) ? json.competitor_moves : [];
  const industryNews = Array.isArray(json?.industry_news) ? json.industry_news : [];
  const opportunities = Array.isArray(json?.opportunities) ? json.opportunities : [];
  const focusClients = Array.isArray(json?.focus_clients) ? json.focus_clients : [];

  const title = useMemo(() => {
    if (!briefing?.briefing_date) return "Morning Briefing";
    return `Morning Briefing (${briefing.briefing_date})`;
  }, [briefing?.briefing_date]);

  return (
    <main className="max-w-5xl">
      <p className="text-sm text-textMuted mb-6">Morning briefings, SOPs, and pipeline shortcuts.</p>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTab("briefing")}
            className={[
              "rounded-full border px-4 py-2 text-xs font-semibold transition",
              tab === "briefing" ? "border-sky-500/30 bg-sky-500/10 text-sky-200" : "border-white/10 bg-white/5 text-textMuted hover:bg-white/10",
            ].join(" ")}
          >
            Morning Briefing
          </button>
          <button
            type="button"
            onClick={() => setTab("sops")}
            className={[
              "rounded-full border px-4 py-2 text-xs font-semibold transition",
              tab === "sops" ? "border-sky-500/30 bg-sky-500/10 text-sky-200" : "border-white/10 bg-white/5 text-textMuted hover:bg-white/10",
            ].join(" ")}
          >
            SOPs
          </button>
          <Link
            href="/crm/clients"
            className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-textMuted transition hover:bg-white/10"
          >
            Client list
          </Link>
        </div>

        {tab === "briefing" ? (
          <section className="mt-6 rounded-2xl border border-white/10 bg-black/30 overflow-hidden">
            <div className="border-b border-white/10 px-5 py-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.14em] text-textMuted">Tab</div>
                <div className="mt-1 text-lg font-semibold text-textPrimary">{title}</div>
                {briefing ? (
                  <div className="mt-2 text-xs text-textMuted">
                    {briefing.alerts_found} alerts • {briefing.competitor_moves_found} competitor moves • {briefing.opportunities_found} opportunities • {briefing.client_count_scanned} clients
                  </div>
                ) : null}
              </div>

              {briefing ? <PdfExportButton pdfTargetId="morning-briefing-pdf" pdfName={`morning-briefing-${briefing.briefing_date}.pdf`} /> : null}
            </div>

            <div className="p-5">
              {loading ? <div className="text-sm text-textMuted">Loading briefing…</div> : null}
              {err ? <div className="text-sm text-rose-200/80">{err}</div> : null}
              {!loading && !err && !briefing ? <div className="text-sm text-textMuted">No briefing found yet for today.</div> : null}

              {briefing ? (
                <div id="morning-briefing-pdf" className="rounded-xl border border-white/10 bg-white text-slate-900 p-4">
                  <div className="mb-3">
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Snapshot</div>
                    <div className="mt-1 text-sm font-semibold">
                      {meta?.alerts_found ?? 0} alerts • {meta?.competitor_moves_found ?? 0} competitor moves • {meta?.opportunities_found ?? 0} opportunities •{" "}
                      {meta?.scanned_client_count ?? briefing.client_count_scanned ?? 0} clients
                    </div>
                    {focusClients.length ? (
                      <div className="mt-2 text-[12px] text-slate-600">
                        Focus: {focusClients.slice(0, 10).join(", ")}
                      </div>
                    ) : null}
                  </div>

                  {criticalAlerts.length ? (
                    <div className="mb-4">
                      <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Critical Alerts</div>
                      <div className="mt-2 space-y-1 text-[12px] leading-relaxed">
                        {criticalAlerts.slice(0, 6).map((a: any, idx: number) => (
                          <div key={`${a?.client_id ?? "c"}_${idx}`} className="rounded-lg bg-rose-50 px-2 py-1 border border-rose-200">
                            {a?.message ?? "Alert"}
                          </div>
                        ))}
                        {criticalAlerts.length > 6 ? <div className="text-[12px] text-slate-600">…and {criticalAlerts.length - 6} more</div> : null}
                      </div>
                    </div>
                  ) : null}

                  {competitorMoves.length ? (
                    <div className="mb-4">
                      <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Competitor Moves</div>
                      <div className="mt-2 space-y-2 text-[12px] leading-relaxed">
                        {competitorMoves.slice(0, 5).map((m: any, idx: number) => (
                          <div key={`${m?.client_id ?? "c"}_${idx}`} className="rounded-lg border border-slate-200 px-2 py-1">
                            <div className="font-semibold text-slate-900">
                              {m?.client_name ?? "Client"} {m?.competitor ? `— ${m.competitor}` : ""}
                            </div>
                            <div className="text-slate-700">{m?.headline ?? "Competitor signal"}</div>
                            {m?.url ? <div className="text-slate-500 break-all">{m.url}</div> : null}
                          </div>
                        ))}
                        {competitorMoves.length > 5 ? <div className="text-[12px] text-slate-600">…and {competitorMoves.length - 5} more</div> : null}
                      </div>
                    </div>
                  ) : null}

                  {industryNews.length ? (
                    <div className="mb-4">
                      <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Industry News</div>
                      <div className="mt-2 space-y-2 text-[12px] leading-relaxed">
                        {industryNews.slice(0, 5).map((n: any, idx: number) => (
                          <div key={`${n?.headline ?? "n"}_${idx}`} className="rounded-lg border border-slate-200 px-2 py-1">
                            <div className="font-semibold text-slate-900">{n?.headline ?? "Industry update"}</div>
                            {n?.summary ? <div className="text-slate-700">{n.summary}</div> : null}
                            {n?.url ? <div className="text-slate-500 break-all">{n.url}</div> : null}
                          </div>
                        ))}
                        {industryNews.length > 5 ? <div className="text-[12px] text-slate-600">…and {industryNews.length - 5} more</div> : null}
                      </div>
                    </div>
                  ) : null}

                  {opportunities.length ? (
                    <div className="mb-4">
                      <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Top Opportunities</div>
                      <div className="mt-2 space-y-2 text-[12px] leading-relaxed">
                        {opportunities.slice(0, 3).map((o: any, idx: number) => (
                          <div key={`${o?.client_id ?? o?.client_name ?? "o"}_${idx}`} className="rounded-lg border border-slate-200 px-2 py-1 bg-slate-50">
                            <div className="font-semibold text-slate-900">
                              {o?.client_name ?? o?.client_id ?? "Client"}: {o?.title ?? "Opportunity"}
                            </div>
                            {typeof o?.projected_revenue === "number" ? <div className="text-slate-700">Projected: {fmtMoney(o.projected_revenue)}</div> : null}
                            {o?.rationale ? <div className="text-slate-700">{o.rationale}</div> : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4">
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Full Text (Telegram copy)</div>
                    <pre className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed font-mono">
                      {briefing.briefing_text ?? "No briefing_text stored."}
                    </pre>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        ) : tab === "sops" ? (
          <section className="mt-6">
            <p className="text-sm text-textMuted mb-2">
              View and edit SOP sections and Mermaid diagrams in-app. Changes are versioned in <code className="text-xs text-sky-200/90">sop_versions</code>.
            </p>
            <SopCrmTab />
          </section>
        ) : null}
    </main>
  );
}

