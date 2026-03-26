import { randomBytes } from "crypto";
import type { Sql } from "postgres";
import { buildClientEmailHtml } from "../email/report-client-html";
import { ensureCrmSchema } from "./db";
import { logCrmActivity } from "./activity";
import { sendTelegramAlert } from "../scheduler-engine/telegram";
import { executeDeliverySend } from "../delivery/executeSend";
import { syncReportDelivered } from "./service";

export type ReviewRecipients = { primary: string; additional: string[] };
export type ReviewChannels = { email: boolean; whatsapp: boolean; pdf: boolean };

function section(title: string, body: string) {
  const b = body.trim();
  if (!b) return "";
  return `## ${title}\n\n${b}\n`;
}

export function buildReportNarrative(report: Record<string, unknown>): string {
  const parts: string[] = [];
  const score = report.website_score;
  if (typeof score === "number") parts.push(section("Website score", `${score}/100`));

  const blocks: [string, string][] = [
    ["Traffic", "traffic_data"],
    ["Backlinks", "backlink_data"],
    ["Competitors", "competitor_data"],
    ["SEO opportunities", "seo_opportunities"],
    ["Conversion critique", "conversion_critique"],
    ["Revenue opportunity", "revenue_opportunity"],
    ["Upsell suggestions", "upsell_suggestions"],
  ];

  for (const [label, key] of blocks) {
    const raw = report[key];
    if (raw == null) continue;
    const text =
      typeof raw === "string"
        ? raw
        : typeof raw === "object"
          ? "```json\n" + JSON.stringify(raw, null, 2) + "\n```"
          : String(raw);
    const s = section(label, text);
    if (s) parts.push(s);
  }

  if (!parts.length) {
    return "Report data is still being assembled. Add structured findings to this report row, or paste a summary in the email body before sending.";
  }
  return parts.join("\n");
}

function defaultSubject(clientName: string) {
  return `Your Personalized Business Analysis — ${clientName}`;
}

function extractUpsellLine(upsell: unknown): string {
  if (!upsell) return "a focused growth roadmap tailored to your site and funnel";
  if (typeof upsell === "string") return upsell.slice(0, 220);
  if (Array.isArray(upsell) && upsell[0] && typeof upsell[0] === "object") {
    const o = upsell[0] as { offer?: string; service_name?: string };
    return (o.offer || o.service_name || "a strategic growth package").slice(0, 220);
  }
  if (typeof upsell === "object" && upsell && "offer" in upsell) {
    return String((upsell as { offer?: string }).offer ?? "a strategic growth package").slice(0, 220);
  }
  return "a focused growth roadmap tailored to your site and funnel";
}

/** Editable template; {{VIDEO_BLOCK}}, {{REPORT_BLOCK}}, {{CTA_BLOCK}} filled when sending / previewing. */
function defaultTemplateBody(clientName: string, upsellLine: string) {
  return `Hi ${clientName},

I'm excited to share your personalized VantageStack business analysis. I've completed a deep dive into your business, and I've discovered some really valuable insights.

Watch the video below to see:
- Your current website health score
- Traffic and engagement analysis
- How you compare to your competitors
- Revenue opportunities we've identified
- The best next step for your business

{{VIDEO_BLOCK}}

${clientName} — Your VantageStack Analysis

Below, you'll find the complete written report with all the details and data.

{{REPORT_BLOCK}}

What's Next?

Based on this analysis, I recommend we discuss ${upsellLine}. This could significantly impact your business growth.

Ready to take the next step? Let's schedule a quick call to discuss your opportunities.

{{CTA_BLOCK}}

Questions? Reply to this email or reach out to our team.

Looking forward to working with you,

The VantageStack Team`;
}

export function publicBaseUrl() {
  const u = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3005").trim();
  return u.replace(/\/$/, "");
}

export function consultationUrl() {
  const u = (process.env.NEXT_PUBLIC_CONSULTATION_URL || "").trim();
  if (u) return u;
  return `${publicBaseUrl()}/contact`;
}

