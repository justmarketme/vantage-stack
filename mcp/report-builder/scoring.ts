import type { HealthScoreBreakdown, ResearchJson } from "./schema";

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function scoreFromThresholds(value: number, thresholds: Array<[number, number]>) {
  // thresholds: [valueAtOrBelow, score0to100]
  // Uses linear interpolation between adjacent points.
  const sorted = thresholds.slice().sort((a, b) => a[0] - b[0]);
  if (value <= sorted[0]![0]) return sorted[0]![1];
  for (let i = 1; i < sorted.length; i++) {
    const [x0, y0] = sorted[i - 1]!;
    const [x1, y1] = sorted[i]!;
    if (value <= x1) {
      const t = (value - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return sorted[sorted.length - 1]![1];
}

export function generateHealthScore(research: ResearchJson): HealthScoreBreakdown {
  const notes: string[] = [];

  // Traffic: simple log-ish scaling using thresholds.
  const monthlyVisits = toNumber(research.metrics?.traffic?.monthlyVisits) ?? 0;
  const trafficScore = Math.round(
    clamp01(scoreFromThresholds(Math.max(0, monthlyVisits), [
      [0, 5],
      [500, 20],
      [2000, 35],
      [8000, 55],
      [25000, 75],
      [75000, 90],
      [200000, 100],
    ]) / 100) * 100,
  );
  if (!monthlyVisits) notes.push("Traffic estimate missing; defaulted traffic score conservatively.");

  // Speed: prefer mobile score; fall back to desktop.
  const mobile = toNumber(research.metrics?.speed?.mobileScore);
  const desktop = toNumber(research.metrics?.speed?.desktopScore);
  const speedBase = mobile ?? desktop;
  const speedScore = Math.round(
    speedBase === undefined
      ? 45
      : clamp01(scoreFromThresholds(speedBase, [
          [0, 5],
          [40, 25],
          [60, 45],
          [75, 65],
          [85, 80],
          [92, 90],
          [100, 100],
        ]) / 100) * 100,
  );
  if (speedBase === undefined) notes.push("Speed score missing; defaulted speed score to a mid-range value.");

  // Backlinks: referring domains as a proxy; authority helps a little if present.
  const referringDomains = toNumber(research.metrics?.backlinks?.referringDomains) ?? 0;
  const authority = toNumber(research.metrics?.backlinks?.authorityScore);
  const rdScore = scoreFromThresholds(Math.max(0, referringDomains), [
    [0, 5],
    [10, 20],
    [50, 40],
    [150, 60],
    [400, 80],
    [1000, 95],
    [2500, 100],
  ]);
  const authScore =
    authority === undefined
      ? undefined
      : scoreFromThresholds(clamp01(authority / 100) * 100, [
          [0, 5],
          [20, 25],
          [40, 45],
          [55, 60],
          [70, 80],
          [85, 95],
          [100, 100],
        ]);
  const backlinksScore = Math.round(
    clamp01(((rdScore * 0.8 + (authScore ?? 55) * 0.2) / 100)) * 100,
  );
  if (!referringDomains) notes.push("Backlink/referring-domain data missing; backlink score may be understated.");

  // Weighted total: traffic 35%, speed 35%, backlinks 30%.
  const total = Math.round(trafficScore * 0.35 + speedScore * 0.35 + backlinksScore * 0.3);

  return { trafficScore, speedScore, backlinksScore, total, notes };
}

