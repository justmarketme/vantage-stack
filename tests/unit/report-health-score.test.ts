import { generateHealthScore } from "../../mcp/report-builder/scoring";

function log(expected: unknown, actual: unknown) {
  globalThis.qaLogExpectedActual?.({ expected, actual });
}

describe("Report score calculation", () => {
  test("health score trends upward with better metrics", () => {
    const low: any = {
      metrics: {
        traffic: { monthlyVisits: 0 },
        speed: { mobileScore: 35 },
        backlinks: { referringDomains: 0, authorityScore: 10 },
      },
    };
    const high: any = {
      metrics: {
        traffic: { monthlyVisits: 200000 },
        speed: { mobileScore: 95 },
        backlinks: { referringDomains: 2500, authorityScore: 90 },
      },
    };

    const lowScore = generateHealthScore(low);
    const highScore = generateHealthScore(high);

    log({ lowLtHigh: true }, { low: lowScore.total, high: highScore.total });
    expect(lowScore.total).toBeLessThan(highScore.total);
    expect(highScore.total).toBeGreaterThanOrEqual(80);
  });

  test("handles missing inputs with conservative defaults", () => {
    const out = generateHealthScore({} as any);
    log({ totalBetween: [0, 100] }, { total: out.total, notes: out.notes });
    expect(out.total).toBeGreaterThanOrEqual(0);
    expect(out.total).toBeLessThanOrEqual(100);
    expect(Array.isArray(out.notes)).toBe(true);
  });
});

