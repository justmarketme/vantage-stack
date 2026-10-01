import { dailyPlanFor, ratesFrom, type Rates } from "../../../../lib/consultant/server/repo/goals";

const DEFAULTS: Rates = { connectRate: 0.3, closeFromConnects: 0.3, avgSale: 15000, commissionRate: 0.25 };

describe("Why Board daily plan", () => {
  test("uses the consultant's actual rates only with enough data", () => {
    expect(ratesFrom({ dials: 10, connects: 5, paid: 1, revenue: 20000 }, DEFAULTS)).toEqual(DEFAULTS);
    const r = ratesFrom({ dials: 200, connects: 50, paid: 5, revenue: 100000 }, DEFAULTS);
    expect(r).toEqual({ connectRate: 0.25, closeFromConnects: 0.1, avgSale: 20000, commissionRate: 0.25 });
  });

  test("plans what is still needed over the working days left", () => {
    const plan = dailyPlanFor("commission", 30000, 20, { ...DEFAULTS, connectRate: 0.25 });
    expect(plan).toMatchObject({ dealsNeeded: 8, connectsNeeded: 27, dialsNeeded: 108, perDay: { dials: 6, connects: 2 } });
    expect(dailyPlanFor("deals_paid", 3, 10, DEFAULTS)?.dealsNeeded).toBe(3);
    expect(dailyPlanFor("revenue", 45000, 10, DEFAULTS)?.dealsNeeded).toBe(3);
  });

  test("no plan for activity goals, achieved goals or no days left", () => {
    expect(dailyPlanFor("dials", 100, 10, DEFAULTS)).toBeNull();
    expect(dailyPlanFor("meetings_held", 5, 10, DEFAULTS)).toBeNull();
    expect(dailyPlanFor("revenue", 0, 10, DEFAULTS)).toBeNull();
    expect(dailyPlanFor("revenue", 1000, 0, DEFAULTS)).toBeNull();
    expect(dailyPlanFor("commission", 1000, 5, { ...DEFAULTS, commissionRate: 0 })).toBeNull();
  });
});