async function ensureShareToken(db: Sql, reportId: string): Promise<string> {
  const rows = await db<{ share_token: string | null }[]>`
    select share_token::text as share_token from public.reports where id = ${reportId}::uuid limit 1
  `;
  const existing = rows[0]?.share_token;
  if (existing) return existing;
  const token = randomBytes(24).toString("hex");
  await db.unsafe(`update public.reports set share_token = $1 where id = $2::uuid`, [token, reportId]);
  return token;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendResendWithRetry(params: { to: string[]; subject: string; html: string }) {
  const key = (process.env.RESEND_API_KEY || "").trim();
  if (!key) throw new Error("RESEND_API_KEY is not set");
  let lastErr: Error | null = null;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch("https://api.resend.com/emails/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "noreply@vantagestack.com",
          to: params.to,
          subject: params.subject,
          html: params.html,
        }),
      });
      const txt = await res.text();
      if (!res.ok) throw new Error(`Resend ${res.status}: ${txt.slice(0, 400)}`);
      let id = "";
      try {
        id = String(JSON.parse(txt).id ?? "");
      } catch {
        /* ignore */
      }
      return { id };
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (i < 2) await sleep(10_000);
    }
  }
  throw lastErr ?? new Error("Resend failed");
}

async function sendTwilioWhatsAppMessage(params: { to: string; body: string }) {
  const accountSid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = (process.env.TWILIO_WHATSAPP_FROM || "").trim();
  if (!accountSid || !authToken || !from) throw new Error("Twilio WhatsApp env not configured");
  const to = params.to.startsWith("whatsapp:") ? params.to : `whatsapp:${params.to}`;
  const body = new URLSearchParams({ From: from, To: to, Body: params.body });
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${txt.slice(0, 300)}`);
  let sid = "";
  try {
    sid = String(JSON.parse(txt).sid ?? "");
  } catch {
    /* ignore */
  }
  return { sid };
}

export async function getReportReviewBundle(db: Sql, reportId: string) {
  await ensureCrmSchema(db);
  const rows = await db`
    select
      r.id::text as id,
      r.client_id::text as client_id,
      r.report_type::text as report_type,
      r.website_score::int as website_score,
      r.traffic_data as traffic_data,
      r.backlink_data as backlink_data,
      r.competitor_data as competitor_data,
      r.seo_opportunities as seo_opportunities,
      r.conversion_critique as conversion_critique,
      r.revenue_opportunity as revenue_opportunity,
      r.upsell_suggestions as upsell_suggestions,
      r.video_url::text as video_url,
      r.report_markdown::text as report_markdown,
      r.share_token::text as share_token,
      r.sent_at::text as sent_at,
      r.created_at::text as created_at,
      r.report_generated,
      c.name::text as client_name,
      c.email::text as client_email,
      c.whatsapp::text as client_whatsapp
    from public.reports r
    join public.clients c on c.id = r.client_id
    where r.id = ${reportId}::uuid
    limit 1
  `;
  const report = rows[0] as Record<string, unknown> | undefined;
  if (!report) return { ok: false as const, error: "not_found" };

  const rev = await db`
    select
      report_id::text,
      status::text,
      subject::text,
      body_text::text,
      personalization_notes::text,
      recipients,
      channels,
      scheduled_for::text,
      customization,
      updated_by::text,
      updated_at::text,
      sent_at::text,
      sent_by::text,
      sent_channels
    from public.report_delivery_reviews
    where report_id = ${reportId}::uuid
    limit 1
  `;
  const review = (rev[0] as Record<string, unknown>) ?? null;

  const narrative =
    typeof report.report_markdown === "string" && report.report_markdown.trim()
      ? report.report_markdown.trim()
      : buildReportNarrative(report);
  const clientName = String(report.client_name ?? "there");
  const videoUrl = report.video_url ? String(report.video_url) : null;
  const upsellLine = extractUpsellLine(report.upsell_suggestions);

  const defaultSub = defaultSubject(clientName);
  const defaultBod = defaultTemplateBody(clientName, upsellLine);

  const recipients: ReviewRecipients = review?.recipients
    ? (review.recipients as ReviewRecipients)
    : { primary: String(report.client_email ?? ""), additional: [] };

  const channels: ReviewChannels = review?.channels
    ? (review.channels as ReviewChannels)
    : { email: true, whatsapp: false, pdf: false };

  return {
    ok: true as const,
    report,
    review,
    defaults: {
      narrative,
      subject: defaultSub,
      body: defaultBod,
      consultation_url: consultationUrl(),
      public_base_url: publicBaseUrl(),
    },
    ui: {
      subject: (review?.subject as string) || defaultSub,
      body_text: (review?.body_text as string) || defaultBod,
      personalization_notes: (review?.personalization_notes as string) || "",
      recipients,
      channels,
      status: (review?.status as string) || (report.sent_at ? "sent" : "draft"),
      scheduled_for: review?.scheduled_for as string | null,
      previously_sent: Boolean(report.sent_at),
      sent_at: review?.sent_at as string | null,
      sent_by: review?.sent_by as string | null,
      sent_channels: review?.sent_channels ?? null,
      updated_by: (review?.updated_by as string) || "",
    },
  };
}

export async function saveReviewDraft(
  db: Sql,
  reportId: string,
  input: {
    client_id: string;
    subject: string;
    body_text: string;
    personalization_notes: string;
    recipients: ReviewRecipients;
    channels: ReviewChannels;
    status: "draft" | "ready";
    actor: string;
    customization?: Record<string, unknown>;
  },
) {
  await ensureCrmSchema(db);
  const cust = input.customization ?? {};
  await db`
    insert into public.report_delivery_reviews (
      report_id, status, subject, body_text, personalization_notes,
      recipients, channels, customization, updated_by, updated_at
    ) values (
      ${reportId}::uuid,
      ${input.status},
      ${input.subject},
      ${input.body_text},
      ${input.personalization_notes},
      ${JSON.stringify(input.recipients)}::jsonb,
      ${JSON.stringify(input.channels)}::jsonb,
      ${JSON.stringify(cust)}::jsonb,
      ${input.actor},
      now()
    )
    on conflict (report_id) do update set
      status = excluded.status,
      subject = excluded.subject,
      body_text = excluded.body_text,
      personalization_notes = excluded.personalization_notes,
      recipients = excluded.recipients,
      channels = excluded.channels,
      customization = excluded.customization,
      updated_by = excluded.updated_by,
      updated_at = now()
  `;
  await logCrmActivity(db, {
    action_type: "report_review_draft_saved",
    client_id: input.client_id,
    user_actor: input.actor,
    details: { report_id: reportId, status: input.status },
  });
  return { ok: true as const };
}

export async function scheduleReviewSend(
  db: Sql,
  reportId: string,
  input: {
    client_id: string;
    scheduled_for: string;
    subject: string;
    body_text: string;
    personalization_notes: string;
    recipients: ReviewRecipients;
    channels: ReviewChannels;
    actor: string;
    customization?: Record<string, unknown>;
  },
) {
  await ensureCrmSchema(db);
  const cust = { ...(input.customization ?? {}), scheduled_via: "crm_review" };
  await db`
    insert into public.report_delivery_reviews (
      report_id, status, subject, body_text, personalization_notes,
      recipients, channels, scheduled_for, customization, updated_by, updated_at
    ) values (
      ${reportId}::uuid,
      'scheduled',
      ${input.subject},
      ${input.body_text},
      ${input.personalization_notes},
      ${JSON.stringify(input.recipients)}::jsonb,
      ${JSON.stringify(input.channels)}::jsonb,
      ${input.scheduled_for}::timestamptz,
      ${JSON.stringify(cust)}::jsonb,
      ${input.actor},
      now()
    )
    on conflict (report_id) do update set
      status = 'scheduled',
      subject = excluded.subject,
      body_text = excluded.body_text,
      personalization_notes = excluded.personalization_notes,
      recipients = excluded.recipients,
      channels = excluded.channels,
      scheduled_for = excluded.scheduled_for,
      customization = excluded.customization,
      updated_by = excluded.updated_by,
      updated_at = now(),
      reminder_sent_at = null
  `;
  await logCrmActivity(db, {
    action_type: "report_send_scheduled",
    client_id: input.client_id,
    user_actor: input.actor,
    details: { report_id: reportId, scheduled_for: input.scheduled_for },
  });
  return { ok: true as const };
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export function validateRecipients(r: ReviewRecipients): { ok: true } | { ok: false; error: string } {
  const emails = [r.primary, ...r.additional.map((x) => x.trim())].filter(Boolean);
  if (!emails.length) return { ok: false, error: "At least one recipient email is required." };
  for (const e of emails) {
    if (!emailRe.test(e)) return { ok: false, error: `Invalid email: ${e}` };
  }
  return { ok: true };
}

export function validateChannels(c: ReviewChannels): { ok: true } | { ok: false; error: string } {
  if (!c.email && !c.whatsapp && !c.pdf) {
    return { ok: false, error: "Select at least one channel (Email, WhatsApp, or Download PDF)." };
  }
  return { ok: true };
}

export async function sendReportReviewNow(
  db: Sql,
  reportId: string,
  input: {
    subject: string;
    body_text: string;
    personalization_notes: string;
    recipients: ReviewRecipients;
    channels: ReviewChannels;
    actor: string;
    client_id: string;
    client_name: string;
    video_url: string | null;
    whatsapp_to: string | null;
    customization?: Record<string, unknown>;
  },
) {
  const vr = validateRecipients(input.recipients);
  if (!vr.ok) return vr;
  const vc = validateChannels(input.channels);
  if (!vc.ok) return vc;

  if (input.channels.whatsapp && !input.whatsapp_to?.trim()) {
    return { ok: false as const, error: "WhatsApp is selected but the client has no WhatsApp number on file." };
  }

  const fullBody =
    (input.personalization_notes.trim() ? `${input.personalization_notes.trim()}\n\n---\n\n` : "") + input.body_text;

  await ensureCrmSchema(db);

  const repRows = await db`
    select
      r.report_markdown::text as report_markdown,
      r.website_score::int as website_score,
      r.traffic_data as traffic_data,
      r.backlink_data as backlink_data,
      r.competitor_data as competitor_data,
      r.seo_opportunities as seo_opportunities,
      r.conversion_critique as conversion_critique,
      r.revenue_opportunity as revenue_opportunity,
      r.upsell_suggestions as upsell_suggestions
    from public.reports r
    where r.id = ${reportId}::uuid
    limit 1
  `;
  const rep0 = (repRows[0] ?? {}) as Record<string, unknown>;
  const reportMd =
    (typeof rep0.report_markdown === "string" && rep0.report_markdown.trim()
      ? rep0.report_markdown
      : buildReportNarrative(rep0)) || "";

  const toList = [input.recipients.primary, ...input.recipients.additional].map((x) => x.trim()).filter(Boolean);
  const videoUrl = input.video_url?.trim() || "";
  const html = buildClientEmailHtml({
    bodyPlain: fullBody,
    videoUrl,
    reportMarkdown: reportMd,
    consultationUrl: consultationUrl(),
    clientName: input.client_name,
  });

  let resendId = "";
  let queueResult: Awaited<ReturnType<typeof executeDeliverySend>> | null = null;
  let waSid = "";

  if (input.channels.email) {
    if (!videoUrl) {
      return { ok: false as const, error: "Video URL is required to send the email with an embedded player." };
    }
    const resendKey = (process.env.RESEND_API_KEY || "").trim();
    if (resendKey) {
      try {
        const out = await sendResendWithRetry({ to: toList, subject: input.subject, html });
        resendId = out.id;
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    } else {
      const deliveryPayload: Record<string, unknown> = {
        action: "deliver_report",
        source: "crm_report_review",
        report_id: reportId,
        client_id: input.client_id,
        client_name: input.client_name,
        recipients: toList,
        channels: input.channels,
        subject: input.subject,
        body_text: fullBody,
        body_html: html,
        video_url: input.video_url,
        whatsapp_to: input.whatsapp_to,
        customization: {
          ...(input.customization ?? {}),
          personalization_notes: input.personalization_notes,
          sent_from: "crm_review",
        },
        actor: input.actor,
      };
      queueResult = await executeDeliverySend(deliveryPayload);
      if (!queueResult.ok) {
        return { ok: false as const, error: queueResult.error ?? "Delivery failed", raw: queueResult.raw };
      }
    }
  }

  if (input.channels.whatsapp && input.whatsapp_to) {
    try {
      const token = await ensureShareToken(db, reportId);
      const reportLink = `${publicBaseUrl()}/report/share/${token}`;
      const msg = `Hi ${input.client_name}, your personalized VantageStack report is ready. Watch your video analysis here: ${videoUrl || reportLink}. Full report: ${reportLink}. Reply to schedule a consultation.`;
      const out = await sendTwilioWhatsAppMessage({ to: input.whatsapp_to.trim(), body: msg });
      waSid = out.sid;
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  }

  const sentChannels = {
    email: input.channels.email,
    whatsapp: input.channels.whatsapp,
    pdf: input.channels.pdf,
    resend_id: resendId || null,
    whatsapp_sid: waSid || null,
    queue_mode: queueResult?.mode ?? null,
  };
  const sentAt = new Date().toISOString();
  const deliveryMeta = {
    ...(input.customization ?? {}),
    resend_id: resendId,
    whatsapp_sid: waSid,
    queue_result: queueResult?.result ?? null,
  };

  await db`
    insert into public.report_delivery_reviews (
      report_id, status, subject, body_text, personalization_notes,
      recipients, channels, customization, updated_by, updated_at,
      sent_at, sent_by, sent_channels, scheduled_for
    ) values (
      ${reportId}::uuid,
      'sent',
      ${input.subject},
      ${input.body_text},
      ${input.personalization_notes},
      ${JSON.stringify(input.recipients)}::jsonb,
      ${JSON.stringify(input.channels)}::jsonb,
      ${JSON.stringify(deliveryMeta)}::jsonb,
      ${input.actor},
      now(),
      ${sentAt}::timestamptz,
      ${input.actor},
      ${JSON.stringify(sentChannels)}::jsonb,
      null
    )
    on conflict (report_id) do update set
      status = 'sent',
      subject = excluded.subject,
      body_text = excluded.body_text,
      personalization_notes = excluded.personalization_notes,
      recipients = excluded.recipients,
      channels = excluded.channels,
      customization = excluded.customization,
      updated_by = excluded.updated_by,
      updated_at = now(),
      sent_at = excluded.sent_at,
      sent_by = excluded.sent_by,
      sent_channels = excluded.sent_channels,
      scheduled_for = null
  `;

  const electronicSent = input.channels.email || input.channels.whatsapp;
  if (electronicSent) {
    await syncReportDelivered(db, {
      report_id: reportId,
      client_id: input.client_id,
      move_to_report_sent: true,
      user_actor: input.actor,
      extra_details: { channels: sentChannels, resend_id: resendId, whatsapp_sid: waSid },
    });
  } else if (input.channels.pdf) {
    await db`
      update public.clients
      set last_active_at = now(), updated_at = now()
      where id = ${input.client_id}::uuid
    `;
  }

  try {
    await db`
      insert into public.events (client_id, event_type, timestamp, metadata)
      values (
        ${input.client_id}::uuid,
        'report_sent',
        now(),
        ${JSON.stringify({
          report_id: reportId,
          sent_via: [
            input.channels.email && "email",
            input.channels.whatsapp && "whatsapp",
            input.channels.pdf && "pdf",
          ].filter(Boolean),
          sent_by: input.actor,
          recipients: toList,
        })}::jsonb
      )
    `;
  } catch {
    /* events table may be missing in some envs */
  }

  if (input.channels.email) {
    await db`
      insert into public.client_communications (client_id, channel, subject, body_preview, metadata)
      values (
        ${input.client_id}::uuid,
        'email',
        ${input.subject},
        ${fullBody.slice(0, 500)},
        ${JSON.stringify({ report_id: reportId, recipients: toList, resend_id: resendId })}::jsonb
      )
    `;
  }

  if (input.channels.whatsapp) {
    await db`
      insert into public.client_communications (client_id, channel, subject, body_preview, metadata)
      values (
        ${input.client_id}::uuid,
        'whatsapp',
        ${"VantageStack report ready"},
        ${`WhatsApp sid ${waSid}`.slice(0, 500)},
        ${JSON.stringify({ report_id: reportId, whatsapp_sid: waSid })}::jsonb
      )
    `;
  }

  const chList = [
    input.channels.email ? "email" : null,
    input.channels.whatsapp ? "WhatsApp" : null,
    input.channels.pdf ? "PDF" : null,
  ]
    .filter(Boolean)
    .join(", ");

  try {
    await sendTelegramAlert({
      text: `✅ Report sent to ${input.client_name} via ${chList || "delivery"}. Sent by ${input.actor}. Video: ${videoUrl || "—"}`,
    });
  } catch {
    // best-effort
  }

  await logCrmActivity(db, {
    action_type: "report_review_sent",
    client_id: input.client_id,
    user_actor: input.actor,
    details: { report_id: reportId, channels: sentChannels },
  });

  return {
    ok: true as const,
    delivery: queueResult ?? { mode: resendId ? "resend" : "none", result: { resend_id: resendId, whatsapp_sid: waSid } },
    pdf_download_path: input.channels.pdf ? `/api/crm/reports/${reportId}/pdf` : undefined,
  };
}

/** Cron: send scheduled reviews that are due. */
export async function processDueScheduledReportSends(db: Sql) {
  await ensureCrmSchema(db);
  const due = await db<{ report_id: string; client_id: string }[]>`
    select r.report_id::text, rep.client_id::text as client_id
    from public.report_delivery_reviews r
    join public.reports rep on rep.id = r.report_id
    where r.status = 'scheduled'
      and r.scheduled_for is not null
      and r.scheduled_for <= now()
  `;
  const results: { report_id: string; ok: boolean; error?: string }[] = [];
  for (const row of due) {
    const bundle = await getReportReviewBundle(db, row.report_id);
    if (!bundle.ok) {
      results.push({ report_id: row.report_id, ok: false, error: "not_found" });
      continue;
    }
    const ui = bundle.ui;
    const report = bundle.report as Record<string, unknown>;
    const sendRes = await sendReportReviewNow(db, row.report_id, {
      subject: ui.subject,
      body_text: ui.body_text,
      personalization_notes: ui.personalization_notes,
      recipients: ui.recipients,
      channels: ui.channels,
      actor: "scheduled_send",
      client_id: row.client_id,
      client_name: String(report.client_name ?? ""),
      video_url: report.video_url ? String(report.video_url) : null,
      whatsapp_to: report.client_whatsapp ? String(report.client_whatsapp) : null,
    });
    if (sendRes.ok) results.push({ report_id: row.report_id, ok: true });
    else results.push({ report_id: row.report_id, ok: false, error: "error" in sendRes ? sendRes.error : "failed" });
  }
  return results;
}

/** ~1h before scheduled send — one-time Telegram reminder per row. */
export async function sendScheduledReportReminders(db: Sql) {
  await ensureCrmSchema(db);
  const rows = await db<{ report_id: string; client_name: string; scheduled_for: string }[]>`
    select r.report_id::text, c.name::text as client_name, r.scheduled_for::text
    from public.report_delivery_reviews r
    join public.reports rep on rep.id = r.report_id
    join public.clients c on c.id = rep.client_id
    where r.status = 'scheduled'
      and r.scheduled_for is not null
      and r.reminder_sent_at is null
      and r.scheduled_for <= (now() + interval '1 hour')
      and r.scheduled_for > now()
  `;
  for (const row of rows) {
    try {
      await sendTelegramAlert({
        text: `⏰ Scheduled report send for ${row.client_name} at ${row.scheduled_for.slice(0, 16)} UTC (~within 1 hour).`,
      });
    } catch {
      /* ignore */
    }
    await db.unsafe(`update public.report_delivery_reviews set reminder_sent_at = now() where report_id = $1::uuid`, [
      row.report_id,
    ]);
  }
  return { reminded: rows.length };
}

export async function getReportPublicByShareToken(db: Sql, token: string) {
  await ensureCrmSchema(db);
  const rows = await db`
    select
      r.id::text as id,
      r.video_url::text as video_url,
      r.report_markdown::text as report_markdown,
      r.website_score::int as website_score,
      r.traffic_data as traffic_data,
      r.backlink_data as backlink_data,
      r.competitor_data as competitor_data,
      r.seo_opportunities as seo_opportunities,
      r.conversion_critique as conversion_critique,
      r.revenue_opportunity as revenue_opportunity,
      r.upsell_suggestions as upsell_suggestions,
      c.name::text as client_name
    from public.reports r
    join public.clients c on c.id = r.client_id
    where r.share_token = ${token}
    limit 1
  `;
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) return { ok: false as const, error: "not_found" as const };
  const narrative =
    typeof row.report_markdown === "string" && row.report_markdown.trim()
      ? row.report_markdown.trim()
      : buildReportNarrative(row);
  return { ok: true as const, client_name: String(row.client_name ?? ""), video_url: row.video_url, narrative };
}
