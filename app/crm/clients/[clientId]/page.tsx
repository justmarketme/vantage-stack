"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { statusBadgeClass } from "../../../../components/crm/statusStyles";

export default function ClientProfilePage() {
  const params = useParams();
  const clientId = String(params.clientId ?? "");
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dtc, setDtc] = useState<any>(null);
  const [dtcLoading, setDtcLoading] = useState(false);
  const [dtcErr, setDtcErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch(`/api/crm/clients/${clientId}`, { credentials: "same-origin" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setData(json);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [clientId]);

  const loadDtc = useCallback(async () => {
    if (!clientId) return;
    setDtcErr(null);
    try {
      const res = await fetch(`/api/crm/clients/${clientId}/design-to-code`, { credentials: "same-origin" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to load design-to-code");
      setDtc(json.design_to_code ?? null);
    } catch (e: unknown) {
      setDtcErr(e instanceof Error ? e.message : String(e));
      setDtc(null);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadDtc();
  }, [loadDtc]);

  async function generateDesignBrief() {
    setDtcErr(null);
    setDtcLoading(true);
    try {
      const res = await fetch(`/api/crm/clients/${clientId}/design-to-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "generate" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Generate failed");
      await loadDtc();
    } catch (e: unknown) {
      setDtcErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDtcLoading(false);
    }
  }

  async function triggerResearch() {
    const p = data?.profile;
    if (!p) return;
    try {
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
      if (!res.ok) throw new Error(j.error ?? "Failed");
      alert("Research triggered.");
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  if (err) {
    return (
      <p className="text-sm text-rose-300">
        {err}{" "}
        <Link href="/crm/clients" className="text-sky-300 underline">
          Clients
        </Link>
      </p>
    );
  }

  if (!data?.profile) {
    return <p className="text-sm text-textMuted">Loading…</p>;
  }

  const p = data.profile;
  const latest = data.reports?.[0];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-heading text-2xl text-textPrimary">{p.name}</h2>
            <span className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${statusBadgeClass(p.status)}`}>{p.status}</span>
          </div>
          <p className="text-sm text-textMuted mt-1">
            {p.company} · {p.industry} · {p.revenue_range}
          </p>
          <p className="text-xs text-textMuted mt-2">
            Last activity: {String(p.last_activity ?? "").slice(0, 16)} · Added by: {p.created_by ?? "—"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/crm/clients/${clientId}/edit`} className="vs-button-primary text-sm">
            Edit
          </Link>
          <button type="button" onClick={() => triggerResearch()} className="vs-button-ghost text-sm">
            Trigger research
          </button>
          <span className="vs-button-ghost text-sm opacity-50 cursor-not-allowed" title="Wire to proposals agent">
            Send proposal
          </span>
          <Link href={`/crm/clients/${clientId}/edit`} className="vs-button-ghost text-sm">
            Schedule follow-up
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="vs-card lg:col-span-2 space-y-4">
          <h3 className="text-sm font-semibold text-textPrimary">Contact &amp; business</h3>
          <dl className="grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="text-textMuted text-xs uppercase tracking-wider">Email</dt>
              <dd className="text-textPrimary">{p.email}</dd>
            </div>
            <div>
              <dt className="text-textMuted text-xs uppercase tracking-wider">WhatsApp</dt>
              <dd className="text-textPrimary">{p.whatsapp}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-textMuted text-xs uppercase tracking-wider">Website</dt>
              <dd className="text-sky-300 break-all">
                {p.website_url ? (
                  <a href={p.website_url} target="_blank" rel="noreferrer">
                    {p.website_url}
                  </a>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-textMuted text-xs uppercase tracking-wider">Monthly budget</dt>
              <dd className="text-textPrimary">{p.monthly_budget ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-textMuted text-xs uppercase tracking-wider">Health score</dt>
              <dd className="text-textPrimary">{data.health_score ?? "—"}</dd>
            </div>
          </dl>
          <div>
            <h4 className="text-xs uppercase tracking-wider text-textMuted mb-2">Success goals</h4>
            <p className="text-sm text-textPrimary/90 whitespace-pre-wrap">{p.success_goals}</p>
          </div>
          <div>
            <h4 className="text-xs uppercase tracking-wider text-textMuted mb-2">Next recommended action</h4>
            <p className="text-sm text-sky-200/90">{data.next_recommended_action}</p>
          </div>
        </section>

        <section className="vs-card space-y-3">
          <h3 className="text-sm font-semibold text-textPrimary">Latest report</h3>
          {latest ? (
            <div className="text-sm space-y-2 text-textMuted">
              <div>Type: {latest.report_type}</div>
              <div>Score: {latest.health_score ?? "—"}</div>
              <div>Status: {latest.status}</div>
              {latest.video_url ? (
                <a href={latest.video_url} className="text-sky-300 block" target="_blank" rel="noreferrer">
                  View video
                </a>
              ) : null}
              {latest?.id ? (
                <Link href={`/crm/reports/${latest.id}/review`} className="vs-button-primary text-sm inline-block mt-3 text-center">
                  Review &amp; send report
                </Link>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-textMuted">No reports yet.</p>
          )}
        </section>
      </div>

      {(data.reports?.length ?? 0) > 1 ? (
        <section className="vs-card space-y-3">
          <h3 className="text-sm font-semibold text-textPrimary">All reports</h3>
          <ul className="text-sm space-y-2">
            {(data.reports as any[]).map((r: any) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 py-2 text-textMuted">
                <div>
                  <span className="text-textPrimary font-medium">{r.report_type ?? "Report"}</span>
                  <span className="mx-2">·</span>
                  <span>{r.status ?? "—"}</span>
                  {r.health_score != null ? (
                    <>
                      <span className="mx-2">·</span>
                      <span>Score {r.health_score}</span>
                    </>
                  ) : null}
                </div>
                {r.id ? (
                  <Link href={`/crm/reports/${r.id}/review`} className="text-sky-300 text-xs font-medium hover:underline">
                    Review &amp; send
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="vs-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-textPrimary">Design → code</h3>
          <button
            type="button"
            onClick={() => generateDesignBrief()}
            disabled={dtcLoading}
            className="vs-button-primary text-sm disabled:opacity-50"
          >
            {dtcLoading ? "Generating…" : "Generate design brief & master prompt"}
          </button>
        </div>
        {dtcErr ? <p className="text-xs text-rose-300">{dtcErr}</p> : null}
        <p className="text-xs text-textMuted">
          Pulls blueprint fields, competitors, notes, and optional discovery snapshot from CRM. Stores markdown brief and master prompt on
          <code className="mx-1 text-textPrimary/80">client_design_to_code</code>.
        </p>
        {dtc?.status ? (
          <p className="text-xs text-textMuted">
            Status: <span className="text-textPrimary">{dtc.status}</span>
            {dtc.version ? (
              <>
                {" "}
                · v{dtc.version}
              </>
            ) : null}
          </p>
        ) : (
          <p className="text-xs text-textMuted">No design-to-code record yet — generate to create one.</p>
        )}
        {(dtc?.staging_url || dtc?.generated_code_url) && (
          <div className="text-xs space-y-1 text-textMuted">
            {dtc.staging_url ? (
              <div>
                Staging:{" "}
                <a href={dtc.staging_url} className="text-sky-300 break-all" target="_blank" rel="noreferrer">
                  {dtc.staging_url}
                </a>
              </div>
            ) : null}
            {dtc.generated_code_url ? (
              <div>
                Repo:{" "}
                <a href={dtc.generated_code_url} className="text-sky-300 break-all" target="_blank" rel="noreferrer">
                  {dtc.generated_code_url}
                </a>
              </div>
            ) : null}
          </div>
        )}
        {dtc?.design_brief ? (
          <details className="text-sm">
            <summary className="cursor-pointer text-sky-200/90">Design brief (markdown)</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-textMuted">
              {dtc.design_brief}
            </pre>
          </details>
        ) : null}
        {dtc?.master_prompt ? (
          <details className="text-sm">
            <summary className="cursor-pointer text-sky-200/90">Master prompt (for Claude / Cursor)</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-textMuted">
              {dtc.master_prompt}
            </pre>
          </details>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="vs-card space-y-3">
          <h3 className="text-sm font-semibold text-textPrimary">Deals &amp; upsells</h3>
          <div className="text-sm text-textMuted space-y-2">
            <div className="font-medium text-textPrimary/90">Deals ({data.deals?.length ?? 0})</div>
            <ul className="space-y-1 max-h-40 overflow-y-auto">
              {(data.deals ?? []).map((d: any) => (
                <li key={d.id} className="border-b border-white/5 pb-1">
                  {d.service_type} · {d.proposal_status} · R{d.deal_value}
                </li>
              ))}
            </ul>
            <div className="font-medium text-textPrimary/90 pt-2">Upsells ({data.upsells?.length ?? 0})</div>
            <ul className="space-y-1 max-h-40 overflow-y-auto">
              {(data.upsells ?? []).map((u: any) => (
                <li key={u.id} className="border-b border-white/5 pb-1">
                  {u.service_name} · {u.status} · R{u.projected_revenue ?? "—"}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="vs-card space-y-3">
          <h3 className="text-sm font-semibold text-textPrimary">Tasks</h3>
          <ul className="text-sm space-y-2 max-h-56 overflow-y-auto">
            {(data.tasks ?? []).map((t: any) => (
              <li key={t.id} className="border-b border-white/5 pb-2 text-textMuted">
                <span className="text-textPrimary">{t.task_type}</span> · {t.status} · due {t.due_date ?? "—"}
                <div className="text-xs mt-0.5">{t.description}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="vs-card space-y-3">
        <h3 className="text-sm font-semibold text-textPrimary">Communications</h3>
        <ul className="text-sm space-y-2">
          {(data.communications ?? []).length ? (
            data.communications.map((c: any) => (
              <li key={c.id} className="text-textMuted border-b border-white/5 pb-2">
                <span className="text-textPrimary">{c.channel}</span> · {String(c.sent_at).slice(0, 16)}
                <div className="text-xs">{c.subject ?? c.body_preview}</div>
              </li>
            ))
          ) : (
            <li className="text-textMuted">No communications logged.</li>
          )}
        </ul>
      </section>

      <section className="vs-card space-y-3">
        <h3 className="text-sm font-semibold text-textPrimary">Journey events</h3>
        <ul className="text-sm space-y-2 max-h-64 overflow-y-auto font-mono text-xs">
          {(data.journey_events ?? []).map((ev: any) => (
            <li key={ev.id} className="text-textMuted border-b border-white/5 pb-1">
              {String(ev.timestamp).slice(0, 19)} · {ev.event_type}
            </li>
          ))}
        </ul>
      </section>

      <section className="vs-card space-y-3">
        <h3 className="text-sm font-semibold text-textPrimary">Campaigns</h3>
        <div className="text-sm text-textMuted grid gap-2 md:grid-cols-2">
          {(data.campaigns ?? []).map((c: any) => (
            <div key={c.id} className="rounded-xl border border-white/10 p-3">
              <div className="text-textPrimary font-medium">{c.platform}</div>
              <div>Budget {c.budget} · Spend {c.spend}</div>
              <div>Leads {c.leads} · Conv. {c.conversions}</div>
            </div>
          ))}
          {!data.campaigns?.length ? <p>No active campaign rows.</p> : null}
        </div>
      </section>

      <Link href="/crm/clients" className="text-sm text-sky-300 hover:text-sky-200">
        ← Back to clients
      </Link>
    </div>
  );
}
