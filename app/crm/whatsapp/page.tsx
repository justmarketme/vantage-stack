"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Turn = { role: "user" | "assistant"; content: string };
type Thread = {
  phone: string;
  profile_name: string | null;
  transcript: Turn[];
  opted_out: boolean;
  last_inbound_at: string | null;
  booking_status: string;
  booking_name: string | null;
  booking_email: string | null;
  updated_at: string;
  lead_client_id: string | null;
  lead_client_name: string | null;
};

const REFRESH_MS = 20_000;

function number(phone: string) {
  return phone.replace(/^whatsapp:/, "");
}

function ago(iso: string | null) {
  if (!iso) return "—";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function WhatsAppInboxPage() {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    fetch("/api/crm/whatsapp", { cache: "no-store", credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) throw new Error(d.error || "Failed to load");
        setThreads(d.threads);
        setErr(null);
      })
      .catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("phone");
    if (fromUrl) setSelected(fromUrl);
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!threads || !needle) return threads ?? [];
    return threads.filter(
      (t) =>
        t.phone.includes(needle) ||
        (t.profile_name || "").toLowerCase().includes(needle) ||
        t.transcript.some((m) => m.content.toLowerCase().includes(needle)),
    );
  }, [threads, q]);

  const active = threads?.find((t) => t.phone === selected) ?? filtered[0] ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-textPrimary">WhatsApp</h1>
        <p className="text-sm text-textMuted mt-1">
          Every conversation on the Vantage Stack WhatsApp number (+27 60 013 2533). Isabel answers; new
          messages are also emailed to hello@ and pushed to EMMA.
        </p>
      </div>

      {err && (
        <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300">{err}</div>
      )}

      {!threads && !err && (
        <div className="flex items-center gap-2 text-sm text-textMuted py-8">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-accent" />
          Loading conversations…
        </div>
      )}

      {threads && threads.length === 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-[#16161A] py-20 text-center">
          <p className="text-sm font-semibold text-textPrimary">No WhatsApp conversations yet</p>
          <p className="text-xs text-textMuted mt-1">They appear here the moment someone messages the number.</p>
        </div>
      )}

      {threads && threads.length > 0 && (
        <div className="grid gap-4 md:grid-cols-[320px_1fr]">
          <div className="rounded-xl border border-white/[0.08] bg-[#16161A] overflow-hidden">
            <div className="p-3 border-b border-white/[0.06]">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, number or message"
                className="w-full rounded-lg bg-black/30 border border-white/[0.08] px-3 py-2 text-sm text-textPrimary placeholder:text-textMuted/60 outline-none focus:border-accent"
              />
            </div>
            <ul className="max-h-[70vh] overflow-y-auto">
              {filtered.map((t) => {
                const last = t.transcript.filter((m) => m.role === "user").at(-1);
                const isActive = active?.phone === t.phone;
                return (
                  <li key={t.phone}>
                    <button
                      onClick={() => setSelected(t.phone)}
                      className={`w-full text-left px-4 py-3 border-b border-white/[0.04] transition-colors ${
                        isActive ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold text-textPrimary truncate">
                          {t.profile_name || number(t.phone)}
                        </span>
                        <span className="text-[11px] text-textMuted shrink-0">{ago(t.last_inbound_at ?? t.updated_at)}</span>
                      </div>
                      {t.profile_name && <div className="text-[11px] text-textMuted">{number(t.phone)}</div>}
                      <div className="text-xs text-textMuted mt-1 truncate">{last?.content ?? "—"}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {active && (
            <div className="rounded-xl border border-white/[0.08] bg-[#16161A] flex flex-col min-h-[50vh]">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-white/[0.06]">
                <div>
                  <div className="text-base font-semibold text-textPrimary">{active.profile_name || number(active.phone)}</div>
                  <div className="text-xs text-textMuted">
                    {number(active.phone)}
                    {active.booking_status !== "none" && ` · booking: ${active.booking_status}`}
                    {active.opted_out && " · opted out"}
                  </div>
                </div>
                <div className="flex gap-2">
                  {active.lead_client_id && (
                    <Link
                      href={`/crm/clients/${active.lead_client_id}`}
                      className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-xs text-textPrimary hover:bg-white/[0.05]"
                    >
                      {active.lead_client_name ? `Contact: ${active.lead_client_name}` : "Open contact"}
                    </Link>
                  )}
                  <a
                    href={`https://wa.me/${number(active.phone).replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg bg-[#25D366]/15 border border-[#25D366]/30 px-3 py-1.5 text-xs text-[#5be38f] hover:bg-[#25D366]/25"
                  >
                    Message from my WhatsApp
                  </a>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto max-h-[65vh] p-4 space-y-3">
                {active.transcript.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                    <div
                      className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                        m.role === "user"
                          ? "bg-white/[0.06] text-textPrimary rounded-bl-sm"
                          : "bg-[#25D366]/15 text-textPrimary rounded-br-sm"
                      }`}
                    >
                      <div className="text-[10px] uppercase tracking-wider text-textMuted mb-0.5">
                        {m.role === "user" ? "Customer" : "Isabel"}
                      </div>
                      {m.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
