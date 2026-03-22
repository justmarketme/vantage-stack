import { NextResponse } from "next/server";
import { sendTelegramAlert } from "../../../../lib/scheduler-engine/telegram";
import { setUptimeCheckStatus } from "../../../../lib/monitoring/metrics";
import { withApiMonitoring } from "../../../../lib/monitoring/api";

type Incoming = {
  monitor_name?: string;
  service?: string;
  status?: string;
  message?: string;
};

function normalizeStatus(s: string | undefined) {
  const v = (s || "").toLowerCase().trim();
  if (["up", "ok", "healthy", "green"].includes(v)) return "green" as const;
  if (["degraded", "warn", "yellow"].includes(v)) return "yellow" as const;
  if (["down", "failed", "critical", "red"].includes(v)) return "red" as const;
  return "unknown" as const;
}

async function handler(req: Request) {
  let body: Incoming = {};
  try {
    body = (await req.json()) as Incoming;
  } catch {
    body = {};
  }

  const service = (body.service || body.monitor_name || "unknown-service").trim() || "unknown-service";
  const status = normalizeStatus(body.status);
  const details = (body.message || "").trim() || undefined;

  await setUptimeCheckStatus(service, status, details).catch(() => {});

  if (status === "red") {
    await sendTelegramAlert({ text: `🚩 Uptime DOWN: ${service}${details ? ` — ${details}` : ""}` }).catch(() => {});
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

export const POST = withApiMonitoring({ route: "/api/monitoring/uptime-webhook", method: "POST", handler });

