import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/clinic-crm/auth/session";
import { clinicDb } from "@/lib/clinic-crm/db";
import { StateKey, StateValue } from "@/lib/clinic-crm/types";
import { apiError, noStore, notFound, route, validate } from "@/lib/clinic-crm/server/http";
import { getState, putState } from "@/lib/clinic-crm/server/repo/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { key: string };

async function keyParam(ctx: { params: Promise<P> }): Promise<string | null> {
  const { key } = await ctx.params;
  return StateKey.safeParse(key).success ? key : null;
}

/** Returns the stored JSON value, or `null` (200) when nothing is stored for this key yet. */
export const GET = route<P>("state.get", async (req: NextRequest, ctx) => {
  const s = await requireSession(req);
  if (s instanceof NextResponse) return s;
  const key = await keyParam(ctx);
  if (!key) return notFound();
  const sql = await clinicDb();
  return NextResponse.json(await getState(sql, s.clinicId, s.staffId, key), noStore);
});

export const PUT = route<P>("state.put", async (req: NextRequest, ctx) => {
  const s = await requireSession(req);
  if (s instanceof NextResponse) return s;
  const key = await keyParam(ctx);
  if (!key) return notFound();
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return apiError(400, "Request body must be JSON");
  }
  const v = validate(StateValue, json);
  if (!v.ok) return v.res;
  const sql = await clinicDb();
  await putState(sql, s.clinicId, s.staffId, key, json);
  return NextResponse.json(json);
});
