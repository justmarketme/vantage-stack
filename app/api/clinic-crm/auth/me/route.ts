import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "../../../../../lib/clinic-crm/auth/session";
import type { Session } from "../../../../../lib/clinic-crm/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const s = await requireSession(req);
  if (s instanceof NextResponse) return s;
  return NextResponse.json<Session>(s, { headers: { "Cache-Control": "no-store" } });
}
