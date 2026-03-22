import { NextResponse } from "next/server";
import { withApiMonitoring } from "../../../../lib/monitoring/api";
import { runResearchBatch } from "../../../../lib/scheduler-engine/research-batch";
import { triggerResearchAgent } from "../../../../lib/weekly-scheduler/pipeline";
import { corsPreflight, withCors } from "../../../../lib/api/cors";

function asObj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function handler(req: Request) {
  const body = asObj(await req.json().catch(() => ({})));
  const client = asObj(body.client);
  const hasClient = Object.keys(client).length > 0;

  if (hasClient) {
    const out = await triggerResearchAgent(client);
    return withCors(NextResponse.json({ ok: true, mode: "single-client", result: out }), req);
  }

  const limitRaw = Number(body.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.round(limitRaw), 200) : 50;
  const out = await runResearchBatch({ limit });
  return withCors(NextResponse.json({ ok: true, mode: "batch", result: out }), req);
}

export const POST = withApiMonitoring({ route: "/api/research/trigger", method: "POST", handler });

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}
