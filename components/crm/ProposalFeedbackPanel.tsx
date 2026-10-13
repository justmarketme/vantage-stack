"use client";

import { useCallback, useEffect, useState } from "react";

type Item = { id: string; client_ref: string; kind: string; body: string; at_seconds: number | null; screenshot_url: string | null };
type Session = {
  id: string;
  link_id: string;
  recording_url: string | null;
  recording_kind: string | null;
  duration_seconds: number | null;
  ai_status: string;
  ai_error: string | null;
  ai_summary: string | null;
  transcript: { t: number; text: string }[] | null;
  created_at: string;
  items: Item[];
};
type Brand = { name: string; logo: string | null; accent: string; highlight: string; bg: string; text: string; displayFont: string; bodyFont: string };
type Link = {
  id: string;
  url: string;
  proposal_url: string;
  title: string;
  status: string;
  created_at: string;
  opened_at: string | null;
  submitted_at: string | null;
  brand: Brand;
  brand_override: Partial<Brand> | null;
};

const media = (u: string) => `/api/crm/feedback/media?url=${encodeURIComponent(u)}`;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

function waNumber(raw: string | null | undefined) {
  const d = (raw || "").replace(/\D/g, "");
  if (!d) return "";
  return d.startsWith("0") ? `27${d.slice(1)}` : d;
}

