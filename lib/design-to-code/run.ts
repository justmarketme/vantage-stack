import type { Sql } from "postgres";
import { getClientDetail } from "../crm/service";
import { aggregateFromClientDetail } from "./aggregate";
import { buildDesignBriefMarkdown } from "./generate-brief";
import { buildMasterPrompt } from "./master-prompt";
import { buildReviewChecklistMarkdown, DEFAULT_REVIEW_CHECKLIST } from "./review-checklist";
import { getDesignToCode, upsertDesignToCode } from "./store";
import type { DiscoverySnapshot } from "./types";

export async function runGenerateDesignBrief(
  db: Sql,
  clientId: string,
  opts: { discovery?: DiscoverySnapshot; competitor_analysis?: string },
) {
  const detail = await getClientDetail(db, clientId);
  if (!detail.ok) return { ok: false as const, error: "not_found" as const };

  const existing = await getDesignToCode(db, clientId);
  const discovery: DiscoverySnapshot = {
    ...(existing?.discovery_snapshot ?? {}),
    ...(opts.discovery ?? {}),
  };
  const competitorExtra =
    opts.competitor_analysis?.trim() || existing?.competitor_analysis?.trim() || "";

  const profile = detail.profile as Record<string, unknown>;
  const notes = (detail.notes ?? []) as { body?: string }[];
  const ctx = aggregateFromClientDetail(
    clientId,
    profile,
    notes,
    discovery,
    competitorExtra,
    typeof detail.health_score === "number" ? detail.health_score : null,
  );

  const design_brief = buildDesignBriefMarkdown(ctx);
  const master_prompt = buildMasterPrompt(design_brief, ctx);
  const review_md = buildReviewChecklistMarkdown(ctx.company || ctx.clientName);

  await upsertDesignToCode(db, clientId, {
    design_brief,
    master_prompt,
    status: "brief-generated",
    discovery_snapshot: discovery,
    competitor_analysis: competitorExtra || null,
    review_checklist: existing?.review_checklist ?? { ...DEFAULT_REVIEW_CHECKLIST },
  });

  return {
    ok: true as const,
    design_brief,
    master_prompt,
    review_checklist_markdown: review_md,
    status: "brief-generated",
  };
}
