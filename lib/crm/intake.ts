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

function buildIntakeChallenges(payload: BlueprintSubmit): string[] {
  if (payload.challenges && payload.challenges.length > 0) return payload.challenges;
  const items: string[] = [];
  // Path A (LEADS)
  if (payload.enquiryVolume) items.push(`Enquiry volume: ${payload.enquiryVolume}`);
  if (payload.followUpMethod) items.push(`Follow-up method: ${payload.followUpMethod}`);
  if (payload.missedCallHandling) items.push(`Missed calls: ${payload.missedCallHandling}`);
  // Path B (PRESENCE)
  if (payload.currentWebsiteStatus) items.push(`Website status: ${payload.currentWebsiteStatus}`);
  if (payload.googleMapsStatus) items.push(`Google Maps presence: ${payload.googleMapsStatus}`);
  if (payload.websiteGoal?.length) items.push(`Website goal: ${payload.websiteGoal.join(", ")}`);
  if (payload.serveArea) items.push(`Serve area: ${payload.serveArea}`);
  // Path C (AUTOMATION)
  if (payload.biggestTimeWaste?.length) items.push(`Biggest time waste: ${payload.biggestTimeWaste.join(", ")}`);
  if (payload.teamSize) items.push(`Team size: ${payload.teamSize}`);
  // Path D (EXPLORE)
  if (payload.biggestFrustration) items.push(`Biggest frustration: ${payload.biggestFrustration}`);
  if (payload.packagePreference) items.push(`Package preference: ${payload.packagePreference}`);
  // Shared
  if (payload.clientAcquisition) items.push(`Client acquisition: ${payload.clientAcquisition}`);
  if (payload.existingCrmStatus) items.push(`Current CRM/system: ${payload.existingCrmStatus}`);
  return items;
}

/**
 * Single pipeline for blueprint + CRM manual intake: upsert client, optional research task, analytics event.
 */
