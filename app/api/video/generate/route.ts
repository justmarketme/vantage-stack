import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";
import { withApiMonitoring } from "../../../../lib/monitoring/api";
import { corsPreflight, withCors } from "../../../../lib/api/cors";

function asObj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function appendLocalQueue(payload: Record<string, unknown>) {
  const root = process.cwd();
  const dataDir = join(root, "data");
  const path = join(dataDir, "video-generate-queue.json");
  await mkdir(dataDir, { recursive: true });
  const existing = await readFile(path, "utf-8")
    .then((txt) => JSON.parse(txt) as unknown[])
    .catch(() => []);
  const next = [
    {
      id: randomUUID(),
      queued_at: new Date().toISOString(),
      payload,
    },
    ...existing,
  ].slice(0, 1000);
  await writeFile(path, JSON.stringify(next, null, 2) + "\n", "utf-8");
}

async function handler(req: Request) {
  const body = asObj(await req.json().catch(() => ({})));
  const webhook = (process.env.VIDEO_AGENT_WEBHOOK_URL || "").trim();

  if (webhook) {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    if (!res.ok) {
      return withCors(NextResponse.json({ ok: false, error: `Video webhook failed: ${res.status}`, raw }, { status: 502 }), req);
    }
    let parsed: unknown = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Keep raw text when response is not JSON.
    }
    return withCors(NextResponse.json({ ok: true, mode: "webhook", result: parsed }), req);
  }

  await appendLocalQueue(body);
  return withCors(
    NextResponse.json({
      ok: true,
      mode: "queue",
      queued: true,
      note: "Set VIDEO_AGENT_WEBHOOK_URL to process this endpoint with your video generator.",
    }),
    req,
  );
}

export const POST = withApiMonitoring({ route: "/api/video/generate", method: "POST", handler });

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}
