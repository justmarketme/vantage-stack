"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { buildClientEmailHtml } from "../../../../../lib/email/report-client-html";
import { consultationUrlClient } from "../../../../../lib/crm/review-ui-public";

type Recipients = { primary: string; additional: string[] };
type Channels = { email: boolean; whatsapp: boolean; pdf: boolean };

const emailOk = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export default function ReportReviewPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = String(params.reportId ?? "");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [bundle, setBundle] = useState<any>(null);

  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [personalization, setPersonalization] = useState("");
  const [recipients, setRecipients] = useState<Recipients>({ primary: "", additional: [] });
  const [channels, setChannels] = useState<Channels>({ email: true, whatsapp: false, pdf: false });
  const [actor, setActor] = useState("crm_team");
  const [scheduleAt, setScheduleAt] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/reports/${reportId}/review`, { credentials: "same-origin" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setBundle(json);
      const ui = json.ui;
      setSubject(ui.subject);
      setBodyText(ui.body_text);
      setPersonalization(ui.personalization_notes ?? "");
      setRecipients(ui.recipients);
      setChannels(ui.channels);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    load();
  }, [load]);

  const report = bundle?.report;
  const clientId = report?.client_id as string | undefined;
  const clientName = String(report?.client_name ?? "");
  const videoUrl = report?.video_url ? String(report.video_url) : "";
  const narrative = bundle?.defaults?.narrative ?? "";
  const whatsappOnFile = Boolean(report?.client_whatsapp?.trim());

  const fullBodyForPreview = useMemo(() => {
    const pre = personalization.trim() ? `${personalization.trim()}\n\n---\n\n` : "";
    return pre + bodyText;
  }, [personalization, bodyText]);

  const previewHtml = useMemo(() => {
    try {
      return buildClientEmailHtml({
        bodyPlain: fullBodyForPreview,
        videoUrl:
          videoUrl.trim() ||
          "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        reportMarkdown: narrative,
        consultationUrl: consultationUrlClient(),
        clientName: clientName || "Client",
      });
    } catch {
      return "<p>Preview unavailable.</p>";
    }
  }, [fullBodyForPreview, videoUrl, narrative, clientName]);

  const recipientList = [recipients.primary, ...recipients.additional].map((x) => x.trim()).filter(Boolean);
  const recipientsValid =
    recipientList.length > 0 && recipientList.every(emailOk) && new Set(recipientList).size === recipientList.length;
  const channelOk = channels.email || channels.whatsapp || channels.pdf;
  const waWarning = channels.whatsapp && !whatsappOnFile;
  const canSend =
    recipientsValid &&
    channelOk &&
    !waWarning &&
    subject.trim().length > 0 &&
    (!channels.email || Boolean(videoUrl.trim()));

  function setChannel<K extends keyof Channels>(key: K, v: boolean) {
    setChannels((c) => ({ ...c, [key]: v }));
  }

  function addRecipient() {
    setRecipients((r) => ({ ...r, additional: [...r.additional, ""] }));
  }

  function setAdditional(i: number, v: string) {
    setRecipients((r) => {
      const next = [...r.additional];
      next[i] = v;
      return { ...r, additional: next };
    });
  }

  function removeAdditional(i: number) {
    setRecipients((r) => ({ ...r, additional: r.additional.filter((_, j) => j !== i) }));
  }

  async function saveDraft() {
    if (!clientId) return;
    setSending(true);
    setErr(null);
    try {
      const res = await fetch(`/api/crm/reports/${reportId}/review/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          client_id: clientId,
          subject,
          body_text: bodyText,
          personalization_notes: personalization,
          recipients,
          channels,
          status: "draft",
          actor,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Save failed");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  async function sendNow() {
    if (!clientId || !canSend) return;
    setSending(true);
    setErr(null);
    try {
      const res = await fetch(`/api/crm/reports/${reportId}/review/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          client_id: clientId,
          client_name: clientName,
          subject,
          body_text: bodyText,
          personalization_notes: personalization,
          recipients,
          channels,
          actor,
          video_url: videoUrl || null,
          whatsapp_to: report?.client_whatsapp ? String(report.client_whatsapp) : null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Send failed");
      if (channels.pdf && j.pdf_download_path) {
        window.open(j.pdf_download_path, "_blank", "noopener,noreferrer");
      }
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  async function scheduleLater() {
    if (!clientId || !scheduleAt || !canSend) return;
    setSending(true);
    setErr(null);
    try {
      const res = await fetch(`/api/crm/reports/${reportId}/review/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          client_id: clientId,
          scheduled_for: new Date(scheduleAt).toISOString(),
          subject,
          body_text: bodyText,
          personalization_notes: personalization,
          recipients,
          channels,
          actor,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Schedule failed");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  function downloadPdf() {
    window.open(`/api/crm/reports/${reportId}/pdf`, "_blank", "noopener,noreferrer");
  }

  if (loading) {
    return <p className="text-sm text-textMuted font-body">Loading review…</p>;
  }
  if (err && !bundle) {
    return (
      <p className="text-sm text-rose-300 font-body">
        {err}{" "}
        <Link href="/crm/clients" className="text-accent underline">
          CRM
        </Link>
      </p>
    );
  }

  return (
    <div className="space-y-10 font-body pb-24">
      {err ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" role="alert">
          {err}
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-textMuted">Report delivery</p>
          <h1 className="font-heading text-2xl md:text-3xl text-textPrimary mt-2">Review &amp; send</h1>
          <p className="text-sm text-textMuted mt-1">
            {clientName} · Report <span className="font-mono text-xs">{reportId.slice(0, 8)}…</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="actor">
            Sent by (team member)
          </label>
          <input
            id="actor"
            className="vs-input max-w-[200px] text-sm"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            placeholder="Your name"
            aria-label="Team member name for audit log"
          />
          <button type="button" className="vs-button-ghost text-sm" onClick={() => router.push(`/crm/clients/${clientId}`)}>
            Cancel
          </button>
        </div>
      </div>

      {/* Video */}
      <section className="vs-card space-y-4" aria-labelledby="vid-title">
        <h2 id="vid-title" className="font-heading text-lg text-textPrimary">
          Your Personalized Video Report
        </h2>
        <p className="text-sm text-textMuted">
          {clientName} — VantageStack Analysis · Duration: <span className="text-textPrimary/80">—</span>{" "}
          <span className="text-textMuted">(set when available from pipeline)</span>
        </p>
        {videoUrl ? (
          <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black aspect-video max-w-3xl group">
            <video className="w-full h-full object-contain" poster="" preload="metadata" controls aria-label="Personalized video report">
              <source src={videoUrl} type="video/mp4" />
            </video>
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30"
              aria-hidden
            >
              <span className="rounded-full bg-accent/90 text-white px-5 py-2 text-sm font-medium shadow-lg">Play</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-amber-200/90">No video URL on this report yet. Email channel requires a Supabase / CDN video URL.</p>
        )}
      </section>

      {/* Written report */}
      <section className="vs-card space-y-4" aria-labelledby="written-title">
        <h2 id="written-title" className="font-heading text-lg text-textPrimary">
          Full Written Report
        </h2>
        <div className="prose prose-invert prose-sm max-w-none max-h-[480px] overflow-y-auto pr-2 text-textPrimary/90 [&_ul]:list-disc [&_ul]:pl-5 border border-white/5 rounded-xl p-4 bg-surface/40">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{narrative || "_No narrative yet._"}</ReactMarkdown>
        </div>
      </section>

      {/* Email preview */}
      <section className="vs-card space-y-4" aria-labelledby="email-prev-title">
        <h2 id="email-prev-title" className="font-heading text-lg text-textPrimary">
          Email Preview
        </h2>
        <div className="rounded-xl border border-white/10 bg-[#0b0b0c] p-3 text-xs text-textMuted space-y-2">
          <div>
            <span className="text-textMuted">From:</span>{" "}
            <span className="text-textPrimary">noreply@vantagestack.com</span>
          </div>
          <div>
            <span className="text-textMuted">Subject:</span>{" "}
            <span className="text-textPrimary">{subject || "—"}</span>
          </div>
        </div>
        <div
          className="rounded-xl border border-white/10 overflow-hidden bg-[#0b0b0c] min-h-[200px] max-h-[520px] overflow-y-auto"
          aria-label="Client email preview"
        >
          <iframe title="Email preview" className="w-full min-h-[360px] border-0 bg-white" srcDoc={previewHtml} sandbox="allow-same-origin" />
        </div>
      </section>

      {/* Recipients */}
      <section className="vs-card space-y-4" aria-labelledby="sendto-title">
        <h2 id="sendto-title" className="font-heading text-lg text-textPrimary">
          Send To
        </h2>
        <div>
          <label className="block text-xs uppercase tracking-wider text-textMuted mb-1" htmlFor="primary-email">
            Primary recipient email
          </label>
          <input
            id="primary-email"
            type="email"
            autoComplete="email"
            className="vs-input"
            value={recipients.primary}
            onChange={(e) => setRecipients((r) => ({ ...r, primary: e.target.value }))}
            aria-invalid={recipients.primary.length > 0 && !emailOk(recipients.primary)}
            aria-describedby="primary-email-hint"
          />
          <p id="primary-email-hint" className="text-xs text-textMuted mt-1">
            {recipients.primary && !emailOk(recipients.primary) ? "Enter a valid email address." : " "}
          </p>
        </div>
        {recipients.additional.map((em, i) => (
          <div key={i} className="flex gap-2 items-start">
            <div className="flex-1">
              <label className="sr-only" htmlFor={`add-email-${i}`}>
                Additional recipient {i + 1}
              </label>
              <input
                id={`add-email-${i}`}
                type="email"
                className="vs-input"
                value={em}
                onChange={(e) => setAdditional(i, e.target.value)}
                aria-invalid={em.length > 0 && !emailOk(em)}
              />
              {em && !emailOk(em) ? <p className="text-xs text-rose-300 mt-1">Invalid email</p> : null}
            </div>
            <button type="button" className="vs-button-ghost text-sm shrink-0" onClick={() => removeAdditional(i)} aria-label={`Remove recipient ${i + 1}`}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="vs-button-ghost text-sm" onClick={addRecipient}>
          Add More Recipients
        </button>
      </section>

      {/* Channels */}
      <section className="vs-card space-y-4" aria-labelledby="chan-title">
        <h2 id="chan-title" className="font-heading text-lg text-textPrimary">
          Delivery Channel
        </h2>
        <fieldset className="space-y-3">
          <legend className="sr-only">Choose delivery channels</legend>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 rounded border-white/20" checked={channels.email} onChange={(e) => setChannel("email", e.target.checked)} />
            <span className="text-sm text-textPrimary">Email</span>
          </label>
          <label className={`flex items-center gap-3 cursor-pointer ${!whatsappOnFile ? "opacity-60" : ""}`}>
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-white/20"
              checked={channels.whatsapp}
              onChange={(e) => setChannel("whatsapp", e.target.checked)}
              disabled={!whatsappOnFile}
            />
            <span className="text-sm text-textPrimary">WhatsApp</span>
            {!whatsappOnFile ? <span className="text-xs text-textMuted">(no number on file)</span> : null}
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 rounded border-white/20" checked={channels.pdf} onChange={(e) => setChannel("pdf", e.target.checked)} />
            <span className="text-sm text-textPrimary">Download PDF</span>
          </label>
        </fieldset>
        {waWarning ? (
          <p className="text-sm text-amber-200" role="status">
            WhatsApp is selected but this client has no WhatsApp number. Uncheck WhatsApp or add a number on the client profile.
          </p>
        ) : null}
        {!channelOk ? <p className="text-sm text-rose-300">Select at least one channel.</p> : null}
      </section>

      {/* Editor */}
      <section className="vs-card space-y-4" aria-labelledby="content-title">
        <h2 id="content-title" className="font-heading text-lg text-textPrimary">
          Email Content
        </h2>
        <div>
          <label className="block text-xs uppercase tracking-wider text-textMuted mb-1" htmlFor="subject-line">
            Subject line
          </label>
          <input id="subject-line" className="vs-input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
          <p className="text-xs text-textMuted mt-1" aria-live="polite">
            {subject.length} / 200 characters
          </p>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-textMuted mb-1" htmlFor="personalization">
            Personalization (optional, prepended to body)
          </label>
          <textarea id="personalization" className="vs-input min-h-[72px]" value={personalization} onChange={(e) => setPersonalization(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-textMuted mb-1" htmlFor="body">
            Body (use {"{{VIDEO_BLOCK}}"}, {"{{REPORT_BLOCK}}"}, {"{{CTA_BLOCK}}"} as needed)
          </label>
          <textarea id="body" className="vs-input min-h-[280px] font-mono text-sm" value={bodyText} onChange={(e) => setBodyText(e.target.value)} />
        </div>
      </section>

      {/* Schedule */}
      <section className="vs-card space-y-3" aria-labelledby="sched-title">
        <h2 id="sched-title" className="font-heading text-lg text-textPrimary">
          Schedule for later
        </h2>
        <label className="block text-xs text-textMuted mb-1" htmlFor="schedule-when">
          Date &amp; time (local)
        </label>
        <input id="schedule-when" type="datetime-local" className="vs-input max-w-xs" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
        <p className="text-xs text-textMuted">Up to 30 days ahead. Requires cron hitting /api/cron/report-scheduled-send.</p>
      </section>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 sticky bottom-4 bg-background/90 backdrop-blur py-3 border-t border-white/10">
        <button type="button" className="vs-button-primary disabled:opacity-40 disabled:cursor-not-allowed" disabled={!canSend || sending} onClick={sendNow}>
          Send Now
        </button>
        <button
          type="button"
          className="vs-button-ghost disabled:opacity-40"
          disabled={!canSend || !scheduleAt || sending}
          onClick={scheduleLater}
        >
          Schedule for Later
        </button>
        <button type="button" className="vs-button-ghost" onClick={downloadPdf}>
          Download as PDF
        </button>
        <button type="button" className="vs-button-ghost" disabled={sending} onClick={saveDraft}>
          Save as Draft
        </button>
      </div>
    </div>
  );
}
