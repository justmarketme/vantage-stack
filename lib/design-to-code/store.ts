import type { JSONValue, Sql } from "postgres";
import { ensureCrmSchema } from "../crm/db";
import type { DiscoverySnapshot } from "./types";
import { DEFAULT_REVIEW_CHECKLIST, type ReviewChecklistState } from "./review-checklist";

export type DesignToCodeRow = {
  client_id: string;
  design_brief: string | null;
  master_prompt: string | null;
  claude_last_response: string | null;
  generated_code_url: string | null;
  staging_url: string | null;
  production_url: string | null;
  github_branch: string | null;
  status: string;
  version: string;
  review_checklist: ReviewChecklistState;
  discovery_snapshot: DiscoverySnapshot;
  competitor_analysis: string | null;
  revision_notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function getDesignToCode(db: Sql, clientId: string): Promise<DesignToCodeRow | null> {
  await ensureCrmSchema(db);
  const rows = await db`
    select
      client_id::text,
      design_brief,
      master_prompt,
      claude_last_response,
      generated_code_url,
      staging_url,
      production_url,
      github_branch,
      status,
      version,
      review_checklist,
      discovery_snapshot,
      competitor_analysis,
      revision_notes,
      created_at::text,
      updated_at::text
    from public.client_design_to_code
    where client_id = ${clientId}::uuid
    limit 1
  `;
  const r = rows[0] as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    client_id: String(r.client_id),
    design_brief: (r.design_brief as string) ?? null,
    master_prompt: (r.master_prompt as string) ?? null,
    claude_last_response: (r.claude_last_response as string) ?? null,
    generated_code_url: (r.generated_code_url as string) ?? null,
    staging_url: (r.staging_url as string) ?? null,
    production_url: (r.production_url as string) ?? null,
    github_branch: (r.github_branch as string) ?? null,
    status: String(r.status ?? "draft"),
    version: String(r.version ?? "1.0"),
    review_checklist: {
      ...DEFAULT_REVIEW_CHECKLIST,
      ...(typeof r.review_checklist === "object" && r.review_checklist
        ? (r.review_checklist as ReviewChecklistState)
        : {}),
    },
    discovery_snapshot:
      typeof r.discovery_snapshot === "object" && r.discovery_snapshot
        ? (r.discovery_snapshot as DiscoverySnapshot)
        : {},
    competitor_analysis: (r.competitor_analysis as string) ?? null,
    revision_notes: (r.revision_notes as string) ?? null,
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

export async function upsertDesignToCode(
  db: Sql,
  clientId: string,
  patch: Partial<{
    design_brief: string | null;
    master_prompt: string | null;
    claude_last_response: string | null;
    generated_code_url: string | null;
    staging_url: string | null;
    production_url: string | null;
    github_branch: string | null;
    status: string;
    version: string;
    review_checklist: ReviewChecklistState;
    discovery_snapshot: DiscoverySnapshot;
    competitor_analysis: string | null;
    revision_notes: string | null;
  }>,
) {
  await ensureCrmSchema(db);
  const existing = await getDesignToCode(db, clientId);
  const pick = <T>(p: T | undefined, existing: T | null | undefined): T | null =>
    p !== undefined ? p : (existing ?? null);

  const next = {
    design_brief: pick(patch.design_brief, existing?.design_brief),
    master_prompt: pick(patch.master_prompt, existing?.master_prompt),
    claude_last_response: pick(patch.claude_last_response, existing?.claude_last_response),
    generated_code_url: pick(patch.generated_code_url, existing?.generated_code_url),
    staging_url: pick(patch.staging_url, existing?.staging_url),
    production_url: pick(patch.production_url, existing?.production_url),
    github_branch: pick(patch.github_branch, existing?.github_branch),
    status: patch.status ?? existing?.status ?? "draft",
    version: patch.version ?? existing?.version ?? "1.0",
    review_checklist: patch.review_checklist ?? existing?.review_checklist ?? { ...DEFAULT_REVIEW_CHECKLIST },
    discovery_snapshot: mergeDiscovery(existing?.discovery_snapshot ?? {}, patch.discovery_snapshot ?? {}),
    competitor_analysis: pick(patch.competitor_analysis, existing?.competitor_analysis),
    revision_notes: pick(patch.revision_notes, existing?.revision_notes),
  };

  await db`
    insert into public.client_design_to_code (
      client_id,
      design_brief,
      master_prompt,
      claude_last_response,
      generated_code_url,
      staging_url,
      production_url,
      github_branch,
      status,
      version,
      review_checklist,
      discovery_snapshot,
      competitor_analysis,
      revision_notes,
      updated_at
    ) values (
      ${clientId}::uuid,
      ${next.design_brief},
      ${next.master_prompt},
      ${next.claude_last_response},
      ${next.generated_code_url},
      ${next.staging_url},
      ${next.production_url},
      ${next.github_branch},
      ${next.status},
      ${next.version},
      ${db.json(next.review_checklist as JSONValue)},
      ${db.json(next.discovery_snapshot as JSONValue)},
      ${next.competitor_analysis},
      ${next.revision_notes},
      now()
    )
    on conflict (client_id) do update set
      design_brief = excluded.design_brief,
      master_prompt = excluded.master_prompt,
      claude_last_response = excluded.claude_last_response,
      generated_code_url = excluded.generated_code_url,
      staging_url = excluded.staging_url,
      production_url = excluded.production_url,
      github_branch = excluded.github_branch,
      status = excluded.status,
      version = excluded.version,
      review_checklist = excluded.review_checklist,
      discovery_snapshot = excluded.discovery_snapshot,
      competitor_analysis = excluded.competitor_analysis,
      revision_notes = excluded.revision_notes,
      updated_at = now()
  `;
}

function mergeDiscovery(a: DiscoverySnapshot, b: DiscoverySnapshot): DiscoverySnapshot {
  return { ...a, ...b };
}
