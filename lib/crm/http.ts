import { NextResponse } from "next/server";
import { connectCrmDb, ensureCrmSchema } from "./db";
import type { Sql } from "postgres";

export async function withCrmHandler(handler: (db: Sql) => Promise<Response>): Promise<Response> {
  let db: Sql | null;
  try {
    db = await connectCrmDb();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 503 });
  }
  if (!db) {
    return NextResponse.json({ ok: false, error: "Missing DATABASE_URL (or compatible PG URL)." }, { status: 500 });
  }
  try {
    await ensureCrmSchema(db);
    return await handler(db);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    await db.end({ timeout: 5 });
  }
}
