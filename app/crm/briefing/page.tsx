"use client";

import { useEffect, useMemo, useState } from "react";
import { PdfExportButton } from "../../../components/briefing/PdfExportButton";

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

function fmtMoney(n: number | undefined) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return `R${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function StatPill({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-full border px-4 py-2 ${color}`}>
      <span className="text-lg font-bold">{value}</span>
      <span className="text-xs">{label}</span>
    </div>
  );
}

export default function BriefingPage() {
  const [data, setData] = useState<{ briefing: BriefingRecord | null; timezone?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/crm/morning-briefing", { cache: "no-store", credentials: "same-origin" })
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) throw new Error(json.error ?? "Failed to load briefing");
        setData(json);
      })
      .catch((e: any) => setErr(String(e?.message ?? e)))
      .finally(() => setLoading(false));
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
    return `Morning Briefing — ${new Date(briefing.briefing_date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`;
  }, [briefing?.briefing_date]);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">Morning Briefing</h1>
          <p className="text-sm text-textMuted mt-1">Daily intelligence summary for your client portfolio</p>
        </div>
        {briefing && (
          <PdfExportButton
            pdfTargetId="morning-briefing-pdf"
            pdfName={`morning-briefing-${briefing.briefing_date}.pdf`}
          />
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-textMuted py-8">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-accent" />
          Loading briefing…
        </div>
      )}

      {err && (
        <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300">{err}</div>
      )}

      {!loading && !err && !briefing && (
        <div className="rounded-xl border border-white/[0.08] bg-[#16161A] py-20 text-center">
          <div className="text-5xl mb-4">☀️</div>
          <p className="text-sm font-semibold text-textPrimary">No briefing yet for today</p>
          <p className="text-xs text-textMuted mt-1">Briefings are generated automatically at 2:00 AM UTC.</p>
        </div>
      )}

      {briefing && (
        <>
          {/* Stats row */}
          <div className="flex flex-wrap gap-3">
            <StatPill value={briefing.alerts_found} label="Alerts" color="border-rose-500/30 bg-rose-500/10 text-rose-200" />
            <StatPill value={briefing.competitor_moves_found} label="Competitor Moves" color="border-amber-500/30 bg-amber-500/10 text-amber-200" />
            <StatPill value={briefing.opportunities_found} label="Opportunities" color="border-emerald-500/30 bg-emerald-500/10 text-emerald-200" />
            <StatPill value={briefing.client_count_scanned} label="Clients Scanned" color="border-blue-500/30 bg-blue-500/10 text-blue-200" />
          </div>

          {focusClients.length > 0 && (
            <div className="rounded-xl border border-white/[0.08] bg-[#16161A] p-4">
              <div className="text-xs uppercase tracking-wider text-textMuted/50 mb-2">Focus Clients Today</div>
              <div className="flex flex-wrap gap-2">
                {focusClients.slice(0, 10).map((name: string) => (
                  <span key={name} className="rounded-full bg-white/5 border border-white/[0.08] px-3 py-1 text-xs text-textPrimary">{name}</span>
                ))}
              </div>
            </div>
          )}

          {/* PDF-exportable content */}
          <div id="morning-briefing-pdf" className="space-y-4">
            {criticalAlerts.length > 0 && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-rose-400">⚠️</span>
                  <h2 className="text-sm font-semibold text-rose-200">Critical Alerts ({criticalAlerts.length})</h2>
                </div>
                <div className="space-y-2">
                  {criticalAlerts.slice(0, 8).map((a: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-3 rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3">
                      <span className="text-rose-400 flex-shrink-0 mt-0.5">•</span>
                      <p className="text-sm text-rose-100">{a?.message ?? "Alert"}</p>
                    </div>
                  ))}
                  {criticalAlerts.length > 8 && (
                    <p className="text-xs text-textMuted ml-4">…and {criticalAlerts.length - 8} more alerts</p>
                  )}
                </div>
              </div>
            )}

            {competitorMoves.length > 0 && (
              <div className="rounded-xl border border-white/[0.08] bg-[#16161A] p-5">
                <div className="flex items-center gap-2 mb-4">
                  <span>⚔️</span>
                  <h2 className="text-sm font-semibold text-textPrimary">Competitor Moves ({competitorMoves.length})</h2>
                </div>
                <div className="space-y-3">
                  {competitorMoves.slice(0, 6).map((m: any, idx: number) => (
                    <div key={idx} className="rounded-lg border border-white/[0.07] bg-black/20 px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-textPrimary">{m?.client_name ?? "Client"}</span>
                        {m?.competitor && <span className="text-xs text-textMuted">vs {m.competitor}</span>}
                      </div>
                      <p className="text-sm text-textMuted mt-1">{m?.headline ?? "Signal detected"}</p>
                      {m?.url && <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline mt-1 block truncate">{m.url}</a>}
                    </div>
                  ))}
                  {competitorMoves.length > 6 && <p className="text-xs text-textMuted">…and {competitorMoves.length - 6} more</p>}
                </div>
              </div>
            )}

            {opportunities.length > 0 && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <span>💡</span>
                  <h2 className="text-sm font-semibold text-emerald-200">Top Opportunities ({opportunities.length})</h2>
                </div>
                <div className="space-y-3">
                  {opportunities.slice(0, 5).map((o: any, idx: number) => (
                    <div key={idx} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                      <div className="text-sm font-semibold text-emerald-200">
                        {o?.client_name ?? o?.client_id ?? "Client"}: {o?.title ?? "Opportunity"}
                      </div>
                      {typeof o?.projected_revenue === "number" && (
                        <div className="text-xs text-emerald-300/70 mt-1">Projected: {fmtMoney(o.projected_revenue)}</div>
                      )}
                      {o?.rationale && <p className="text-xs text-textMuted mt-1">{o.rationale}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {industryNews.length > 0 && (
              <div className="rounded-xl border border-white/[0.08] bg-[#16161A] p-5">
                <div className="flex items-center gap-2 mb-4">
                  <span>📰</span>
                  <h2 className="text-sm font-semibold text-textPrimary">Industry News ({industryNews.length})</h2>
                </div>
                <div className="space-y-3">
                  {industryNews.slice(0, 5).map((n: any, idx: number) => (
                    <div key={idx} className="rounded-lg border border-white/[0.07] bg-black/20 px-4 py-3">
                      <div className="text-sm font-semibold text-textPrimary">{n?.headline ?? "Update"}</div>
                      {n?.summary && <p className="text-xs text-textMuted mt-1">{n.summary}</p>}
                      {n?.url && <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline mt-1 block truncate">{n.url}</a>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {briefing.briefing_text && (
              <div className="rounded-xl border border-white/[0.08] bg-[#16161A] p-5">
                <div className="text-xs uppercase tracking-wider text-textMuted/50 mb-3">Full Text (Telegram Copy)</div>
                <pre className="whitespace-pre-wrap text-xs font-mono text-textMuted leading-relaxed">{briefing.briefing_text}</pre>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
