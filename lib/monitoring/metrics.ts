import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

export type ServiceStatus = "green" | "yellow" | "red" | "unknown";

export type ApiMetricPoint = {
  ts: string;
  route: string;
  method: string;
  ms: number;
  ok: boolean;
  status: number;
};

export type MonitoringSnapshot = {
  updated_at: string;
  api: {
    points: ApiMetricPoint[];
  };
  checks: {
    uptime: Record<string, { status: ServiceStatus; checked_at: string; details?: string }>;
    third_party: Record<
      string,
      { status: ServiceStatus; checked_at: string; consecutive_failures: number; details?: string }
    >;
    database: { status: ServiceStatus; checked_at: string; details?: string; slow_query_count_1h?: number };
    database_size?: {
      status: ServiceStatus;
      checked_at: string;
      details?: string;
      size_mb?: number;
      limit_mb?: number;
    };
  };
  uptime_points?: Array<{ ts: string; service: string; status: ServiceStatus; details?: string }>;
};

const MAX_POINTS = 1200;
const MAX_UPTIME_POINTS = 2400;

function nowIso() {
  return new Date().toISOString();
}

function repoRoot() {
  return process.cwd();
}

function dataPath() {
  return join(repoRoot(), "data", "monitoring-metrics.json");
}

async function ensureDataDir() {
  await mkdir(join(repoRoot(), "data"), { recursive: true });
}

async function readSnapshot(): Promise<MonitoringSnapshot> {
  try {
    const txt = await readFile(dataPath(), "utf-8");
    const parsed = JSON.parse(txt) as MonitoringSnapshot;
    if (!parsed?.api?.points) throw new Error("invalid snapshot");
    return parsed;
  } catch {
    return {
      updated_at: nowIso(),
      api: { points: [] },
      checks: {
        uptime: {},
        third_party: {},
        database: { status: "unknown", checked_at: nowIso() },
      },
    };
  }
}

async function writeSnapshot(s: MonitoringSnapshot) {
  await ensureDataDir();
  await writeFile(dataPath(), JSON.stringify(s, null, 2) + "\n", "utf-8");
}

export async function recordApiMetric(point: ApiMetricPoint) {
  const snap = await readSnapshot();
  const nextPoints = [point, ...(snap.api.points ?? [])].slice(0, MAX_POINTS);
  const next: MonitoringSnapshot = { ...snap, updated_at: nowIso(), api: { points: nextPoints } };
  await writeSnapshot(next);
  return next;
}

export async function setUptimeCheckStatus(service: string, status: ServiceStatus, details?: string) {
  const snap = await readSnapshot();
  const prevPoints = snap.uptime_points ?? [];
  const nextPoints = [
    { ts: nowIso(), service, status, details },
    ...prevPoints,
  ].slice(0, MAX_UPTIME_POINTS);
  const next: MonitoringSnapshot = {
    ...snap,
    updated_at: nowIso(),
    checks: {
      ...snap.checks,
      uptime: {
        ...(snap.checks.uptime ?? {}),
        [service]: { status, checked_at: nowIso(), details },
      },
    },
    uptime_points: nextPoints,
  };
  await writeSnapshot(next);
  return next;
}

export async function setThirdPartyStatus(
  service: string,
  params: { status: ServiceStatus; details?: string; consecutive_failures?: number }
) {
  const snap = await readSnapshot();
  const prev = snap.checks.third_party?.[service];
  const nextFailures =
    typeof params.consecutive_failures === "number"
      ? params.consecutive_failures
      : params.status === "red"
        ? (prev?.consecutive_failures ?? 0) + 1
        : 0;

  const next: MonitoringSnapshot = {
    ...snap,
    updated_at: nowIso(),
    checks: {
      ...snap.checks,
      third_party: {
        ...(snap.checks.third_party ?? {}),
        [service]: {
          status: params.status,
          checked_at: nowIso(),
          consecutive_failures: nextFailures,
          details: params.details,
        },
      },
    },
  };
  await writeSnapshot(next);
  return next;
}

export async function setDatabaseStatus(status: ServiceStatus, details?: string) {
  const snap = await readSnapshot();
  const next: MonitoringSnapshot = {
    ...snap,
    updated_at: nowIso(),
    checks: { ...snap.checks, database: { ...(snap.checks.database ?? {}), status, checked_at: nowIso(), details } },
  };
  await writeSnapshot(next);
  return next;
}

export async function setDatabaseSizeStatus(params: {
  status: ServiceStatus;
  details?: string;
  size_mb?: number;
  limit_mb?: number;
}) {
  const snap = await readSnapshot();
  const next: MonitoringSnapshot = {
    ...snap,
    updated_at: nowIso(),
    checks: {
      ...snap.checks,
      database_size: {
        ...(snap.checks.database_size ?? {}),
        status: params.status,
        checked_at: nowIso(),
        details: params.details,
        size_mb: params.size_mb,
        limit_mb: params.limit_mb,
      },
    },
  };
  await writeSnapshot(next);
  return next;
}

export async function getMonitoringSnapshot() {
  return await readSnapshot();
}

export function computeUptimePercentageFromChecks(s: MonitoringSnapshot, windowHours = 24) {
  const points = (s.uptime_points ?? []).filter((p) => {
    const ageMs = Date.now() - new Date(p.ts).getTime();
    return Number.isFinite(ageMs) && ageMs <= windowHours * 60 * 60 * 1000;
  });

  // If we don't have history yet, fall back to latest status map.
  if (!points.length) {
    const services = Object.values(s.checks.uptime ?? {});
    if (!services.length) return null;
    const score = services.reduce((acc, v) => {
      if (v.status === "green") return acc + 1;
      if (v.status === "yellow") return acc + 0.5;
      if (v.status === "red") return acc + 0;
      return acc + 0.5;
    }, 0);
    const pct = (score / services.length) * 100;
    return { window_hours: windowHours, uptime_pct: Math.round(pct * 10) / 10 };
  }

  const byService = new Map<string, Array<{ status: ServiceStatus }>>();
  for (const p of points) {
    const arr = byService.get(p.service) ?? [];
    arr.push({ status: p.status });
    byService.set(p.service, arr);
  }

  const serviceScores: number[] = [];
  for (const arr of byService.values()) {
    if (!arr.length) continue;
    const score = arr.reduce((acc, v) => {
      if (v.status === "green") return acc + 1;
      if (v.status === "yellow") return acc + 0.5;
      return acc + 0;
    }, 0);
    serviceScores.push(score / arr.length);
  }

  if (!serviceScores.length) return null;
  const avg = serviceScores.reduce((a, b) => a + b, 0) / serviceScores.length;
  return { window_hours: windowHours, uptime_pct: Math.round(avg * 100 * 10) / 10 };
}