export async function performClientIntake(db: Sql, payload: BlueprintSubmit, opts: PerformIntakeOptions) {
  await ensureCrmSchema(db);
  await ensureAnalyticsTables(db);

  const website_url = payload.websiteUrl ? normalizeWebsiteUrl(payload.websiteUrl) : "";
  const monthly_budget = payload.monthlyBudget ? parseMonthlyBudgetToInt(payload.monthlyBudget) : null;
  if (payload.monthlyBudget && monthly_budget === null) {
    return { ok: false as const, error: "invalid_budget", message: "Monthly budget must parse to a positive number." };
  }

  const derived_challenges = buildIntakeChallenges(payload);

  let status = "blueprint-submitted";
  if (opts.source === "crm_manual") {
    status = "manually-added";
  }
  if (opts.jumpToStatus) {
    status = opts.jumpToStatus;
  }

  // Business name now comes from the form (payload.company = businessName); opts.company is the CRM-manual path.
  const company = (payload.company ?? opts.company ?? "").trim() || null;
  const city = (payload.city ?? "").trim() || null;
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
      primary_intent, preferred_contact_time,
      social_instagram, social_tiktok, social_facebook, social_x, social_youtube,
      serve_area, team_size, biggest_frustration, package_preference, client_acquisition,
      sub_niche, industry_custom_description, industry_classified, previous_vendor_exp,
      website_exists, conversion_rate, speed_to_contact, site_conversion_status,
      hours_lost_per_week, urgency_timeline, primary_social_handle, avg_transaction_value,
      enquiry_volume, follow_up_method, missed_call_handling, google_maps_status, biggest_time_waste,
      website_goal, current_website_status, city
    ) values (
      ${payload.clientName},
      ${payload.email},
      ${payload.whatsapp},
      ${website_url || null},
      ${payload.industry},
      ${payload.revenueRange},
      ${derived_challenges.length ? derived_challenges : null}::jsonb,
      ${payload.competitors?.length ? payload.competitors : null}::jsonb,
      ${payload.currentMarketing || null},
      ${payload.toolsUsed?.length ? payload.toolsUsed : null}::jsonb,
      ${monthly_budget ?? null},
      ${payload.successGoals || null},
      ${status},
      ${company},
      ${createdBy || null},
      ${payload.packageIntent || null},
      ${payload.primaryIntent || null},
      ${payload.preferredContactTime || null},
      ${social_instagram},
      ${social_tiktok},
      ${social_facebook},
      ${social_x},
      ${social_youtube},
      ${payload.serveArea || null},
      ${payload.teamSize || null},
      ${payload.biggestFrustration || null},
      ${payload.packagePreference || null},
      ${payload.clientAcquisition || null},
      ${payload.subNiche || null},
      ${payload.industryCustomDescription || null},
      ${payload.industryClassified || null},
      ${payload.previousVendorExp?.length ? payload.previousVendorExp : null}::text[],
      ${payload.websiteExists || null},
      ${payload.conversionRate || null},
      ${payload.speedToContact || null},
      ${payload.siteConversionStatus || null},
      ${payload.hoursLostPerWeek || null},
      ${payload.urgencyTimeline || null},
      ${payload.primarySocialHandle || null},
      ${payload.avgTransactionValue || null},
      ${payload.enquiryVolume ?? null},
      ${payload.followUpMethod ?? null},
      ${payload.missedCallHandling ?? null},
      ${payload.googleMapsStatus ?? null},
      ${payload.biggestTimeWaste?.length ? payload.biggestTimeWaste : null}::text[],
      ${payload.websiteGoal?.length ? payload.websiteGoal : null}::text[],
      ${payload.currentWebsiteStatus ?? null},
      ${city}
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
      primary_intent = excluded.primary_intent,
      preferred_contact_time = excluded.preferred_contact_time,
      status = excluded.status,
      company = coalesce(excluded.company, public.clients.company),
      created_by = coalesce(public.clients.created_by, excluded.created_by),
      social_instagram = coalesce(excluded.social_instagram, public.clients.social_instagram),
      social_tiktok = coalesce(excluded.social_tiktok, public.clients.social_tiktok),
      social_facebook = coalesce(excluded.social_facebook, public.clients.social_facebook),
      social_x = coalesce(excluded.social_x, public.clients.social_x),
      social_youtube = coalesce(excluded.social_youtube, public.clients.social_youtube),
      serve_area = coalesce(excluded.serve_area, public.clients.serve_area),
      team_size = coalesce(excluded.team_size, public.clients.team_size),
      biggest_frustration = coalesce(excluded.biggest_frustration, public.clients.biggest_frustration),
      package_preference = coalesce(excluded.package_preference, public.clients.package_preference),
      client_acquisition = coalesce(excluded.client_acquisition, public.clients.client_acquisition),
      sub_niche = coalesce(excluded.sub_niche, public.clients.sub_niche),
      industry_custom_description = coalesce(excluded.industry_custom_description, public.clients.industry_custom_description),
      industry_classified = coalesce(excluded.industry_classified, public.clients.industry_classified),
      previous_vendor_exp = coalesce(excluded.previous_vendor_exp, public.clients.previous_vendor_exp),
      website_exists = coalesce(excluded.website_exists, public.clients.website_exists),
      conversion_rate = coalesce(excluded.conversion_rate, public.clients.conversion_rate),
      speed_to_contact = coalesce(excluded.speed_to_contact, public.clients.speed_to_contact),
      site_conversion_status = coalesce(excluded.site_conversion_status, public.clients.site_conversion_status),
      hours_lost_per_week = coalesce(excluded.hours_lost_per_week, public.clients.hours_lost_per_week),
      urgency_timeline = coalesce(excluded.urgency_timeline, public.clients.urgency_timeline),
      primary_social_handle = coalesce(excluded.primary_social_handle, public.clients.primary_social_handle),
      avg_transaction_value = coalesce(excluded.avg_transaction_value, public.clients.avg_transaction_value),
      enquiry_volume = coalesce(excluded.enquiry_volume, public.clients.enquiry_volume),
      follow_up_method = coalesce(excluded.follow_up_method, public.clients.follow_up_method),
      missed_call_handling = coalesce(excluded.missed_call_handling, public.clients.missed_call_handling),
      google_maps_status = coalesce(excluded.google_maps_status, public.clients.google_maps_status),
      biggest_time_waste = coalesce(excluded.biggest_time_waste, public.clients.biggest_time_waste),
      website_goal = coalesce(excluded.website_goal, public.clients.website_goal),
      current_website_status = coalesce(excluded.current_website_status, public.clients.current_website_status),
      city = coalesce(excluded.city, public.clients.city),
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
      monthly_budget: monthly_budget ?? null,
      success_goals: payload.successGoals,
      current_marketing: payload.currentMarketing,
      challenges: derived_challenges,
      competitors: payload.competitors,
      tools_used: payload.toolsUsed,
      revenue_range: payload.revenueRange,
      social_instagram: social_instagram,
      social_tiktok: social_tiktok,
      social_facebook: social_facebook,
      social_x: social_x,
      social_youtube: social_youtube,
      sub_niche: payload.subNiche || null,
      conversion_rate: payload.conversionRate || null,
      speed_to_contact: payload.speedToContact || null,
      urgency_timeline: payload.urgencyTimeline || null,
      serve_area: payload.serveArea || null,
      hours_lost_per_week: payload.hoursLostPerWeek || null,
      biggest_frustration: payload.biggestFrustration || null,
      previous_vendor_exp: payload.previousVendorExp || null,
      primary_intent: payload.primaryIntent || null,
      // Previously NEVER passed → the generator's LEADS/PRESENCE/EXPLORE sections,
      // benchmarks and ROI calculator were starved. Now wired end-to-end.
      enquiry_volume: payload.enquiryVolume || null,
      follow_up_method: payload.followUpMethod || null,
      missed_call_handling: payload.missedCallHandling || null,
      current_website_status: payload.currentWebsiteStatus || null,
      google_maps_status: payload.googleMapsStatus || null,
      website_goal: payload.websiteGoal || null,
      biggest_time_waste: payload.biggestTimeWaste || null,
      team_size: payload.teamSize || null,
      package_preference: payload.packagePreference || null,
      site_conversion_status: payload.siteConversionStatus || null,
      avg_transaction_value: payload.avgTransactionValue || null,
    });

    // Auto-generate design brief when client has no website (fire-and-forget)
    if (!payload.websiteUrl) {
      void (async () => {
        try {
          const { runGenerateDesignBrief } = await import("../design-to-code/run");
          await runGenerateDesignBrief(db, clientId, {});
        } catch {
          // silent — never block intake
        }
      })();
    }

    // Trigger automated WhatsApp follow-up if applicable
    if (payload.whatsapp) {
      await sendIntakeWhatsAppFollowUp({
        to: payload.whatsapp,
        name: payload.clientName,
        intent: payload.packageIntent,
        primaryIntent: payload.primaryIntent,
        challenge: derived_challenges?.[0],
      });
    }
  }

  return { ok: true as const, client_id: clientId, status };
}

