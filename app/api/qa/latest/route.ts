import { NextResponse } from "next/server";
import { withApiMonitoring } from "../../../../lib/monitoring/api";
import { readFile } from "fs/promises";
import { join } from "path";

async function handler() {
  const path = join(process.cwd(), "data", "qa", "test-report.json");
  try {
    const txt = await readFile(path, "utf-8");
    const json = JSON.parse(txt);
    return NextResponse.json({ ok: true, report: json });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 404 });
  }
}

export const GET = withApiMonitoring({ route: "/api/qa/latest", method: "GET", handler });

