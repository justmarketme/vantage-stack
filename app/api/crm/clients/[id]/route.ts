import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiMonitoring } from "../../../../../lib/monitoring/api";
import { withCrmHandler } from "../../../../../lib/crm/http";
import { getClientDetail } from "../../../../../lib/crm/service";
import { updateClientRecord } from "../../../../../lib/crm/client-update";
import { parseMonthlyBudgetToInt, splitListish } from "../../../../../lib/blueprint/schema";

const PatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    whatsapp: z.string().min(1).optional(),
    website_url: z.string().nullable().optional(),
    industry: z.string().min(1).optional(),
    revenue_range: z.string().min(1).optional(),
    challenges: z.union([z.array(z.string()), z.string()]).optional(),
    competitors: z.union([z.array(z.string()), z.string()]).optional(),
    current_marketing: z.string().min(1).optional(),
    tools_used: z.union([z.array(z.string()), z.string()]).optional(),
    monthly_budget: z.union([z.number().int().positive(), z.string()]).optional(),
    success_goals: z.string().min(1).optional(),
    company: z.string().nullable().optional(),
    status: z.string().min(1).optional(),
    next_action: z.string().nullable().optional(),
    assigned_to: z.string().nullable().optional(),
    changed_by: z.string().min(1).optional(),
  })
  .strict();

function normalizeList(v: string | string[] | undefined): unknown {
  if (v === undefined) return undefined;
  if (Array.isArray(v)) return v;
  return splitListish(v);
}

async function getHandler(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withCrmHandler(async (db) => {
    const out = await getClientDetail(db, id);
    if (!out.ok) return NextResponse.json(out, { status: 404 });
    return NextResponse.json(out);
  });
}

async function patchHandler(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }

  const actor = parsed.data.changed_by?.trim() || "crm_user";
  const { changed_by: _c, monthly_budget: mbRaw, ...rest } = parsed.data;

  let monthly_budget: number | undefined;
  if (mbRaw !== undefined) {
    if (typeof mbRaw === "number") monthly_budget = mbRaw;
    else {
      const n = parseMonthlyBudgetToInt(mbRaw);
      if (!n) {
        return NextResponse.json({ ok: false, error: "Invalid monthly_budget" }, { status: 400 });
      }
      monthly_budget = n;
    }
  }

  return withCrmHandler(async (db) => {
    try {
      const out = await updateClientRecord(db, id, {
        ...rest,
        challenges: normalizeList(parsed.data.challenges) as unknown,
        competitors: normalizeList(parsed.data.competitors) as unknown,
        tools_used: normalizeList(parsed.data.tools_used) as unknown,
        monthly_budget,
      }, actor);
      if (!out.ok) return NextResponse.json({ ok: false, error: out.error }, { status: 404 });
      return NextResponse.json({ ok: true, changes: out.changes });
    } catch (e: unknown) {
      const code = typeof e === "object" && e && "code" in e ? String((e as { code: string }).code) : "";
      if (code === "23505") {
        return NextResponse.json({ ok: false, error: "Email already in use." }, { status: 409 });
      }
      throw e;
    }
  });
}

export const GET = withApiMonitoring({ route: "/api/crm/clients/[id]", method: "GET", handler: getHandler });
export const PATCH = withApiMonitoring({ route: "/api/crm/clients/[id]", method: "PATCH", handler: patchHandler });
