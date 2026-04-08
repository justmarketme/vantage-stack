import { connectCrmDb } from "../crm/db";
import { countActiveSuperAdmins } from "../team/members";

/** Allow slow first connect (Supabase pooler auto-detect) + query. */
const SETUP_STATUS_MS = 25_000;

/** Same semantics as GET /api/admin/setup JSON body. */
export async function getAdminSetupApiPayload(): Promise<{
  ok: boolean;
  needs_setup: boolean;
  error?: string;
}> {
  let db: Awaited<ReturnType<typeof connectCrmDb>>;
  try {
    db = await connectCrmDb();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Database connection error";
    return { ok: false, needs_setup: false, error: msg };
  }
  if (!db) {
    return {
      ok: false,
      needs_setup: false,
      error: "No DATABASE_URL (or other CRM DB env) — add it to .env.local",
    };
  }
  try {
    const n = await Promise.race([
      countActiveSuperAdmins(db),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("Database check timed out — check DATABASE_URL and network")), SETUP_STATUS_MS),
      ),
    ]);
    return { ok: true, needs_setup: n === 0 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Database error";
    return { ok: false, needs_setup: false, error: msg };
  } finally {
    try {
      await db.end({ timeout: 5 });
    } catch {
      /* ignore */
    }
  }
}
