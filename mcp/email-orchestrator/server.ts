#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { buildClientEmailHtml } from "../../lib/email/report-client-html";
import { consultationUrl, publicBaseUrl, validateRecipients } from "../../lib/crm/report-review";

const GenerateHtmlInput = z.object({
  body_plain: z.string().min(1),
  video_url: z.string().min(1),
  report_markdown: z.string(),
  client_name: z.string().min(1),
  consultation_url: z.string().url().optional(),
});

const ResendInput = z.object({
  to: z.array(z.string().email()).min(1),
  subject: z.string().min(1),
  html: z.string().min(1),
  from: z.string().email().optional(),
});

const TwilioInput = z.object({
  to_e164_or_whatsapp: z.string().min(8),
  body: z.string().min(1),
});

const ValidateRecipientsInput = z.object({
  primary: z.string(),
  additional: z.array(z.string()).default([]),
});

const server = new Server({ name: "email-orchestrator", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "build-review-page",
      description: "Returns CRM review page path and API endpoints for report delivery workflow.",
      inputSchema: zodToJsonSchema(z.object({ report_id: z.string().uuid() })),
    },
    {
      name: "generate-email-html",
      description: "Generate mobile-responsive HTML email with embedded <video>, report body, and consultation CTA.",
      inputSchema: zodToJsonSchema(GenerateHtmlInput),
    },
    {
      name: "send-via-resend",
      description: "Send email via Resend POST /emails/send.",
      inputSchema: zodToJsonSchema(ResendInput),
    },
    {
      name: "send-via-twilio",
      description: "Send WhatsApp message via Twilio Messages API.",
      inputSchema: zodToJsonSchema(TwilioInput),
    },
    {
      name: "generate-pdf",
      description: "Return instructions and path for server-side PDF (jspdf) download.",
      inputSchema: zodToJsonSchema(z.object({ report_id: z.string().uuid() })),
    },
    {
      name: "schedule-send",
      description: "Document scheduling: POST /api/crm/reports/:id/review/schedule and cron dispatcher URL.",
      inputSchema: zodToJsonSchema(z.object({ report_id: z.string().uuid(), scheduled_for_iso: z.string() })),
    },
    {
      name: "validate-recipients",
      description: "Validate primary + additional recipient emails.",
      inputSchema: zodToJsonSchema(ValidateRecipientsInput),
    },
    {
      name: "store-send-event",
      description: "Document public.events payload for report_sent audit events.",
      inputSchema: zodToJsonSchema(
        z.object({
          client_id: z.string().uuid(),
          report_id: z.string().uuid(),
          sent_via: z.array(z.enum(["email", "whatsapp", "pdf"])),
          sent_by: z.string(),
        }),
      ),
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = req.params.arguments ?? {};

  if (name === "build-review-page") {
    const { report_id } = z.object({ report_id: z.string().uuid() }).parse(args);
    const base = publicBaseUrl();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              review_ui_path: `/crm/reports/${report_id}/review`,
              api: {
                get_bundle: `${base}/api/crm/reports/${report_id}/review`,
                draft: `${base}/api/crm/reports/${report_id}/review/draft`,
                send: `${base}/api/crm/reports/${report_id}/review/send`,
                schedule: `${base}/api/crm/reports/${report_id}/review/schedule`,
                pdf: `${base}/api/crm/reports/${report_id}/pdf`,
              },
              public_share_pattern: `${base}/report/share/{share_token}`,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  if (name === "generate-email-html") {
    const p = GenerateHtmlInput.parse(args);
    const html = buildClientEmailHtml({
      bodyPlain: p.body_plain,
      videoUrl: p.video_url,
      reportMarkdown: p.report_markdown,
      consultationUrl: p.consultation_url ?? consultationUrl(),
      clientName: p.client_name,
    });
    return { content: [{ type: "text", text: JSON.stringify({ html_length: html.length, html }, null, 2) }] };
  }

  if (name === "send-via-resend") {
    const p = ResendInput.parse(args);
    const key = (process.env.RESEND_API_KEY || "").trim();
    if (!key) throw new Error("RESEND_API_KEY not set");
    const res = await fetch("https://api.resend.com/emails/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: p.from ?? "noreply@vantagestack.com",
        to: p.to,
        subject: p.subject,
        html: p.html,
      }),
    });
    const txt = await res.text();
    if (!res.ok) throw new Error(`Resend failed: ${res.status} ${txt.slice(0, 400)}`);
    return { content: [{ type: "text", text: txt }] };
  }

  if (name === "send-via-twilio") {
    const p = TwilioInput.parse(args);
    const accountSid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
    const authToken = (process.env.TWILIO_AUTH_TOKEN || "").trim();
    const from = (process.env.TWILIO_WHATSAPP_FROM || "").trim();
    if (!accountSid || !authToken || !from) throw new Error("Twilio env not configured");
    const to = p.to_e164_or_whatsapp.startsWith("whatsapp:") ? p.to_e164_or_whatsapp : `whatsapp:${p.to_e164_or_whatsapp}`;
    const body = new URLSearchParams({ From: from, To: to, Body: p.body });
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const txt = await res.text();
    if (!res.ok) throw new Error(`Twilio failed: ${res.status} ${txt.slice(0, 400)}`);
    return { content: [{ type: "text", text: txt }] };
  }

  if (name === "generate-pdf") {
    const { report_id } = z.object({ report_id: z.string().uuid() }).parse(args);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              download_url: `${publicBaseUrl()}/api/crm/reports/${report_id}/pdf`,
              implementation: "lib/crm/report-pdf.ts (jspdf)",
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  if (name === "schedule-send") {
    const { report_id, scheduled_for_iso } = z
      .object({ report_id: z.string().uuid(), scheduled_for_iso: z.string() })
      .parse(args);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              post_url: `${publicBaseUrl()}/api/crm/reports/${report_id}/review/schedule`,
              body_hint: { scheduled_for: scheduled_for_iso, client_id: "(uuid)", subject: "", body_text: "", recipients: {}, channels: {}, actor: "" },
              cron_dispatch: `${publicBaseUrl()}/api/cron/report-scheduled-send`,
              cron_remind_mode: `${publicBaseUrl()}/api/cron/report-scheduled-send?mode=remind`,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  if (name === "validate-recipients") {
    const p = ValidateRecipientsInput.parse(args);
    const out = validateRecipients({ primary: p.primary, additional: p.additional });
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "store-send-event") {
    const p = z
      .object({
        client_id: z.string().uuid(),
        report_id: z.string().uuid(),
        sent_via: z.array(z.enum(["email", "whatsapp", "pdf"])),
        sent_by: z.string(),
      })
      .parse(args);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              table: "public.events",
              insert: {
                client_id: p.client_id,
                event_type: "report_sent",
                metadata: { report_id: p.report_id, sent_via: p.sent_via, sent_by: p.sent_by },
              },
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
