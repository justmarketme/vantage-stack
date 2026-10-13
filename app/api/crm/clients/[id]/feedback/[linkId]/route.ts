import { NextResponse } from "next/server";
import { z } from "zod";
import { withCrmHandler } from "@/lib/crm/http";
import { updateLinkBrand } from "@/lib/crm/proposal-feedback";
import { BrandOverride } from "@/lib/crm/feedback-brand-schema";

const PatchSchema = z.object({ brand: BrandOverride });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; linkId: string }> }) {
  const { id, linkId } = await ctx.params;
  const parsed = PatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  const brand = Object.fromEntries(Object.entries(parsed.data.brand).filter(([, v]) => v));
  return withCrmHandler(async (db) => {
    await updateLinkBrand(db, linkId, id, brand);
    return NextResponse.json({ ok: true });
  });
}
