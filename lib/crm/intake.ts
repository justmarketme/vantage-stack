import type { Sql } from "postgres";
import type { BlueprintSubmit } from "../blueprint/schema";
import { normalizeWebsiteUrl, parseMonthlyBudgetToInt } from "../blueprint/schema";
import { ensureCrmSchema } from "./db";
import { ensureAnalyticsTables } from "../analytics/db";
import { trackClientEvent } from "../analytics/engine-v2";
import { logCrmActivity } from "./activity";
import { generateAndSaveBlueprint } from "./blueprint-generator";

export type ClientIntakeSource = "blueprint_form" | "crm_manual";

export type PerformIntakeOptions = {
  source: ClientIntakeSource;
  /** CRM manual: who created the record */
  createdBy?: string;
  company?: string;
  /** Skip awaiting-research task */
  skipResearch?: boolean;
  /** Override initial pipeline status (e.g. jump to proposal) */
  jumpToStatus?: string;
};

function tomorrowIsoDate() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Single pipeline for blueprint + CRM manual intake: upsert client, optional research task, analytics event.
 */
export async function performClientIntake(db: Sql, payload: BlueprintSubmit, opts: PerformIntakeOptions) {
  await ensureCrmSchema(db);
  await ensureAnalyticsTables(db);

  const website_url = payload.websiteUrl ? normalizeWebsiteUrl(payload.websiteUrl) : "";
  const monthly_budget = parseMonthlyBudgetToInt(payload.monthlyBudget);
  if (!monthly_budget) {
    return { ok: false as const, error: "invalid_budget", message: "Monthly budget must parse to a positive number." };
  }

  let status = "blueprint-submitted";
  if (opts.source === "crm_manual") {
    status = "manually-added";
  }
  if (opts.jumpToStatus) {
    status = opts.jumpToStatus;
  }

  const company = (opts.company ?? "").trim() || null;
  const createdBy = opts.createdBy?.trim() || (opts.source === "crm_manual" ? "crm" : "");

  const social_instagram = (payload.socialInstagram || "").trim() || null;
  const social_tiktok = (payload.socialTiktok || "").trim() || null;
  const social_facebook = (payload.socialFacebook || "").trim() || null;
  const social_x = (payload.socialX || "").trim() || null;
  const social_youtube = (payload.socialYoutube || "").trim() || null;

  const rows = await db<
    Array<{ id: string }>
  >`
    insert into public.clients (
      name, email, whatsapp, website_url, industry, revenue_range,
      challenges, competitors, current_marketing, tools_used, monthly_budget,
      success_goals, status, company, created_by, package_intent,
      social_instagram, social_tiktok, social_facebook, social_x, social_youtube
    ) values (
      ${payload.clientName},
      ${payload.email},
      ${payload.whatsapp},
      ${website_url || null},
      ${payload.industry},
      ${payload.revenueRange},
      ${payload.challenges || null}::jsonb,
      ${payload.competitors || null}::jsonb,
      ${payload.currentMarketing},
      ${payload.toolsUsed || null}::jsonb,
      ${monthly_budget},
      ${payload.successGoals || null},
      ${status},
      ${company},
      ${createdBy || null},
      ${payload.packageIntent || null},
      ${social_instagram},
      ${social_tiktok},
      ${social_facebook},
      ${social_x},
      ${social_youtube}
    )
    on conflict (email) do update set
      name = excluded.name,
      whatsapp = excluded.whatsapp,
      website_url = excluded.website_url,
      industry = excluded.industry,
      revenue_range = excluded.revenue_range,
      challenges = excluded.challenges,
      competitors = excluded.competitors,
      current_marketing = excluded.current_marketing,
      tools_used = excluded.tools_used,
      monthly_budget = excluded.monthly_budget,
      success_goals = excluded.success_goals,
      package_intent = excluded.package_intent,
      status = excluded.status,
      company = coalesce(excluded.company, public.clients.company),
      created_by = coalesce(public.clients.created_by, excluded.created_by),
      social_instagram = coalesce(excluded.social_instagram, public.clients.social_instagram),
      social_tiktok = coalesce(excluded.social_tiktok, public.clients.social_tiktok),
      social_facebook = coalesce(excluded.social_facebook, public.clients.social_facebook),
      social_x = coalesce(excluded.social_x, public.clients.social_x),
      social_youtube = coalesce(excluded.social_youtube, public.clients.social_youtube),
      updated_at = now()
    returning id::text as id
  `;

  const clientId = rows?.[0]?.id ?? null;
  if (!clientId) return { ok: false as const, error: "insert_failed", message: "Could not upsert client." };

  const isEarlyStage = status === "blueprint-submitted" || status === "manually-added";
  const needsResearchTask = !opts.skipResearch && isEarlyStage;

  if (needsResearchTask) {
    const due = tomorrowIsoDate();
    await db`
      insert into public.tasks (client_id, task_type, status, due_date, notes, priority)
      select
        ${clientId}::uuid,
        'awaiting-research',
        'pending',
        ${due}::date,
        'Run research pipeline for new client intake',
        'high'
      where not exists (
        select 1 from public.tasks t
        where t.client_id = ${clientId}::uuid
          and t.task_type = 'awaiting-research'
          and coalesce(t.status, '') = 'pending'
      )
    `;
  }

  await trackClientEvent(db, {
    client_id: clientId,
    event_type: "blueprint_submitted",
    metadata: {
      source: opts.source,
      created_by: createdBy || undefined,
      skip_research: Boolean(opts.skipResearch),
      jump_to_status: opts.jumpToStatus,
    },
  });

  await logCrmActivity(db, {
    action_type: opts.source === "blueprint_form" ? "blueprint_intake" : "manual_client_intake",
    client_id: clientId,
    user_actor: createdBy || (opts.source === "blueprint_form" ? "public_form" : "crm"),
    details: { status, skip_research: Boolean(opts.skipResearch) },
  });

  // Auto-generate blueprint on intake so it's immediately visible in Blueprint Review
  if (status === "blueprint-submitted") {
    await generateAndSaveBlueprint(db, {
      id: clientId,
      name: payload.clientName,
      email: payload.email,
      company: company,
      industry: payload.industry,
      website_url: website_url || null,
      whatsapp: payload.whatsapp,
      monthly_budget: monthly_budget,
      success_goals: payload.successGoals,
      current_marketing: payload.currentMarketing,
      challenges: payload.challenges,
      competitors: payload.competitors,
      tools_used: payload.toolsUsed,
      revenue_range: payload.revenueRange,
      social_instagram: social_instagram,
      social_tiktok: social_tiktok,
      social_facebook: social_facebook,
      social_x: social_x,
      social_youtube: social_youtube,
    });
    
    // Trigger automated WhatsApp follow-up if applicable
    if (payload.whatsapp) {
      await sendIntakeWhatsAppFollowUp({
        to: payload.whatsapp,
        name: payload.clientName,
        intent: payload.packageIntent,
        challenge: payload.challenges?.[0],
      });
    }
  }

  return { ok: true as const, client_id: clientId, status };
}

async function sendIntakeWhatsAppFollowUp(params: { to: string; name: string; intent?: string; challenge?: string }) {
  const accountSid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = (process.env.TWILIO_WHATSAPP_FROM || "").trim();
  if (!accountSid || !authToken || !from) return; 

  const to = params.to.startsWith("whatsapp:") ? params.to : `whatsapp:${params.to}`;
  
  let packageText = "";
  if (params.intent === "Foundation") packageText = "I see you're looking at The Foundation.";
  else if (params.intent === "Growth") packageText = "I see you're looking at The Growth System.";
  else if (params.intent === "Revenue") packageText = "I see you're looking at The Revenue System.";
  
  let painText = "";
  if (params.challenge && params.challenge !== "Not specified") {
     painText = ` You mentioned struggling with ${params.challenge.toLowerCase()}.`;
  }
  
  const bodyText = `Hi ${params.name}, this is Jono from VantageStack. ${packageText}${painText} We're preparing your Growth Optimization Blueprint and will send it over shortly. Let me know if you have any immediate questions!`;
  
  const body = new URLSearchParams({ From: from, To: to, Body: bodyText });
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  try {
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (e) {
    console.error("Failed to send WhatsApp follow-up", e);
  }
}
