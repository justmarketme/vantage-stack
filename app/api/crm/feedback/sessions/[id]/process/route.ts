import { NextResponse } from "next/server";
import { withCrmHandler } from "@/lib/crm/http";
import { processSession } from "@/lib/crm/proposal-feedback";

export const maxDuration = 300;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withCrmHandler(async (db) => NextResponse.json(await processSession(db, id)));
}
