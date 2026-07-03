import type { Prospect, ProspectEngagement } from "./types";

function getWebhookUrl(): string {
  const url = (process.env.TEAMS_WEBHOOK_URL || "").trim();
  if (!url) throw new Error("Missing TEAMS_WEBHOOK_URL — add it to .env.local");
  return url;
}

async function sendTeamsCard(card: Record<string, unknown>): Promise<void> {
  const url = getWebhookUrl();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(card),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Teams webhook failed: ${res.status} ${text}`);
  }
}

function adaptiveCard(body: Record<string, unknown>[]): Record<string, unknown> {
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body,
        },
      },
    ],
  };
}

export async function sendHotLeadAlert(prospect: Prospect, engagement?: ProspectEngagement): Promise<void> {
  const card = adaptiveCard([
    {
      type: "TextBlock",
      text: "🔥 HOT LEAD ALERT",
      weight: "Bolder",
      size: "Large",
      color: "Attention",
    },
    {
      type: "FactSet",
      facts: [
        { title: "Name", value: prospect.name || "Unknown" },
        { title: "Business", value: prospect.business_name || "Unknown" },
        { title: "Platform", value: prospect.source_platform },
        { title: "Track", value: prospect.track.toUpperCase() },
        { title: "Confidence", value: `${prospect.confidence_flag.toUpperCase()} ${prospect.confidence_flag === "green" ? "✅" : prospect.confidence_flag === "yellow" ? "⚠️" : "🔴"}` },
        { title: "Pain Point", value: prospect.pain_point },
      ],
    },
    {
      type: "TextBlock",
      text: `**Source:** ${prospect.source_text.slice(0, 300)}${prospect.source_text.length > 300 ? "..." : ""}`,
      wrap: true,
    },
    ...(engagement?.response_text
      ? [
          {
            type: "TextBlock",
            text: `**Their reply:** ${engagement.response_text.slice(0, 500)}`,
            wrap: true,
            color: "Good",
          },
        ]
      : []),
    {
      type: "TextBlock",
      text: `⏱️ Target: follow up within 10 minutes`,
      weight: "Bolder",
      color: "Warning",
    },
    ...(prospect.source_url
      ? [
          {
            type: "ActionSet",
            actions: [
              { type: "Action.OpenUrl", title: "View Source Post", url: prospect.source_url },
              ...(prospect.contact_whatsapp
                ? [{ type: "Action.OpenUrl", title: "WhatsApp", url: `https://wa.me/${prospect.contact_whatsapp.replace(/\D/g, "")}` }]
                : []),
            ],
          },
        ]
      : []),
  ]);

  await sendTeamsCard(card);
}

export async function sendApprovalRequest(
  prospect: Prospect,
  engagement: ProspectEngagement,
): Promise<void> {
  const card = adaptiveCard([
    {
      type: "TextBlock",
      text: "📝 Reply Awaiting Approval",
      weight: "Bolder",
      size: "Medium",
    },
    {
      type: "FactSet",
      facts: [
        { title: "Prospect", value: `${prospect.name || "Unknown"} — ${prospect.business_name || ""}` },
        { title: "Platform", value: engagement.channel },
        { title: "Track", value: prospect.track.toUpperCase() },
      ],
    },
    {
      type: "TextBlock",
      text: "**Original post:**",
      weight: "Bolder",
    },
    {
      type: "TextBlock",
      text: prospect.source_text.slice(0, 400),
      wrap: true,
      isSubtle: true,
    },
    {
      type: "TextBlock",
      text: "**Drafted reply:**",
      weight: "Bolder",
    },
    {
      type: "TextBlock",
      text: engagement.message_text,
      wrap: true,
    },
    ...(engagement.cta_url
      ? [{ type: "TextBlock", text: `**CTA link:** ${engagement.cta_url}`, wrap: true }]
      : []),
    {
      type: "ActionSet",
      actions: [
        {
          type: "Action.OpenUrl",
          title: "✅ Approve & Post",
          url: `${process.env.NEXT_PUBLIC_APP_URL || ""}/api/prospecting/engagements/${engagement.id}/approve`,
        },
        ...(prospect.source_url
          ? [{ type: "Action.OpenUrl", title: "View Original", url: prospect.source_url }]
          : []),
      ],
    },
  ]);

  await sendTeamsCard(card);
}

export async function sendCycleDigest(stats: {
  run_id: string;
  channels_scanned: string[];
  signals_found: number;
  leads_created: number;
  drafts_created: number;
  hot_leads_flagged: number;
  duration_seconds: number;
}): Promise<void> {
  const card = adaptiveCard([
    {
      type: "TextBlock",
      text: "📊 Prospecting Cycle Complete",
      weight: "Bolder",
      size: "Medium",
    },
    {
      type: "FactSet",
      facts: [
        { title: "Channels", value: stats.channels_scanned.join(", ") },
        { title: "Signals Found", value: String(stats.signals_found) },
        { title: "New Leads", value: String(stats.leads_created) },
        { title: "Drafts Ready", value: String(stats.drafts_created) },
        { title: "Hot Leads", value: String(stats.hot_leads_flagged) },
        { title: "Duration", value: `${Math.round(stats.duration_seconds)}s` },
      ],
    },
    ...(stats.drafts_created > 0
      ? [
          {
            type: "ActionSet",
            actions: [
              {
                type: "Action.OpenUrl",
                title: `Review ${stats.drafts_created} Drafts`,
                url: `${process.env.NEXT_PUBLIC_APP_URL || ""}/api/prospecting/engagements?status=pending_approval`,
              },
            ],
          },
        ]
      : []),
  ]);

  await sendTeamsCard(card);
}

export async function sendDailyBrief(brief: {
  date: string;
  top_leads: { name: string; business: string; platform: string; pain: string; confidence: string }[];
  stats: { found: number; contacted: number; responded: number; booked: number };
  pending_approvals: number;
}): Promise<void> {
  const leadRows = brief.top_leads
    .slice(0, 10)
    .map(
      (l, i) =>
        `${i + 1}. **${l.name || "Unknown"}** (${l.business || "?"}) — ${l.platform} — ${l.pain} [${l.confidence.toUpperCase()}]`,
    )
    .join("\n\n");

  const card = adaptiveCard([
    {
      type: "TextBlock",
      text: `☀️ Daily Prospecting Brief — ${brief.date}`,
      weight: "Bolder",
      size: "Medium",
    },
    {
      type: "FactSet",
      facts: [
        { title: "Found (24h)", value: String(brief.stats.found) },
        { title: "Contacted", value: String(brief.stats.contacted) },
        { title: "Responded", value: String(brief.stats.responded) },
        { title: "Calls Booked", value: String(brief.stats.booked) },
        { title: "Pending Approvals", value: String(brief.pending_approvals) },
      ],
    },
    {
      type: "TextBlock",
      text: "**Top 10 Leads:**",
      weight: "Bolder",
    },
    {
      type: "TextBlock",
      text: leadRows || "No leads found in the last 24 hours.",
      wrap: true,
    },
    ...(brief.pending_approvals > 0
      ? [
          {
            type: "ActionSet",
            actions: [
              {
                type: "Action.OpenUrl",
                title: `Review ${brief.pending_approvals} Pending Approvals`,
                url: `${process.env.NEXT_PUBLIC_APP_URL || ""}/api/prospecting/engagements?status=pending_approval`,
              },
            ],
          },
        ]
      : []),
  ]);

  await sendTeamsCard(card);
}
