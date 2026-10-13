import { NextResponse } from "next/server";
import { z } from "zod";
import { withCrmHandler } from "@/lib/crm/http";
import { createFeedbackLink, listFeedbackForClient } from "@/lib/crm/proposal-feedback";
import { BrandOverride } from "@/lib/crm/feedback-brand-schema";

const CreateSchema = z.object({
  proposal_url: z.string().url().refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) link"),
  title: z.string().trim().min(1).max(140).optional(),
  brand: BrandOverride.optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withCrmHandler(async (db) => NextResponse.json({ ok: true, ...(await listFeedbackForClient(db, id)) }));
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = CreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  return withCrmHandler(async (db) => {
    const exists = await db`select 1 from public.clients where id = ${id}::uuid`;
    if (!exists.length) return NextResponse.json({ ok: false, error: "Client not found" }, { status: 404 });
    const brand = Object.fromEntries(Object.entries(parsed.data.brand ?? {}).filter(([, v]) => v));
    const link = await createFeedbackLink(db, {
      clientId: id,
      proposalUrl: parsed.data.proposal_url,
      title: parsed.data.title ?? "Proposal",
      createdBy: "crm_user",
      brandOverride: Object.keys(brand).length ? brand : null,
    });
    return NextResponse.json({ ok: true, link });
  });
}
