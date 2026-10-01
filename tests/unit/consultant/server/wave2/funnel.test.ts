import { buildFunnel, emptyCounts, median, ratio, sumCounts, type FunnelCounts } from "../../../../../lib/consultant/metrics/funnel";

const range = { from: "2026-09-30T22:00:00.000Z", to: "2026-10-31T22:00:00.000Z" };
const counts = (p: Partial<FunnelCounts>): FunnelCounts => ({ ...emptyCounts(), ...p });

describe("funnel formulas", () => {
  it("every rate per the contract definitions", () => {
    const f = buildFunnel("month", range, counts({ dials: 200, connects: 50, meetingsBooked: 10, meetingsHeld: 6, noShows: 2, proposals: 5, paid: 3, revenuePaid: 45000 }));
    expect(f.rates).toEqual({
      connectRate: 50 / 200,
      connectToMeeting: 10 / 50,
      showRate: 6 / 8,
      meetingToPaid: 3 / 6,
      proposalToPaid: 3 / 5,
      closeFromDials: 3 / 200,
      closeFromConnects: 3 / 50,
    });
    expect(f.avgSale).toBe(15000);
    expect(f.from).toBe(range.from);
  });

  it("rates are null (never NaN/Infinity) when the denominator is 0", () => {
    const f = buildFunnel("today", range, emptyCounts());
    for (const v of Object.values(f.rates)) expect(v).toBeNull();
    expect(f.avgSale).toBeNull();
    expect(f.salesCycleDays).toBeNull();
    expect(f.velocityPerDay).toBeNull();
    expect(buildFunnel("today", range, counts({ paid: 2 })).rates.closeFromConnects).toBeNull();
  });

  it("avg sale rounds to whole rand; cycle days is the median to 1 dp", () => {
    const f = buildFunnel("month", range, counts({ paid: 3, revenuePaid: 10000, cycleDays: [30.04, 10, 20.26] }));
    expect(f.avgSale).toBe(3333);
    expect(f.salesCycleDays).toBe(20.3);
  });

  it("velocity = open opps × win rate × avg sale ÷ cycle days", () => {
    const f = buildFunnel("quarter", range, counts({ paid: 2, lost: 2, revenuePaid: 30000, cycleDays: [20, 40], openOpportunities: 10 }));
    // 10 × 0.5 × 15000 ÷ 30 = 2500
    expect(f.velocityPerDay).toBe(2500);
  });

  it("team totals pool cycle days and add counts", () => {
    const t = sumCounts([counts({ dials: 5, cycleDays: [1] }), counts({ dials: 7, cycleDays: [3, 5] })]);
    expect(t.dials).toBe(12);
    expect(median(t.cycleDays)).toBe(3);
  });

  it("helpers", () => {
    expect(ratio(1, 0)).toBeNull();
    expect(median([])).toBeNull();
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});
