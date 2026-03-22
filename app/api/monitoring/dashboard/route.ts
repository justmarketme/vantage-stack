import { NextResponse } from "next/server";
import { getMonitoringSnapshot, computeUptimePercentageFromChecks } from "../../../../lib/monitoring/metrics";
import { withApiMonitoring } from "../../../../lib/monitoring/api";

function bucketStatusFromApi(points: Array<{ ms: number; ok: boolean }>) {
  if (!points.length) return { status: "unknown" as const, p95_ms: null as number | null, error_rate: null as number | null };

  const msSorted = points.map((p) => p.ms).sort((a, b) => a - b);
  const idx = Math.floor(msSorted.length * 0.95);
  const p95 = msSorted[Math.min(idx, msSorted.length - 1)];
  const errors = points.filter((p) => !p.ok).length;
  const errRate = errors / points.length;

  const status = errRate > 0.05 ? "red" : p95 > 10_000 ? "red" : p95 > 3_000 ? "yellow" : "green";
  return { status, p95_ms: p95, error_rate: Math.round(errRate * 1000) / 10 };
}

function analyzeApiEndpoints(
  points: Array<{ ts: string; route: string; method: string; ms: number; ok: boolean; status: number }>
) {
  const byKey = new Map<string, { route: string; method: string; ms: number[]; ok: boolean[]; statuses: number[] }>();

  for (const p of points) {
    const key = `${p.method} ${p.route}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { route: p.route, method: p.method, ms: [p.ms], ok: [p.ok], statuses: [p.status] });
    } else {
      existing.ms.push(p.ms);
      existing.ok.push(p.ok);
      existing.statuses.push(p.status);
    }
  }

  const out: Array<{
    route: string;
    method: string;
    avg_ms: number;
    p95_ms: number;
    error_rate: number;
    count: number;
    status: "green" | "yellow" | "red";
  }> = [];

  for (const v of byKey.values()) {
    const sorted = v.ms.slice().sort((a, b) => a - b);
    const p95 = sorted[Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1)] ?? 0;
    const avg = v.ms.reduce((a, b) => a + b, 0) / (v.ms.length || 1);
    const errors = v.ok.filter((x) => !x).length;
    const errRate = errors / (v.ok.length || 1);
    const status = errRate > 0.05 ? "red" : p95 > 10_000 ? "red" : p95 > 3_000 ? "yellow" : "green";

    out.push({
      route: v.route,
      method: v.method,
      avg_ms: Math.round(avg),
      p95_ms: Math.round(p95),
      error_rate: Math.round(errRate * 1000) / 10,
      count: v.ms.length,
      status,
    });
  }

  out.sort((a, b) => b.p95_ms - a.p95_ms);
  return out;
}

async function handler() {
  const snap = await getMonitoringSnapshot();
  const last1h = (snap.api.points ?? []).filter((p) => Date.now() - new Date(p.ts).getTime() < 60 * 60 * 1000);
  const apiAgg = bucketStatusFromApi(last1h);
  const apiEndpoints = analyzeApiEndpoints(last1h as any);
  const uptime = computeUptimePercentageFromChecks(snap, 24);

  return NextResponse.json({
    ok: true,
    updated_at: snap.updated_at,
    uptime,
    api: {
      ...apiAgg,
      recent_points: last1h.slice(0, 200),
    },
    api_endpoints: apiEndpoints.slice(0, 12),
    checks: snap.checks,
  });
}

export const GET = withApiMonitoring({ route: "/api/monitoring/dashboard", method: "GET", handler });

