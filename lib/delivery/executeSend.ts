import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

function asObj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function appendLocalQueue(payload: Record<string, unknown>) {
  const root = process.cwd();
  const dataDir = join(root, "data");
  const path = join(dataDir, "delivery-send-queue.json");
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

/** Forward payload to Agent 5 (delivery webhook) or local queue — same behavior as POST /api/delivery/send. */
export async function executeDeliverySend(body: unknown): Promise<{
  ok: boolean;
  mode: "webhook" | "queue";
  error?: string;
  raw?: string;
  result?: unknown;
}> {
  const payload = asObj(body);
  const webhook = (process.env.DELIVERY_AGENT_WEBHOOK_URL || process.env.INTERNAL_DELIVERY_WEBHOOK_URL || "").trim();

  if (webhook) {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const raw = await res.text();
    if (!res.ok) {
      return { ok: false, mode: "webhook", error: `Delivery webhook failed: ${res.status}`, raw };
    }
    let parsed: unknown = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // keep raw
    }
    return { ok: true, mode: "webhook", result: parsed, raw };
  }

  await appendLocalQueue(payload);
  return {
    ok: true,
    mode: "queue",
    result: { queued: true, note: "Set DELIVERY_AGENT_WEBHOOK_URL to reach Agent 5 live." },
  };
}
