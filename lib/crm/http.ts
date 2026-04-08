import { NextResponse } from "next/server";
import { connectCrmDb, ensureCrmSchema, resetSingletonPool } from "./db";
import type { Sql } from "postgres";

const CONNECTION_ERRORS = ["CONNECTION_ENDED", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "connection terminated"];

function isConnectionError(msg: string): boolean {
  return CONNECTION_ERRORS.some((e) => msg.includes(e));
}

export async function withCrmHandler(handler: (db: Sql) => Promise<Response>): Promise<Response> {
  // Attempt up to 2 times — once normally, once after resetting a dead pool
  for (let attempt = 1; attempt <= 2; attempt++) {
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
      // If the connection was dropped by the pooler, reset and retry once
      if (attempt === 1 && isConnectionError(msg)) {
        await resetSingletonPool();
        continue;
      }
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
    // Do NOT call db.end() — the pool is a singleton shared across all requests.
    // Calling end() destroys the pool and causes CONNECTION_ENDED on the next request.
  }
  return NextResponse.json({ ok: false, error: "Database connection failed after retry" }, { status: 503 });
}
