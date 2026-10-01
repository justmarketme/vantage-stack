import { NextResponse } from "next/server";
import { withCrmHandler } from "../../../../lib/crm/http";
import { getPipeline } from "../../../../lib/crm/service";

export async function GET(req: Request) {
  // Optional `?vertical=clinics` (or `none`) narrows the board to one vertical.
  const vertical = new URL(req.url).searchParams.get("vertical") ?? undefined;
  return withCrmHandler(async (db) => {
    const data = await getPipeline(db, { vertical });
    return NextResponse.json({ ...data, ok: true });
  });
}
