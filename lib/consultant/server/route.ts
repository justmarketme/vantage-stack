import { NextResponse } from "next/server";
import type { Sql } from "postgres";
import { requireConsultant, type ConsultantGuard, type ConsultantSession } from "../auth/session";
import { withConsultantDb } from "./http";

/** Next 15 dynamic-segment context. */
export type IdContext = { params: Promise<{ id: string }> };

/**
 * Every `/api/consultant/**` handler: session gate first (401/403 as ApiError; `opts.permission`
 * requires that exact permission, e.g. `confirm_payments`), then the DB
 * wrapper (schema ensured, one retry on a dropped pooler connection, generic errors).
 */
export async function consultantRoute(
  tag: string,
  opts: ConsultantGuard | undefined,
  fn: (s: ConsultantSession, db: Sql) => Promise<Response>,
): Promise<Response> {
  const s = await requireConsultant(opts);
  if (s instanceof NextResponse) return s;
  return withConsultantDb(tag, (db) => fn(s, db));
}
