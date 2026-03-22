import type { Sql } from "postgres";
import type { BlueprintSubmit } from "../blueprint/schema";
import { normalizeWebsiteUrl, parseMonthlyBudgetToInt } from "../blueprint/schema";
import { ensureCrmSchema } from "./db";
import { ensureAnalyticsTables } from "../analytics/db";
import { trackClientEvent } from "../analytics/engine-v2";
import { logCrmActivity } from "./activity";

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

  const rows = await db<
    Array<{ id: string }>
  >`
    insert into public.clients (
      name, email, whatsapp, website_url, industry, revenue_range,
      challenges, competitors, current_marketing, tools_used, monthly_budget,
      success_goals, status, company, created_by
    ) values (
      ${payload.clientName},
      ${payload.email},
      ${payload.whatsapp},
      ${website_url || null},
      ${payload.industry},
      ${payload.revenueRange},
      ${payload.challenges as any}::jsonb,
      ${payload.competitors as any}::jsonb,
      ${payload.currentMarketing},
      ${payload.toolsUsed as any}::jsonb,
      ${monthly_budget},
      ${payload.successGoals},
      ${status},
      ${company},
      ${createdBy || null}
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
      status = excluded.status,
      company = coalesce(excluded.company, public.clients.company),
      created_by = coalesce(public.clients.created_by, excluded.created_by),
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

  return { ok: true as const, client_id: clientId, status };
}
