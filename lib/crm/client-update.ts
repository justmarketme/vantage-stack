import type { Sql } from "postgres";
import { normalizeWebsiteUrl } from "../blueprint/schema";
import { ensureCrmSchema } from "./db";
import { logCrmActivity } from "./activity";
import { triggerResearchAgent } from "../weekly-scheduler/pipeline";

export type ClientPatch = {
  name?: string;
  email?: string;
  whatsapp?: string;
  website_url?: string | null;
  industry?: string;
  revenue_range?: string;
  challenges?: unknown;
  competitors?: unknown;
  current_marketing?: string;
  tools_used?: unknown;
  monthly_budget?: number;
  success_goals?: string;
  company?: string | null;
  status?: string;
  next_action?: string | null;
  assigned_to?: string | null;
};

function pickChanges(before: Record<string, unknown>, after: Record<string, unknown>, keys: string[]) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of keys) {
    const a = before[k];
    const b = after[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) changes[k] = { from: a, to: b };
  }
  return changes;
}

export async function updateClientRecord(
  db: Sql,
  clientId: string,
  patch: ClientPatch,
  actor: string,
): Promise<{ ok: true; changes: Record<string, { from: unknown; to: unknown }> } | { ok: false; error: string }> {
  await ensureCrmSchema(db);

  const existing = await db`
    select
      id::text,
      name::text,
      email::text,
      whatsapp::text,
      website_url::text,
      industry::text,
      revenue_range::text,
      challenges,
      competitors,
      current_marketing::text,
      tools_used,
      monthly_budget::int,
      success_goals::text,
      company::text,
      status::text,
      next_action::text,
      assigned_to::text
    from public.clients
    where id = ${clientId}::uuid
    limit 1
  `;
  const row = existing[0] as Record<string, unknown> | undefined;
  if (!row) return { ok: false, error: "not_found" };

  const prevStatus = String(row.status ?? "");
  const prevUrl = row.website_url ? String(row.website_url) : "";

  const next = { ...row };
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.email !== undefined) next.email = patch.email;
  if (patch.whatsapp !== undefined) next.whatsapp = patch.whatsapp;
  if (patch.website_url !== undefined) {
    const raw = patch.website_url;
    next.website_url = raw && String(raw).trim() ? normalizeWebsiteUrl(String(raw)) : null;
  }
  if (patch.industry !== undefined) next.industry = patch.industry;
  if (patch.revenue_range !== undefined) next.revenue_range = patch.revenue_range;
  if (patch.challenges !== undefined) next.challenges = patch.challenges;
  if (patch.competitors !== undefined) next.competitors = patch.competitors;
  if (patch.current_marketing !== undefined) next.current_marketing = patch.current_marketing;
  if (patch.tools_used !== undefined) next.tools_used = patch.tools_used;
  if (patch.monthly_budget !== undefined) next.monthly_budget = patch.monthly_budget;
  if (patch.success_goals !== undefined) next.success_goals = patch.success_goals;
  if (patch.company !== undefined) next.company = patch.company;
  if (patch.status !== undefined) next.status = patch.status;
  if (patch.next_action !== undefined) next.next_action = patch.next_action;
  if (patch.assigned_to !== undefined) next.assigned_to = patch.assigned_to;

  const keys = [
    "name",
    "email",
    "whatsapp",
    "website_url",
    "industry",
    "revenue_range",
    "challenges",
    "competitors",
    "current_marketing",
    "tools_used",
    "monthly_budget",
    "success_goals",
    "company",
    "status",
    "next_action",
    "assigned_to",
  ];
  const changes = pickChanges(row, next, keys);
  if (Object.keys(changes).length === 0) {
    return { ok: true, changes: {} };
  }

  const finalWebsite = next.website_url ? String(next.website_url) : null;

  await db`
    update public.clients set
      name = ${String(next.name)},
      email = ${String(next.email)},
      whatsapp = ${String(next.whatsapp)},
      website_url = ${finalWebsite},
      industry = ${String(next.industry)},
      revenue_range = ${String(next.revenue_range)},
      challenges = ${next.challenges as any}::jsonb,
      competitors = ${next.competitors as any}::jsonb,
      current_marketing = ${String(next.current_marketing)},
      tools_used = ${next.tools_used as any}::jsonb,
      monthly_budget = ${Number(next.monthly_budget)},
      success_goals = ${String(next.success_goals)},
      company = ${next.company ? String(next.company) : null},
      status = ${String(next.status)},
      next_action = ${next.next_action ? String(next.next_action) : null},
      assigned_to = ${next.assigned_to ? String(next.assigned_to) : null},
      updated_at = now()
    where id = ${clientId}::uuid
  `;

  await db`
    insert into public.client_audit_log (client_id, changed_by, changes)
    values (${clientId}::uuid, ${actor}, ${JSON.stringify(changes)}::jsonb)
  `;

  await logCrmActivity(db, {
    action_type: "client_updated",
    client_id: clientId,
    user_actor: actor,
    details: { fields: Object.keys(changes) },
  });

  const newUrl = finalWebsite ?? "";
  if (patch.website_url !== undefined && newUrl && newUrl !== prevUrl) {
    try {
      await triggerResearchAgent({
        id: clientId,
        name: String(next.name),
        email: String(next.email),
        website_url: newUrl,
        industry: String(next.industry),
      });
      await logCrmActivity(db, {
        action_type: "research_triggered",
        client_id: clientId,
        user_actor: actor,
        details: { reason: "website_url_changed" },
      });
    } catch (e) {
      await logCrmActivity(db, {
        action_type: "research_trigger_failed",
        client_id: clientId,
        user_actor: actor,
        details: { error: e instanceof Error ? e.message : String(e) },
      });
    }
  }

  const newStatus = String(next.status ?? "");
  if (patch.status !== undefined && newStatus === "active-client" && prevStatus !== "active-client") {
    await logCrmActivity(db, {
      action_type: "welcome_automation_requested",
      client_id: clientId,
      user_actor: actor,
      details: { note: "Hook delivery / email sequences from this event." },
    });
  }

  if (patch.status !== undefined && newStatus === "churned" && prevStatus !== "churned") {
    await logCrmActivity(db, {
      action_type: "client_churned",
      client_id: clientId,
      user_actor: actor,
      details: {},
    });
  }

  return { ok: true, changes };
}
