#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import crypto from "crypto";
import postgres from "postgres";

const repoRoot = process.cwd();

function requiredEnv(name: string): string {
  const v = (process.env[name] || "").trim();
  if (!v) throw new Error(`${name} is required (set it in .env.local)`);
  return v;
}

function optionalEnv(name: string): string | null {
  const v = (process.env[name] || "").trim();
  return v ? v : null;
}

async function ensureDataDir() {
  await mkdir(join(repoRoot, "data"), { recursive: true });
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    const txt = await readFile(path, "utf-8");
    return JSON.parse(txt) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

type DeliveryRecord = {
  id: string;
  created_at: string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  video_url: string | null;
  pdf_url: string | null;
  consultation_url: string | null;
  report_summary: string | null;
  resend: null | {
    message_id: string | null;
    to: string;
    subject: string;
    status: "queued" | "sent" | "error";
    error: string | null;
    sent_at: string;
  };
  whatsapp: null | {
    message_sid: string | null;
    to: string;
    from: string;
    status: "queued" | "sent" | "error";
    error: string | null;
    sent_at: string;
  };
  opens: Array<{ opened_at: string; user_agent?: string | null; ip?: string | null }>;
};

async function upsertDelivery(partial: Partial<DeliveryRecord> & { id: string }) {
  await ensureDataDir();
  const dbPath = join(repoRoot, "data", "delivery-logs.json");
  const existing = await readJsonFile<DeliveryRecord[]>(dbPath, []);
  const idx = existing.findIndex((r) => r.id === partial.id);
  if (idx >= 0) existing[idx] = { ...existing[idx], ...partial };
  else existing.unshift(partial as DeliveryRecord);
  await writeJsonFile(dbPath, existing);
  return (idx >= 0 ? existing[idx] : existing[0])!;
}

async function getDelivery(id: string) {
  await ensureDataDir();
  const dbPath = join(repoRoot, "data", "delivery-logs.json");
  const existing = await readJsonFile<DeliveryRecord[]>(dbPath, []);
  return existing.find((r) => r.id === id) ?? null;
}

function stripHtml(text: string) {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function htmlEscape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function computeSummaryFromReportJson(reportJson: unknown): string {
  if (!reportJson || typeof reportJson !== "object") {
    return "I’ve pulled together your growth report with the fastest wins and the highest-leverage next steps to improve leads and revenue.";
  }

  const asAny = reportJson as any;
  const bullets: string[] = [];

  const healthTotal = asAny?.healthScore?.total ?? asAny?.health?.total ?? asAny?.health_score?.total;
  if (typeof healthTotal === "number") bullets.push(`Overall website health score: ${Math.round(healthTotal)}/100.`);

  const gaps = asAny?.gaps ?? asAny?.opportunities ?? asAny?.keyGaps;
  if (Array.isArray(gaps) && gaps.length) bullets.push(`Top gaps identified: ${String(gaps[0]?.title ?? gaps[0]?.issue ?? "priority opportunities")}.`);

  const revenue = asAny?.revenueOpportunity?.estimates?.revenueUsd ?? asAny?.revenue?.estimates?.revenueUsd;
  if (typeof revenue === "number") bullets.push(`Estimated upside: about $${Math.round(revenue).toLocaleString()}/month at target capture.`);

  if (!bullets.length) {
    return "I’ve pulled together your growth report with the fastest wins and the highest-leverage next steps to improve leads and revenue.";
  }

  const sentence1 = bullets[0] ?? "";
  const sentence2 = bullets[1] ?? "Inside you’ll see the highest-impact fixes and the quickest path to measurable lift.";
  const sentence3 = bullets[2] ?? "Watch the short walkthrough video, then grab the PDF for the full breakdown.";

  return [sentence1, sentence2, sentence3].filter(Boolean).join(" ");
}

function getHealthScore(reportJson: unknown): number | null {
  if (!reportJson || typeof reportJson !== "object") return null;
  const asAny = reportJson as any;
  const total =
    asAny?.healthScore?.total ??
    asAny?.health?.total ??
    asAny?.health_score?.total ??
    asAny?.website_health?.score ??
    asAny?.websiteHealth?.score;
  return typeof total === "number" && Number.isFinite(total) ? total : null;
}

function getRevenueTeaser(reportJson: unknown): string | null {
  if (!reportJson || typeof reportJson !== "object") return null;
  const asAny = reportJson as any;
  const revenue =
    asAny?.revenueOpportunity?.estimates?.revenueUsd ??
    asAny?.revenue?.estimates?.revenueUsd ??
    asAny?.revenue_opportunity_usd ??
    asAny?.revenueOpportunityUsd;
  if (typeof revenue === "number" && Number.isFinite(revenue) && revenue > 0) {
    return `Revenue opportunity: approximately $${Math.round(revenue).toLocaleString()}/month at target capture.`;
  }
  const note =
    asAny?.revenueOpportunity?.notes?.[0] ??
    asAny?.revenue?.notes?.[0] ??
    asAny?.revenueOpportunity?.headline ??
    asAny?.revenue?.headline;
  return typeof note === "string" && note.trim() ? note.trim() : null;
}

function getRevenueUsdEstimate(reportJson: unknown): number | null {
  if (!reportJson || typeof reportJson !== "object") return null;
  const asAny = reportJson as any;
  const revenue =
    asAny?.revenueOpportunity?.estimates?.revenueUsd ??
    asAny?.revenue?.estimates?.revenueUsd ??
    asAny?.revenue_opportunity_usd ??
    asAny?.revenueOpportunityUsd;
  if (typeof revenue === "number" && Number.isFinite(revenue) && revenue > 0) return Math.round(revenue);
  return null;
}

function healthColor(score: number | null) {
  if (score == null) return { bg: "#2a2f45", fg: "#d8e0ff", label: "—" };
  const s = Math.max(0, Math.min(100, score));
  if (s >= 80) return { bg: "#0b3d2e", fg: "#b9ffe3", label: `${Math.round(s)}/100` };
  if (s >= 60) return { bg: "#3a3a0b", fg: "#fff3b9", label: `${Math.round(s)}/100` };
  return { bg: "#3d1212", fg: "#ffd0d0", label: `${Math.round(s)}/100` };
}

function renderEmailHtml(params: {
  client_name: string;
  report_summary: string;
  health_score_total?: number | null;
  revenue_teaser?: string | null;
  video_url: string;
  pdf_url: string;
  consultation_url: string;
  tracking_pixel_url?: string | null;
}) {
  const name = htmlEscape(params.client_name);
  const summary = htmlEscape(params.report_summary);
  const revenueTeaser = params.revenue_teaser ? htmlEscape(params.revenue_teaser) : null;
  const health = healthColor(params.health_score_total ?? null);
  const videoUrl = params.video_url;
  const pdfUrl = params.pdf_url;
  const consultUrl = params.consultation_url;
  const tracking = params.tracking_pixel_url ? `<img src="${params.tracking_pixel_url}" width="1" height="1" alt="" style="display:none;opacity:0" />` : "";

  // Note: many email clients won’t render <video>; we include it + a strong fallback CTA link.
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Your Personalized VantageStack Report</title>
  </head>
  <body style="margin:0;background:#0b0f19;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0b0f19;">
      <tr>
        <td align="center" style="padding:22px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;background:#111a2e;border:1px solid rgba(255,255,255,.08);border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:22px;color:#e7ecff;">
                <div style="font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:#a9b7ff;">
                  VantageStack
                </div>
                <h1 style="margin:12px 0 0 0;font-size:24px;line-height:1.25;color:#ffffff;">
                  Hi ${name},
                </h1>
                <p style="margin:12px 0 0 0;font-size:15px;line-height:1.6;color:#d8e0ff;">
                  ${summary}
                </p>

                <div style="margin-top:16px;">
                  <span style="display:inline-block;background:${health.bg};color:${health.fg};padding:8px 12px;border-radius:999px;font-weight:800;font-size:13px;">
                    Website health score: ${health.label}
                  </span>
                </div>

                ${revenueTeaser ? `<p style="margin:12px 0 0 0;font-size:14px;line-height:1.6;color:#d8e0ff;">${revenueTeaser}</p>` : ""}
              </td>
            </tr>

            <tr>
              <td style="padding:0 22px 8px 22px;">
                <div style="background:linear-gradient(135deg,#2d3cff,#00c2ff);border-radius:14px;padding:18px;color:#ffffff;">
                  <div style="font-size:15px;line-height:1.5;margin:0 0 10px 0;font-weight:700;">
                    Your video walkthrough
                  </div>
                  <div style="margin:0 0 12px 0;">
                    <video controls style="width:100%;max-width:596px;border-radius:12px;background:#0b0f19;">
                      <source src="${videoUrl}" />
                    </video>
                  </div>
                  <a href="${videoUrl}" style="display:inline-block;background:#0b0f19;color:#ffffff;text-decoration:none;padding:12px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.18);font-weight:700;">
                    Watch video (tap to open)
                  </a>
                  <div style="margin-top:10px;font-size:12px;opacity:.9;word-break:break-all;">
                    ${htmlEscape(videoUrl)}
                  </div>
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:12px 22px 24px 22px;">
                <a href="${pdfUrl}" style="display:inline-block;background:#ffffff;color:#0b0f19;text-decoration:none;padding:12px 14px;border-radius:12px;font-weight:800;margin-right:10px;">
                  View full report (PDF)
                </a>
                <a href="${consultUrl}" style="display:inline-block;background:#0b0f19;color:#ffffff;text-decoration:none;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.18);font-weight:800;">
                  Book a consultation call
                </a>
                <div style="margin-top:12px;font-size:12px;line-height:1.6;color:#a9b7ff;">
                  If buttons don’t work, copy/paste:
                  <div style="word-break:break-all;margin-top:6px;">PDF: ${htmlEscape(pdfUrl)}</div>
                  <div style="word-break:break-all;margin-top:2px;">Call: ${htmlEscape(consultUrl)}</div>
                </div>
              </td>
            </tr>
          </table>
          <div style="max-width:640px;margin:10px auto 0 auto;color:#6f7bb8;font-size:12px;line-height:1.6;padding:0 8px;">
            You’re receiving this because you requested a VantageStack growth report.
          </div>
        </td>
      </tr>
    </table>
    ${tracking}
  </body>
</html>`;
}

const GenerateEmailTemplateInput = z.object({
  client_name: z.string().min(1),
  client_email: z.string().email().optional(),
  video_url: z.string().url(),
  pdf_url: z.string().url(),
  consultation_url: z.string().url(),
  report_json: z.any().optional(),
  report_summary_override: z.string().min(1).optional(),
  delivery_id: z.string().min(1).optional(),
});

const CallResendApiInput = z.object({
  to: z.string().email(),
  from: z.string().email().optional(),
  subject: z.string().min(1).default("Your Vantage Tech growth report is ready"),
  html: z.string().min(1),
  text: z.string().min(1).optional(),
  reply_to: z.string().email().optional(),
});

const CallTwilioWhatsAppInput = z.object({
  to_e164: z.string().min(6), // e.g. +614...
  body: z.string().min(1),
  from_whatsapp: z.string().optional(), // e.g. whatsapp:+14155238886
});

const LogDeliveryInput = z.object({
  delivery_id: z.string().min(1),
  client_name: z.string().min(1),
  client_email: z.string().email().nullable().optional(),
  client_phone: z.string().nullable().optional(),
  video_url: z.string().url().nullable().optional(),
  pdf_url: z.string().url().nullable().optional(),
  consultation_url: z.string().url().nullable().optional(),
  report_summary: z.string().nullable().optional(),
  resend: z
    .object({
      message_id: z.string().nullable().optional(),
      to: z.string().email(),
      subject: z.string().min(1),
      status: z.enum(["queued", "sent", "error"]),
      error: z.string().nullable().optional(),
      sent_at: z.string().min(1),
    })
    .nullable()
    .optional(),
  whatsapp: z
    .object({
      message_sid: z.string().nullable().optional(),
      to: z.string().min(1),
      from: z.string().min(1),
      status: z.enum(["queued", "sent", "error"]),
      error: z.string().nullable().optional(),
      sent_at: z.string().min(1),
    })
    .nullable()
    .optional(),
});

const TrackOpensInput = z.object({
  delivery_id: z.string().min(1),
  opened_at: z.string().min(1).optional(),
  user_agent: z.string().optional(),
  ip: z.string().optional(),
});

const DeliverReportInput = z.object({
  report_id: z.string().min(1).optional(),
  delivery_id: z.string().min(1).optional(),
  client_name: z.string().min(1),
  client_email: z.string().email(),
  client_whatsapp_e164: z.string().min(6),
  video_url: z.string().url(),
  pdf_url: z.string().url(),
  consultation_url: z.string().url(),
  report_json: z.any().optional(),
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function updateReportsTable(params: {
  report_id: string;
  sent_at_iso: string;
  delivery_complete: boolean;
}) {
  const pgUrl = (process.env.DELIVERY_PG_URL || process.env.WEEKLY_PG_URL || process.env.BRIEFING_PG_URL || "").trim();
  if (!pgUrl) return { ok: false, skipped: true, reason: "No DELIVERY_PG_URL/WEEKLY_PG_URL/BRIEFING_PG_URL set." };

  const table = (process.env.DELIVERY_REPORTS_TABLE || "reports").trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
    throw new Error("DELIVERY_REPORTS_TABLE must be a simple identifier (letters/numbers/underscore).");
  }

  const sentAt = new Date(params.sent_at_iso);
  if (Number.isNaN(sentAt.getTime())) throw new Error("sent_at_iso must be a valid ISO timestamp.");

  const db = postgres(pgUrl, { max: 3, prepare: false });
  try {
    await db.unsafe(
      `update ${table} set sent_at = $1, delivery_complete = $2 where id = $3`,
      [sentAt.toISOString(), params.delivery_complete, params.report_id]
    );
    return { ok: true };
  } finally {
    await db.end({ timeout: 5 });
  }
}

async function notifyInternalWebhook(payload: unknown) {
  const url = (process.env.INTERNAL_DELIVERY_WEBHOOK_URL || "").trim();
  if (!url) return { ok: false, skipped: true, reason: "INTERNAL_DELIVERY_WEBHOOK_URL not set." };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const txt = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`Internal webhook failed: ${res.status} ${txt}`);
  return { ok: true };
}

export async function callResendApi(params: z.infer<typeof CallResendApiInput>) {
  const apiKey = requiredEnv("RESEND_API_KEY");
  const from = params.from ?? requiredEnv("RESEND_FROM_EMAIL");
  // Per spec: /emails/send
  const res = await fetch("https://api.resend.com/emails/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text ?? stripHtml(params.html),
      reply_to: params.reply_to,
    }),
  });

  const txt = await res.text();
  if (!res.ok) throw new Error(`Resend API failed: ${res.status} ${txt}`);
  const json = JSON.parse(txt) as any;
  return { message_id: String(json?.id ?? ""), raw: json };
}

export async function callTwilioWhatsAppApi(params: z.infer<typeof CallTwilioWhatsAppInput>) {
  const accountSid = requiredEnv("TWILIO_ACCOUNT_SID");
  const authToken = requiredEnv("TWILIO_AUTH_TOKEN");
  const from = params.from_whatsapp ?? requiredEnv("TWILIO_WHATSAPP_FROM");
  const to = params.to_e164.startsWith("whatsapp:") ? params.to_e164 : `whatsapp:${params.to_e164}`;

  const body = new URLSearchParams();
  body.set("From", from);
  body.set("To", to);
  body.set("Body", params.body);

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const txt = await res.text();
  if (!res.ok) throw new Error(`Twilio API failed: ${res.status} ${txt}`);
  const json = JSON.parse(txt) as any;
  return { message_sid: String(json?.sid ?? ""), status: String(json?.status ?? ""), raw: json };
}

async function main() {
  await ensureDataDir();

  const server = new Server(
    { name: "delivery-coordinator", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "generate-email-template",
          description:
            "Generate a professional HTML email for delivering a report (includes greeting, 2–3 sentence summary, video link, PDF link, and consultation CTA).",
          inputSchema: GenerateEmailTemplateInput,
        },
        {
          name: "deliver-report",
          description:
            "End-to-end delivery: generate email HTML, send via Resend (retry up to 3x), send WhatsApp via Twilio (no retry), log results, update reports table, and notify internal webhook.",
          inputSchema: DeliverReportInput,
        },
        {
          name: "call-resend-api",
          description: "Send an email via Resend API.",
          inputSchema: CallResendApiInput,
        },
        {
          name: "call-twilio-whatsapp-api",
          description: "Send a WhatsApp message via Twilio REST API.",
          inputSchema: CallTwilioWhatsAppInput,
        },
        {
          name: "log-delivery",
          description: "Log email + WhatsApp delivery attempts to data/delivery-logs.json.",
          inputSchema: LogDeliveryInput,
        },
        {
          name: "track-opens",
          description: "Record an email open event for a delivery_id.",
          inputSchema: TrackOpensInput,
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req: any) => {
    const { name, arguments: args } = req.params ?? {};

    if (name === "generate-email-template") {
      const parsed = GenerateEmailTemplateInput.parse(args);
      const deliveryId =
        parsed.delivery_id ??
        `del_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

      const summary =
        parsed.report_summary_override ?? computeSummaryFromReportJson(parsed.report_json);

      const appUrl = optionalEnv("NEXT_PUBLIC_APP_URL");
      const trackingPixelUrl = appUrl
        ? `${appUrl.replace(/\/$/, "")}/api/track-open?delivery_id=${encodeURIComponent(deliveryId)}`
        : null;

      const healthTotal = getHealthScore(parsed.report_json);
      const revenueTeaser = getRevenueTeaser(parsed.report_json);
      const html = renderEmailHtml({
        client_name: parsed.client_name,
        report_summary: summary,
        health_score_total: healthTotal,
        revenue_teaser: revenueTeaser,
        video_url: parsed.video_url,
        pdf_url: parsed.pdf_url,
        consultation_url: parsed.consultation_url,
        tracking_pixel_url: trackingPixelUrl,
      });

      const out = {
        delivery_id: deliveryId,
        subject: `Your personalized VantageStack report for ${parsed.client_name} is ready`,
        html,
        tracking_pixel_url: trackingPixelUrl,
        report_summary: summary,
        health_score_total: healthTotal,
        revenue_teaser: revenueTeaser,
      };

      // Create a starter record (so opens can be captured even before send is logged).
      await upsertDelivery({
        id: deliveryId,
        created_at: new Date().toISOString(),
        client_name: parsed.client_name,
        client_email: parsed.client_email ?? null,
        client_phone: null,
        video_url: parsed.video_url,
        pdf_url: parsed.pdf_url,
        consultation_url: parsed.consultation_url,
        report_summary: summary,
        resend: null,
        whatsapp: null,
        opens: [],
      });

      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
    }

    if (name === "deliver-report") {
      const parsed = DeliverReportInput.parse(args);
      const deliveryId =
        parsed.delivery_id ??
        `del_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

      const appUrl = optionalEnv("NEXT_PUBLIC_APP_URL");
      const trackingPixelUrl = appUrl
        ? `${appUrl.replace(/\/$/, "")}/api/track-open?delivery_id=${encodeURIComponent(deliveryId)}`
        : null;

      const summary = computeSummaryFromReportJson(parsed.report_json);
      const healthTotal = getHealthScore(parsed.report_json);
      const revenueTeaser = getRevenueTeaser(parsed.report_json);
      const html = renderEmailHtml({
        client_name: parsed.client_name,
        report_summary: summary,
        health_score_total: healthTotal,
        revenue_teaser: revenueTeaser,
        video_url: parsed.video_url,
        pdf_url: parsed.pdf_url,
        consultation_url: parsed.consultation_url,
        tracking_pixel_url: trackingPixelUrl,
      });

      const subject = `Your personalized VantageStack report for ${parsed.client_name} is ready`;

      await upsertDelivery({
        id: deliveryId,
        created_at: new Date().toISOString(),
        client_name: parsed.client_name,
        client_email: parsed.client_email,
        client_phone: parsed.client_whatsapp_e164,
        video_url: parsed.video_url,
        pdf_url: parsed.pdf_url,
        consultation_url: parsed.consultation_url,
        report_summary: summary,
        resend: null,
        whatsapp: null,
        opens: [],
      });

      // Email: retry up to 3 times with 10s delay
      let emailAttempt = 0;
      let resendMessageId: string | null = null;
      let resendError: string | null = null;
      let emailSent = false;
      while (emailAttempt < 3 && !emailSent) {
        emailAttempt++;
        try {
          const out = await callResendApi({
            to: parsed.client_email,
            from: "noreply@vantagestack.com",
            subject,
            html,
          });
          resendMessageId = out.message_id || null;
          resendError = null;
          emailSent = true;
        } catch (e: any) {
          resendError = String(e?.message ?? e);
          if (emailAttempt < 3) await sleep(10_000);
        }
      }

      const emailLog = {
        message_id: resendMessageId,
        to: parsed.client_email,
        subject,
        status: emailSent ? "sent" : "error",
        error: emailSent ? null : resendError,
        sent_at: new Date().toISOString(),
      } as const;

      // WhatsApp: no retry; log failure if it happens
      const waBody = `Hey ${parsed.client_name}, your personalized report from VantageStack is ready. Check your email to watch your video and see your opportunities.`;
      let waSent = false;
      let waSid: string | null = null;
      let waError: string | null = null;
      let waFrom = optionalEnv("TWILIO_WHATSAPP_FROM") ?? "whatsapp:unknown";
      try {
        const out = await callTwilioWhatsAppApi({
          to_e164: parsed.client_whatsapp_e164,
          body: waBody,
        });
        waSid = out.message_sid || null;
        waSent = true;
      } catch (e: any) {
        waError = String(e?.message ?? e);
      }

      const waLog = {
        message_sid: waSid,
        to: parsed.client_whatsapp_e164.startsWith("whatsapp:")
          ? parsed.client_whatsapp_e164
          : `whatsapp:${parsed.client_whatsapp_e164}`,
        from: waFrom,
        status: waSent ? "sent" : "error",
        error: waSent ? null : waError,
        sent_at: new Date().toISOString(),
      } as const;

      const saved = await upsertDelivery({
        id: deliveryId,
        resend: emailLog as any,
        whatsapp: waLog as any,
      });

      // DB update: only after both successful
      const deliveryComplete = emailSent && waSent;
      let reportsUpdate: any = { ok: false, skipped: true, reason: "No report_id provided." };
      if (parsed.report_id) {
        const sentAtIso = new Date().toISOString();
        reportsUpdate = await updateReportsTable({
          report_id: parsed.report_id,
          sent_at_iso: sentAtIso,
          delivery_complete: deliveryComplete,
        });

        // Proposal/deal wiring + client activity signal.
        // "Report sent" (email success) => create a deals row with proposal_status='sent'
        // and bump clients.last_active_at.
        if (emailSent) {
          const pgUrl = (process.env.DELIVERY_PG_URL || process.env.WEEKLY_PG_URL || process.env.BRIEFING_PG_URL || "").trim();
          const table = (process.env.DELIVERY_REPORTS_TABLE || "reports").trim();

          // Only allow safe identifiers (match updateReportsTable behavior).
          if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table) && pgUrl) {
            const db = postgres(pgUrl, { max: 3, prepare: false });
            try {
              const revenueUsd = getRevenueUsdEstimate(parsed.report_json ?? null);
              const dealValue = revenueUsd ?? 0;
              const serviceType = "website build";
              const notes = `Created from deliver-report (${deliveryComplete ? "delivered" : "email_sent_only"}).`;

              // Insert deals row if we can resolve client_id from the reports row.
              const reportRows = await db.unsafe(
                `select client_id::text as client_id from ${table} where id = $1::uuid limit 1`,
                [parsed.report_id],
              );
              const clientId = reportRows?.[0]?.client_id;

              if (clientId) {
                // De-dupe: don't create a second identical "sent" deal for the same client at the same sent_at timestamp.
                await db.unsafe(
                  `
                  with rep as (
                    select $1::uuid as client_uuid
                  )
                  insert into public.deals (client_id, proposal_status, deal_value, service_type, sent_at, created_at, notes)
                  select
                    rep.client_uuid,
                    'sent',
                    $2::int,
                    $3::text,
                    $4::timestamptz,
                    now(),
                    $5::text
                  from rep
                  where not exists (
                    select 1 from public.deals d
                    where d.client_id = rep.client_uuid
                      and d.proposal_status = 'sent'
                      and d.sent_at = $4::timestamptz
                  )
                  `,
                  [clientId, dealValue, serviceType, sentAtIso, notes],
                );

                await db.unsafe(`update public.clients set last_active_at = $1::timestamptz where id = $2::uuid`, [sentAtIso, clientId]);
              }
            } finally {
              await db.end({ timeout: 5 });
            }
          }
        }
      }

      // Webhook (best-effort; if it fails we still return delivery results)
      let webhook: any = null;
      try {
        webhook = await notifyInternalWebhook({
          event: "report.delivered",
          delivery_id: deliveryId,
          report_id: parsed.report_id ?? null,
          client_name: parsed.client_name,
          client_email: parsed.client_email,
          client_whatsapp: parsed.client_whatsapp_e164,
          email: emailLog,
          whatsapp: waLog,
          delivery_complete: deliveryComplete,
          created_at: saved.created_at,
        });
      } catch (e: any) {
        webhook = { ok: false, error: String(e?.message ?? e) };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ok: deliveryComplete,
                delivery_id: deliveryId,
                email: emailLog,
                whatsapp: waLog,
                delivery_complete: deliveryComplete,
                reports_update: reportsUpdate,
                webhook,
                tracking_pixel_url: trackingPixelUrl,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (name === "call-resend-api") {
      const parsed = CallResendApiInput.parse(args);
      const out = await callResendApi(parsed);
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
    }

    if (name === "call-twilio-whatsapp-api") {
      const parsed = CallTwilioWhatsAppInput.parse(args);
      const out = await callTwilioWhatsAppApi(parsed);
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
    }

    if (name === "log-delivery") {
      const parsed = LogDeliveryInput.parse(args);
      const current = await getDelivery(parsed.delivery_id);

      const record: DeliveryRecord = {
        id: parsed.delivery_id,
        created_at: current?.created_at ?? new Date().toISOString(),
        client_name: parsed.client_name,
        client_email: parsed.client_email ?? current?.client_email ?? null,
        client_phone: parsed.client_phone ?? current?.client_phone ?? null,
        video_url: parsed.video_url ?? current?.video_url ?? null,
        pdf_url: parsed.pdf_url ?? current?.pdf_url ?? null,
        consultation_url: parsed.consultation_url ?? current?.consultation_url ?? null,
        report_summary: parsed.report_summary ?? current?.report_summary ?? null,
        resend: (parsed.resend ?? current?.resend ?? null) as any,
        whatsapp: (parsed.whatsapp ?? current?.whatsapp ?? null) as any,
        opens: current?.opens ?? [],
      };

      const saved = await upsertDelivery(record);
      return { content: [{ type: "text", text: JSON.stringify(saved, null, 2) }] };
    }

    if (name === "track-opens") {
      const parsed = TrackOpensInput.parse(args);
      const current = await getDelivery(parsed.delivery_id);
      const openedAt = parsed.opened_at ?? new Date().toISOString();
      const opens = (current?.opens ?? []).slice();
      opens.unshift({
        opened_at: openedAt,
        user_agent: parsed.user_agent ?? null,
        ip: parsed.ip ?? null,
      });

      const saved = await upsertDelivery({
        id: parsed.delivery_id,
        opens,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { delivery_id: parsed.delivery_id, opened_at: openedAt, opens_count: saved.opens.length },
              null,
              2
            ),
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  if (existsSync(join(repoRoot, "package.json"))) {
    // keep alive
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

