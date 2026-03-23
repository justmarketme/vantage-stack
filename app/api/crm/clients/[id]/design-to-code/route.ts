import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiMonitoring } from "../../../../../../lib/monitoring/api";
import { withCrmHandler } from "../../../../../../lib/crm/http";
import {
  callClaudeMessages,
  getDesignToCode,
  planGithubClientBranch,
  planProductionDeploy,
  planStagingDeploy,
  revisionPromptBlock,
  runGenerateDesignBrief,
  slugifyClientName,
  upsertDesignToCode,
} from "../../../../../../lib/design-to-code";
import type { DiscoverySnapshot } from "../../../../../../lib/design-to-code/types";
import { getClientDetail } from "../../../../../../lib/crm/service";

const PostSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("generate"),
    discovery: z.record(z.unknown()).optional(),
    competitor_analysis: z.string().optional(),
  }),
  z.object({
    action: z.literal("call_claude"),
    system_prompt: z.string().optional(),
  }),
  z.object({
    action: z.literal("plan_deploy"),
    custom_domain: z.string().optional(),
  }),
  z.object({
    action: z.literal("revision_template"),
    request: z.string().min(1),
    context_snippet: z.string().min(1),
    client_name: z.string().optional(),
  }),
]);

const PatchSchema = z
  .object({
    generated_code_url: z.string().nullable().optional(),
    staging_url: z.string().nullable().optional(),
    production_url: z.string().nullable().optional(),
    github_branch: z.string().nullable().optional(),
    status: z.string().optional(),
    version: z.string().optional(),
    review_checklist: z.record(z.boolean()).optional(),
    revision_notes: z.string().nullable().optional(),
    competitor_analysis: z.string().nullable().optional(),
    claude_last_response: z.string().nullable().optional(),
  })
  .strict();

const DEFAULT_CLAUDE_SYSTEM = `You are a principal engineer. Follow the user's master prompt exactly. Produce production-quality Next.js App Router + TypeScript + Tailwind code: list new/changed files with paths, then full contents. Meet WCAG 2.1 AA and strong Core Web Vitals. No secrets in code.`;

async function getHandler(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withCrmHandler(async (db) => {
    const row = await getDesignToCode(db, id);
    if (!row) {
      return NextResponse.json({ ok: true, design_to_code: null });
    }
    return NextResponse.json({ ok: true, design_to_code: row });
  });
}

async function postHandler(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }

  return withCrmHandler(async (db) => {
    if (parsed.data.action === "generate") {
      const discovery = (parsed.data.discovery ?? {}) as DiscoverySnapshot;
      const out = await runGenerateDesignBrief(db, id, {
        discovery,
        competitor_analysis: parsed.data.competitor_analysis,
      });
      if (!out.ok) return NextResponse.json(out, { status: 404 });
      return NextResponse.json(out);
    }

    if (parsed.data.action === "call_claude") {
      const row = await getDesignToCode(db, id);
      if (!row?.master_prompt) {
        return NextResponse.json({ ok: false, error: "Run action generate first (no master_prompt stored)." }, { status: 400 });
      }
      const system = [DEFAULT_CLAUDE_SYSTEM, parsed.data.system_prompt?.trim()].filter(Boolean).join("\n\n");
      const claude = await callClaudeMessages(system, row.master_prompt);
      if (!claude.ok) {
        return NextResponse.json({ ok: false, error: claude.error }, { status: 502 });
      }
      await upsertDesignToCode(db, id, {
        claude_last_response: claude.text,
        status: "code-generated",
      });
      return NextResponse.json({
        ok: true,
        model: claude.model,
        stop_reason: claude.stopReason,
        claude_response: claude.text,
        status: "code-generated",
      });
    }

    if (parsed.data.action === "plan_deploy") {
      const slug = slugifyClientName(id);
      const gh = planGithubClientBranch(slug);
      const st = planStagingDeploy(slug);
      const pr = planProductionDeploy(slug, parsed.data.custom_domain);
      await upsertDesignToCode(db, id, {
        staging_url: st.staging_url,
        production_url: pr.production_url,
        github_branch: gh.suggested_branch,
        status: "awaiting-client-review",
      });
      return NextResponse.json({
        ok: true,
        github: gh,
        staging: st,
        production: pr,
        status: "awaiting-client-review",
      });
    }

    const det = await getClientDetail(db, id);
    const name =
      parsed.data.client_name?.trim() ||
      (det.ok ? String(det.profile.company || det.profile.name || "Client") : "Client");
    const text = revisionPromptBlock(name, parsed.data.request, parsed.data.context_snippet);
    return NextResponse.json({ ok: true, revision_prompt: text });
  });
}

async function patchHandler(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }

  return withCrmHandler(async (db) => {
    await upsertDesignToCode(db, id, parsed.data);
    const row = await getDesignToCode(db, id);
    return NextResponse.json({ ok: true, design_to_code: row });
  });
}

export const GET = withApiMonitoring({
  route: "/api/crm/clients/[id]/design-to-code",
  method: "GET",
  handler: getHandler,
});

export const POST = withApiMonitoring({
  route: "/api/crm/clients/[id]/design-to-code",
  method: "POST",
  handler: postHandler,
});

export const PATCH = withApiMonitoring({
  route: "/api/crm/clients/[id]/design-to-code",
  method: "PATCH",
  handler: patchHandler,
});
