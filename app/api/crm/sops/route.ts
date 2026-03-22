import { NextResponse } from "next/server";
import postgres from "postgres";
import { SopProjectBriefSchema } from "../../../../lib/sop/schema";
import { ensureSopTables, getSopDbUrl, listSopProjectsCrm } from "../../../../lib/sop/db";
import { createSopFromBriefAndSyncToBackend } from "../../../../lib/sop/workflows";

async function withSopDb<T>(fn: (db: ReturnType<typeof postgres>) => Promise<T>): Promise<T> {
  const url = getSopDbUrl();
  if (!url) throw new Error("SOP database URL missing (set SOP_PG_URL, DATABASE_URL, or SUPABASE_DB_URL).");
  const db = postgres(url, { max: 2, prepare: false });
  try {
    await ensureSopTables(db);
    return await fn(db);
  } finally {
    await db.end({ timeout: 5 });
  }
}

export async function GET() {
  try {
    const projects = await withSopDb((db) => listSopProjectsCrm(db, 100));
    return NextResponse.json({ ok: true, projects });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const brief = SopProjectBriefSchema.parse(body);
    const out = await createSopFromBriefAndSyncToBackend(brief);
    return NextResponse.json({ ok: true, ...out });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = /zod|invalid/i.test(msg) ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