export function ProposalFeedbackPanel({ clientId, clientName, whatsapp }: { clientId: string; clientName: string; whatsapp?: string | null }) {
  const [links, setLinks] = useState<Link[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [accent, setAccent] = useState("");
  const [logo, setLogo] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editAccent, setEditAccent] = useState("");
  const [editLogo, setEditLogo] = useState("");
  const [editName, setEditName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/crm/clients/${clientId}/feedback`, { credentials: "same-origin" });
    const j = await r.json().catch(() => ({}));
    if (j.ok) {
      setLinks(j.links);
      setSessions(j.sessions);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!sessions.some((s) => s.ai_status === "pending" || s.ai_status === "processing")) return;
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [sessions, load]);

  async function create() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/crm/clients/${clientId}/feedback`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposal_url: url.trim(),
          title: title.trim() || undefined,
          brand: accent || logo.trim() ? { accent: accent || undefined, logo: logo.trim() || undefined } : undefined,
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Could not create link");
      setUrl("");
      setTitle("");
      setAccent("");
      setLogo("");
      await load();
      setMsg(`Feedback link created in ${j.link.brand?.name ?? "the client's"} brand colours. Send it with the buttons below.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveBrand(l: Link) {
    const brand: Record<string, string> = {};
    if (editAccent) brand.accent = editAccent;
    if (editLogo.trim()) brand.logo = editLogo.trim();
    if (editName.trim()) brand.name = editName.trim();
    const r = await fetch(`/api/crm/clients/${clientId}/feedback/${l.id}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand }),
    });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) {
      setMsg(j.error || "Could not save brand");
      return;
    }
    setEditing(null);
    await load();
    setMsg("Brand updated. The client sees it next time they open the link.");
  }

  async function reprocess(id: string) {
    setMsg("Re-running AI. This can take a minute for long recordings.");
    await fetch(`/api/crm/feedback/sessions/${id}/process`, { method: "POST", credentials: "same-origin" });
    await load();
    setMsg(null);
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMsg("Link copied.");
    } catch {
      setMsg(text);
    }
  }

  const first = clientName.trim().split(/\s+/)[0] || "there";
  const message = (l: Link) =>
    `Hi ${first}, your ${l.title} is ready. Please walk us through it and tell us what to change. You can talk, point and draw right on it: ${l.url}`;
  const wa = waNumber(whatsapp);

  return (
    <section id="proposal-feedback" className="vs-card space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-textPrimary">Proposal feedback</h3>
        <p className="text-xs text-textMuted mt-1">Paste a proposal or prototype link. The client gets a private link where they can record their screen and voice, pin comments and draw. Their feedback comes back here as tasks.</p>
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_220px_auto]">
        <input id="pf-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://proposal-link…" className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-textPrimary" />
        <input id="pf-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Neuro-Link proposal)" className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-textPrimary" />
        <button type="button" onClick={create} disabled={busy || !url.trim()} className="vs-button-primary text-sm disabled:opacity-50">
          {busy ? "Matching brand…" : "Create feedback link"}
        </button>
      </div>
      <details className="text-xs text-textMuted">
        <summary className="cursor-pointer text-sky-200/90">Brand (auto-detected from the link; override if needed)</summary>
        <div className="mt-2 grid gap-2 md:grid-cols-[auto_1fr] items-center">
          <label htmlFor="pf-accent">Accent colour</label>
          <div className="flex items-center gap-2">
            <input id="pf-accent" type="color" value={accent || "#ff5100"} onChange={(e) => setAccent(e.target.value)} className="h-8 w-12 rounded border border-white/10 bg-transparent" />
            {accent ? (
              <button type="button" className="text-sky-300" onClick={() => setAccent("")}>
                Use detected colour
              </button>
            ) : (
              <span>Detected automatically</span>
            )}
          </div>
          <label htmlFor="pf-logo">Logo</label>
          <input id="pf-logo" value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="https://… logo image (optional)" className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-textPrimary" />
        </div>
      </details>
      {msg ? <p className="text-xs text-sky-200/90 break-all">{msg}</p> : null}

      {links.length ? (
        <ul className="space-y-2">
          {links.map((l) => (
            <li key={l.id} className="rounded-xl border border-white/10 p-3 text-sm space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-textPrimary font-medium">{l.title}</span>
                <span className="text-xs text-textMuted">
                  {l.status === "submitted" ? "Feedback received" : l.status === "opened" ? "Opened by client" : "Not opened yet"} · created {l.created_at.slice(0, 10)}
                </span>
              </div>
              <p className="text-xs text-sky-300 break-all">{l.url}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-textMuted">
                <span className="inline-flex items-center gap-1">
                  {[l.brand.bg, l.brand.text, l.brand.accent, l.brand.highlight].map((c, k) => (
                    <span key={k} className="inline-block h-4 w-4 rounded-full border border-white/20" style={{ background: c }} title={c} />
                  ))}
                </span>
                <span>
                  {l.brand.name} · {l.brand.displayFont}
                  {l.brand.bodyFont !== l.brand.displayFont ? ` + ${l.brand.bodyFont}` : ""}
                </span>
                <button
                  type="button"
                  className="text-sky-300"
                  onClick={() => {
                    setEditing(editing === l.id ? null : l.id);
                    setEditAccent(l.brand_override?.accent ?? "");
                    setEditLogo(l.brand_override?.logo ?? "");
                    setEditName(l.brand_override?.name ?? "");
                  }}
                >
                  Edit brand
                </button>
              </div>
              {editing === l.id ? (
                <div className="grid gap-2 rounded-lg border border-white/10 p-2 text-xs md:grid-cols-[auto_1fr] items-center">
                  <label htmlFor={`eb-name-${l.id}`}>Name</label>
                  <input id={`eb-name-${l.id}`} value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={l.brand.name} className="rounded border border-white/10 bg-black/30 px-2 py-1 text-textPrimary" />
                  <label htmlFor={`eb-accent-${l.id}`}>Accent</label>
                  <input id={`eb-accent-${l.id}`} type="color" value={editAccent || l.brand.accent} onChange={(e) => setEditAccent(e.target.value)} className="h-7 w-12 rounded border border-white/10 bg-transparent" />
                  <label htmlFor={`eb-logo-${l.id}`}>Logo URL</label>
                  <input id={`eb-logo-${l.id}`} value={editLogo} onChange={(e) => setEditLogo(e.target.value)} placeholder="https://…" className="rounded border border-white/10 bg-black/30 px-2 py-1 text-textPrimary" />
                  <span />
                  <div className="flex gap-2">
                    <button type="button" className="vs-button-primary text-xs" onClick={() => saveBrand(l)}>
                      Save brand
                    </button>
                    <button type="button" className="vs-button-ghost text-xs" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => copy(l.url)} className="vs-button-ghost text-xs">Copy link</button>
                <a
                  href={wa ? `https://wa.me/${wa}?text=${encodeURIComponent(message(l))}` : `https://wa.me/?text=${encodeURIComponent(message(l))}`}
                  target="_blank"
                  rel="noreferrer"
                  className="vs-button-ghost text-xs"
                >
                  Send on WhatsApp{wa ? "" : " (pick contact)"}
                </a>
                <a href={l.url} target="_blank" rel="noreferrer" className="vs-button-ghost text-xs">Preview as client</a>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {sessions.map((s) => (
        <div key={s.id} className="rounded-xl border border-white/10 p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-textPrimary font-medium">Feedback received {s.created_at.slice(0, 16).replace("T", " ")}</span>
            <span className={s.ai_status === "done" ? "text-emerald-300" : s.ai_status === "failed" ? "text-rose-300" : "text-amber-200"}>
              {s.ai_status === "done" ? "AI tasks created" : s.ai_status === "failed" ? "AI failed, items saved as tasks" : "AI is processing…"}
            </span>
          </div>
          {s.ai_error ? <p className="text-xs text-rose-300/80">{s.ai_error}</p> : null}
          {s.ai_summary ? <p className="text-sm text-textPrimary/90">{s.ai_summary}</p> : null}
          {s.recording_url ? (
            s.recording_kind === "audio" ? (
              <audio controls preload="metadata" src={media(s.recording_url)} className="w-full" id={`rec-${s.id}`} />
            ) : (
              <video controls preload="metadata" src={media(s.recording_url)} className="w-full max-h-96 rounded-lg bg-black" id={`rec-${s.id}`} />
            )
          ) : null}
          {s.items.length ? (
            <div className="grid gap-2 md:grid-cols-2">
              {s.items.map((i) => (
                <div key={i.id} className="rounded-lg bg-black/20 p-2 text-xs text-textMuted">
                  <div className="text-textPrimary font-medium">
                    {i.client_ref} · {i.kind}
                    {i.at_seconds != null ? (
                      <button
                        type="button"
                        className="ml-2 text-sky-300"
                        onClick={() => {
                          const el = document.getElementById(`rec-${s.id}`) as HTMLMediaElement | null;
                          if (el) {
                            el.currentTime = i.at_seconds!;
                            el.play();
                          }
                        }}
                      >
                        ▶ {fmt(i.at_seconds)}
                      </button>
                    ) : null}
                  </div>
                  {i.screenshot_url ? (
                    <a href={media(i.screenshot_url)} target="_blank" rel="noreferrer">
                      <img src={media(i.screenshot_url)} alt={`${i.kind} ${i.client_ref}`} className="mt-1 max-h-40 rounded" />
                    </a>
                  ) : null}
                  <p className="mt-1">{i.body || "—"}</p>
                </div>
              ))}
            </div>
          ) : null}
          {s.transcript?.length ? (
            <details className="text-xs">
              <summary className="cursor-pointer text-sky-200/90">Transcript</summary>
              <ul className="mt-2 space-y-1 text-textMuted max-h-64 overflow-y-auto">
                {s.transcript.map((t, k) => (
                  <li key={k}>
                    <span className="text-sky-300 mr-2">{fmt(t.t)}</span>
                    {t.text}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <button type="button" onClick={() => reprocess(s.id)} className="vs-button-ghost text-xs">Re-run AI</button>
        </div>
      ))}
    </section>
  );
}
