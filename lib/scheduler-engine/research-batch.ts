import type { Sql } from "postgres";
import { connectSchedulerDb, closeSchedulerDb } from "./db";
import { triggerResearchAgent } from "../weekly-scheduler/pipeline";

export type ResearchBatchClient = {
  id: string;
  name: string;
  email?: string | null;
  whatsapp?: string | null;
  active?: boolean;
  metadata?: Record<string, unknown> | null;
};

function asClientRow(r: any): ResearchBatchClient | null {
  const id = r?.id != null ? String(r.id) : "";
  if (!id) return null;
  return {
    id,
    name: r?.name != null ? String(r.name) : id,
    email: r?.email != null ? (String(r.email) || null) : null,
    whatsapp: r?.whatsapp != null ? (String(r.whatsapp) || null) : null,
    active: r?.active != null ? Boolean(r.active) : true,
    metadata: (r?.metadata ?? null) as any,
  };
}

async function listClientsNeedingResearch(db: Sql, limit = 50): Promise<ResearchBatchClient[]> {
  // Repo truth: `report_generated` + `research_complete` live on `reports`.
  // We only trigger research when report is not generated AND research isn't complete yet.
  try {
    // Ensure required columns exist (safe in Postgres; uses best-effort in case the schema differs).
    await db.unsafe(`alter table reports add column if not exists research_complete boolean not null default false;`);
    await db.unsafe(`alter table reports add column if not exists report_generated boolean not null default false;`);

    // Preferred selector: join clients with reports, and build a metadata blob
    // expected by the research orchestrator.
    const rows = await db.unsafe(
      `
      select distinct
        c.id::text as id,
        c.name::text as name,
        nullif(c.email,'')::text as email,
        nullif(c.whatsapp,'')::text as whatsapp,
        (c.status = 'active-client')::boolean as active,
        jsonb_build_object(
          'websiteUrl', c.website_url,
          'industry', c.industry,
          'revenueRange', c.revenue_range,
          'competitors', c.competitors,
          'currentMarketing', c.current_marketing,
          'challenges', c.challenges,
          'toolsUsed', c.tools_used,
          'monthlyBudget', c.monthly_budget,
          'successGoals', c.success_goals,
          'status', c.status,
          'sub_niche', c.sub_niche,
          'conversion_rate', c.conversion_rate,
          'speed_to_contact', c.speed_to_contact,
          'urgency_timeline', c.urgency_timeline,
          'primary_social_handle', c.primary_social_handle,
          'previous_vendor_exp', c.previous_vendor_exp,
          'client_acquisition', c.client_acquisition,
          'primary_intent', c.primary_intent,
          'serve_area', c.serve_area,
          'team_size', c.team_size,
          'hours_lost_per_week', c.hours_lost_per_week
        ) as metadata
      from clients c
      join reports r on r.client_id = c.id
      where r.report_generated = false
        and coalesce(r.research_complete,false) = false
      order by c.name asc
      limit $1
    `,
      [limit],
    );
    return (rows ?? []).map(asClientRow).filter(Boolean) as ResearchBatchClient[];
  } catch {
    // Fallback: infer distinct clients from reports rows.
    // This is schema-light and best-effort; metadata may be missing.
    await db.unsafe(`
      alter table reports add column if not exists research_complete boolean not null default false;
    `);
    const rows = await db.unsafe(
      `
      select distinct
        coalesce(client_id,'')::text as id,
        coalesce(client_name,'')::text as name,
        null::text as email,
        null::text as whatsapp,
        true::boolean as active,
        null::jsonb as metadata
      from reports
      where report_generated = false
        and coalesce(research_complete,false) = false
        and client_id is not null
        and client_id <> ''
      order by client_id asc
      limit $1
    `,
      [limit],
    );
    return (rows ?? []).map(asClientRow).filter(Boolean) as ResearchBatchClient[];
  }
}

export async function runResearchBatch(params?: { limit?: number }) {
  const db = connectSchedulerDb();
  if (!db) throw new Error("Missing DB URL for scheduler (set SCHEDULER_PG_URL or REPORTS_PG_URL/BRIEFING_PG_URL/WEEKLY_PG_URL).");

  try {
    const clients = await listClientsNeedingResearch(db, params?.limit ?? 50);

    const per_client: Array<{ client_id: string; ok: boolean; error?: string }> = [];
    let okCount = 0;
    for (const c of clients) {
      try {
        // Agent 2 webhook is configured via RESEARCH_AGENT_WEBHOOK_URL in weekly-scheduler pipeline.
        await triggerResearchAgent({
          id: c.id,
          name: c.name,
          email: c.email ?? undefined,
          whatsapp: c.whatsapp ?? undefined,
          active: c.active ?? true,
          metadata: c.metadata ?? undefined,
        } as any);
        okCount += 1;
        per_client.push({ client_id: c.id, ok: true });
      } catch (e: any) {
        per_client.push({ client_id: c.id, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return {
      clients_total: clients.length,
      clients_success: okCount,
      clients_failed: clients.length - okCount,
      per_client,
    };
  } finally {
    await closeSchedulerDb(db);
  }
}

