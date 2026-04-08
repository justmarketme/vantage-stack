import { NextResponse } from "next/server";
import { withCrmHandler } from "../../../../lib/crm/http";
import { getPipeline } from "../../../../lib/crm/service";

export async function GET() {
  return withCrmHandler(async (db) => {
    const data = await getPipeline(db);
    return NextResponse.json({ ...data, ok: true });
  });
}
