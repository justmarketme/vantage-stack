import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { withSeoDb, recentEvents } from "../../../../lib/seo-orchestrator/store";
import { buildDashboard } from "../../../../lib/seo-orchestrator/dashboard";

// ───────────────────────────────────────────────────────────────────────────
// SEO operation dashboard data feed for the CRM SEO Ops tab.
//
// PRIMARY: the DB-backed orchestrator (CW-004) — aggregated on read from
// Supabase. FALLBACK: Cowork's JSON files (SEO_DASHBOARD_DATA_DIR / the shared
// handoff folder), used only when the DB is unreachable, so the tab never
// hard-fails.
// ───────────────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATA_DIR =
  process.env.SEO_DASHBOARD_DATA_DIR?.trim() ||
  path.join(process.cwd(), "cowork-handoff", "crm_dashboard_data");

async function readJson(file: string): Promise<{ data: unknown; error: string | null }> {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, file), "utf8");
    return { data: JSON.parse(raw), error: null };
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return { data: null, error: "missing" };
    return { data: null, error: (e as Error)?.message ?? "read_error" };
  }
}

export async function GET() {
  // Primary: DB-backed engine.
  try {
    const dbOut = await withSeoDb(async (db) => ({
      dashboard: await buildDashboard(db),
      events: await recentEvents(db, 20),
    }));
    if (dbOut && dbOut.dashboard) {
      return NextResponse.json({
        ok: true,
        source: "db",
        dashboard: dbOut.dashboard,
        dashboard_error: null,
        events: dbOut.events,
        events_error: null,
      });
    }
  } catch {
    /* DB unavailable — fall back to Cowork's JSON files */
  }

  const [dash, events] = await Promise.all([
    readJson("dashboard_template.json"),
    readJson("task_events.json"),
  ]);
  const dashboard =
    dash.data && typeof dash.data === "object" && "dashboard" in (dash.data as object)
      ? (dash.data as { dashboard: unknown }).dashboard
      : null;

  return NextResponse.json({
    ok: true,
    source: DATA_DIR,
    dashboard,
    dashboard_error: dash.error,
    events: Array.isArray(events.data) ? events.data : [],
    events_error: events.error,
  });
}
