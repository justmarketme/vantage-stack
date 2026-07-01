import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

// ───────────────────────────────────────────────────────────────────────────
// SEO operation dashboard data feed.
//
// Cowork WRITES the JSON (dashboard_template.json + task_events.json); this
// route only READS it and hands it to the CRM tab (COWORK_INTERFACE.md seam).
//
// Default location is the repo-relative shared handoff folder. On a dev machine
// you can point straight at the live SEO_Automation workspace by setting
// SEO_DASHBOARD_DATA_DIR. If the files aren't there yet, the tab shows a
// graceful "waiting for data" state rather than erroring.
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
