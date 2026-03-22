import { NextResponse } from "next/server";
import postgres from "postgres";
import { z } from "zod";
import {
  createSopVersionSuggestion,
  ensureSopTables,
  getFirstImplementedSopSnapshot,
  getMaxSopVersionNumber,
  getSopDbUrl,
  getSopProjectById,
  patchSopProjectCrm,
} from "../../../../../lib/sop/db";
import { resolveDiagramBundle, resolveSopSections, type SopSectionRow } from "../../../../../lib/sop/crm-resolve";

const PatchBodySchema = z.object({
  sections: z.array(z.object({ title: z.string(), markdown: z.string() })).optional(),
  diagram_bundle: z
    .object({
      systemOverview: z.string().optional(),
      agentFlow: z.string().optional(),
      databaseSchema: z.string().optional(),
      techStack: z.string().optional(),
      timeline: z.string().optional(),
    })
    .optional(),
  tech_stack: z.unknown().optional(),
  status: z.enum(["draft", "active"]).optional(),
  project_name: z.string().min(1).optional(),
  client_name: z.string().min(1).optional(),
  change_note: z.string().max(2000).optional(),
  edited_by: z.string().max(200).optional(),
});

async function withSopDb<T>(fn: (db: ReturnType<typeof postgres>) => Promise<T>): Promise<T> {
  const url = getSopDbUrl();
  if (!url) throw new Error("SOP database URL missing (set SOP_PG_URL, DATABASE_URL, or SUPABASE_DB_URL).");
  const db = postgres(url, { max: 2, prepare: false });
  try {
    await ensureSopTables(db);
    return await fn(db);
  } finally {
    await db.end({ timeout: 5 });
  }
}

type RouteCtx = { params: Promise<{ projectId: string }> };

export async function GET(_req: Request, ctx: RouteCtx) {
  try {
    const { projectId } = await ctx.params;
    const data = await withSopDb(async (db) => {
      const row = await getSopProjectById(db, projectId);
      if (!row) return null;
      const firstSnap = await getFirstImplementedSopSnapshot(db, projectId);
      const sections = resolveSopSections(row, firstSnap);
      const diagram_bundle = resolveDiagramBundle(row);
      return { project: row, sections, diagram_bundle };
    });
    if (!data) return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });
    return NextResponse.json({ ok: true, ...data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: RouteCtx) {
  try {
    const { projectId } = await ctx.params;
    const json = await req.json();
    const body = PatchBodySchema.parse(json);

    const hasChanges =
      body.sections !== undefined ||
      body.diagram_bundle !== undefined ||
      body.tech_stack !== undefined ||
      body.status !== undefined ||
      body.project_name !== undefined ||
      body.client_name !== undefined;

    if (!hasChanges) {
      return NextResponse.json({ ok: false, error: "No fields to update" }, { status: 400 });
    }

    const result = await withSopDb(async (db) => {
      const row = await getSopProjectById(db, projectId);
      if (!row) return { error: "not_found" as const };

      const before_snapshot = {
        sop_sections: row.sop_sections,
        diagram_bundle: row.diagram_bundle,
        tech_stack: row.tech_stack,
        project_name: row.project_name,
        client_name: row.client_name,
        status: row.status,
        sop_version: row.sop_version,
      };

      const currentDiagrams = resolveDiagramBundle(row) as Record<string, string>;
      let nextDiagramBundle: Record<string, string> | undefined;
      if (body.diagram_bundle !== undefined) {
        nextDiagramBundle = { ...currentDiagrams };
        for (const [k, v] of Object.entries(body.diagram_bundle)) {
          if (typeof v === "string") (nextDiagramBundle as Record<string, string>)[k] = v;
        }
      }

      const maxV = await getMaxSopVersionNumber(db, projectId);
      const nextV = Math.round((maxV + 0.01) * 100) / 100;

      const patchInput: Parameters<typeof patchSopProjectCrm>[2] = {
        sop_version: nextV,
      };

      if (body.tech_stack !== undefined) patchInput.tech_stack = body.tech_stack;
      if (body.status !== undefined) patchInput.status = body.status;
      if (body.project_name !== undefined) patchInput.project_name = body.project_name;
      if (body.client_name !== undefined) patchInput.client_name = body.client_name;
      if (body.sections !== undefined) patchInput.sop_sections = body.sections as SopSectionRow[];
      if (nextDiagramBundle !== undefined) patchInput.diagram_bundle = nextDiagramBundle;

      const updated = await patchSopProjectCrm(db, projectId, patchInput);
      if (!updated) return { error: "patch_failed" as const };

      const after_snapshot = {
        sop_sections: updated.sop_sections,
        diagram_bundle: updated.diagram_bundle,
        tech_stack: updated.tech_stack,
        project_name: updated.project_name,
        client_name: updated.client_name,
        status: updated.status,
        sop_version: updated.sop_version,
      };

      await createSopVersionSuggestion(db, {
        project_id: projectId,
        version_number: nextV,
        change_description: body.change_note?.trim() || "Updated via CRM",
        changed_by: body.edited_by?.trim() || "crm",
        which_pages_changed: ["crm_edit"],
        before_snapshot,
        after_snapshot,
        status: "implemented",
      });

      const firstSnap = await getFirstImplementedSopSnapshot(db, projectId);
      const sections = resolveSopSections(updated, firstSnap);
      const diagram_bundle = resolveDiagramBundle(updated);
      return { project: updated, sections, diagram_bundle };
    });

    if (result && "error" in result && result.error === "not_found") {
      return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });
    }
    if (result && "error" in result && result.error === "patch_failed") {
      return NextResponse.json({ ok: false, error: "Update failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, ...(result as object) });
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: e.flatten() }, { status: 400 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
