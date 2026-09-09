import { NextResponse } from "next/server";
import { connectProspectingDb } from "../../../../lib/prospecting/db";
import { startRun, finishRun, getLatestRun } from "../../../../lib/prospecting/service";

export async function GET() {
  const db = await connectProspectingDb();
  if (!db) return NextResponse.json({ ok: false, error: "No database" }, { status: 500 });

  const latest = await getLatestRun(db);
  return NextResponse.json({ ok: true, latest_run: latest });
}

export async function POST(req: Request) {
  const db = await connectProspectingDb();
  if (!db) return NextResponse.json({ ok: false, error: "No database" }, { status: 500 });

  const run = await startRun(db, "manual");

  return NextResponse.json({
    ok: true,
    run,
    message: "Manual prospecting run started. Use the browser extension to scan channels, then POST leads to /api/prospecting/prospects.",
  });
}