async function sendIntakeWhatsAppFollowUp(params: {
  to: string;
  name: string;
  intent?: string;
  primaryIntent?: string;
  challenge?: string;
}) {
  const accountSid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = (process.env.TWILIO_WHATSAPP_FROM || "").trim();
  if (!accountSid || !authToken || !from) return;

  const to = params.to.startsWith("whatsapp:") ? params.to : `whatsapp:${params.to}`;

  const intentLabels: Record<string, string> = {
    leads: "I see you're looking to fix your lead flow.",
    followup: "I see you're looking to tighten up your follow-up process.",
    website: "I see you're working on your online presence.",
    automate: "I see you're looking to automate and save time.",
  };

  let contextText = "";
  if (params.primaryIntent && intentLabels[params.primaryIntent]) {
    contextText = intentLabels[params.primaryIntent];
  } else if (params.intent === "Foundation") {
    contextText = "I see you're looking at The Foundation.";
  } else if (params.intent === "Growth") {
    contextText = "I see you're looking at The Growth System.";
  } else if (params.intent === "Revenue") {
    contextText = "I see you're looking at The Revenue System.";
  }

  let painText = "";
  if (params.challenge && params.challenge !== "Not specified") {
    painText = ` You mentioned: ${params.challenge.toLowerCase()}.`;
  }

  const bodyText = `Hi ${params.name}, this is Jono from VantageStack. ${contextText}${painText} We're preparing your Growth Optimization Blueprint and will send it over shortly. Let me know if you have any immediate questions!`;

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
