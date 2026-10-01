import { EXPECTED_RETENTION_MONTHS } from "../../../../../lib/consultant/server/scoring/constants";
import { churnBand, scoreDeal, type ScoreFeatures } from "../../../../../lib/consultant/server/scoring/model";

const f = (p: Partial<ScoreFeatures> = {}): ScoreFeatures => ({
  stage: "proposal",
  daysInStage: 3,
  medianDaysInStage: 5,
  daysSinceLastTouch: 1,
  answeredCalls: 2,
  unansweredStreak: 0,
  positiveDispositions: 1,
  lastDisposition: "demo_booked",
  lastSentiment: "neutral",
  recommendedStage: null,
  noShows: 0,
  meetingsHeld: 1,
  upcomingMeetings: 0,
  nextAction: "planned",
  value: 15000,
  ...p,
});

describe("heuristic-v1 scoring", () => {
  it("longer stall ⇒ lower win probability and higher churn risk (monotone)", () => {
    let prev = scoreDeal(f({ daysInStage: 1 }));
    for (const d of [2, 5, 10, 20, 40, 80]) {
      const s = scoreDeal(f({ daysInStage: d }));
      expect(s.winProbability).toBeLessThanOrEqual(prev.winProbability);
      expect(s.churnRisk).toBeGreaterThanOrEqual(prev.churnRisk);
      prev = s;
    }
    expect(scoreDeal(f({ daysInStage: 40 })).churnRisk).toBeGreaterThan(scoreDeal(f({ daysInStage: 2 })).churnRisk);
  });

  it("longer silence, more no-shows and an unanswered streak all raise churn", () => {
    const worse = <K extends keyof ScoreFeatures>(k: K, a: ScoreFeatures[K], b: ScoreFeatures[K]) => {
      expect(scoreDeal(f({ [k]: b } as Partial<ScoreFeatures>)).churnRisk).toBeGreaterThanOrEqual(scoreDeal(f({ [k]: a } as Partial<ScoreFeatures>)).churnRisk);
    };
    worse("daysSinceLastTouch", 1, 10);
    worse("daysSinceLastTouch", 10, 30);
    worse("noShows", 0, 1);
    worse("noShows", 1, 3);
    worse("unansweredStreak", 0, 2);
    worse("lastSentiment", "positive", "negative");
  });

  it("stage base rates order open stages sensibly", () => {
    const p = (stage: ScoreFeatures["stage"]) => scoreDeal(f({ stage })).winProbability;
    expect(p("new")).toBeLessThan(p("discovery_booked"));
    expect(p("discovery_booked")).toBeLessThan(p("proposal"));
    expect(p("proposal")).toBeLessThan(p("won"));
  });

  it("terminal stages", () => {
    const paid = scoreDeal(f({ stage: "paid" }));
    expect([paid.winProbability, paid.churnRisk, paid.churnBand]).toEqual([1, 0, "low"]);
    expect(paid.clv).toBe(15000 * EXPECTED_RETENTION_MONTHS);
    const lost = scoreDeal(f({ stage: "lost" }));
    expect([lost.winProbability, lost.churnRisk, lost.clv]).toEqual([0, 1, 0]);
  });

  it("CLV = value × retention × win probability; open probabilities stay inside the band", () => {
    const s = scoreDeal(f());
    expect(s.clv).toBe(Math.round(15000 * EXPECTED_RETENTION_MONTHS * s.winProbability));
    const hopeless = scoreDeal(f({ stage: "new", daysInStage: 400, daysSinceLastTouch: 400, noShows: 5, lastDisposition: "not_interested", recommendedStage: "lost", unansweredStreak: 9, lastSentiment: "negative", nextAction: "overdue", positiveDispositions: 0, answeredCalls: 0, meetingsHeld: 0 }));
    expect(hopeless.winProbability).toBeGreaterThanOrEqual(0.01);
    expect(hopeless.churnBand).toBe("high");
  });

  it("factors are plain English, signed, biggest first, and explain the score", () => {
    const s = scoreDeal(f({ daysInStage: 20, noShows: 1, lastSentiment: "positive" }));
    expect(s.model).toBe("heuristic-v1");
    expect(s.factors.length).toBeGreaterThan(2);
    const mags = s.factors.map((x) => Math.abs(x.impact));
    expect([...mags].sort((a, b) => b - a)).toEqual(mags);
    expect(s.factors.find((x) => /days in Proposal/.test(x.label))!.impact).toBeLessThan(0);
    expect(s.factors.find((x) => /positive/.test(x.label))!.impact).toBeGreaterThan(0);
    for (const x of s.factors) expect(x.label).not.toMatch(/\+27|@/);
  });

  it("bands", () => {
    expect(churnBand(0.1)).toBe("low");
    expect(churnBand(0.35)).toBe("medium");
    expect(churnBand(0.6)).toBe("high");
  });
});
