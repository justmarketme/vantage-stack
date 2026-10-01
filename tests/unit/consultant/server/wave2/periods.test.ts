import {
  daysIntoPeriod,
  monthKey,
  periodRange,
  previousMonthRange,
  previousQuarterRange,
  quarterKey,
  sastParts,
} from "../../../../../lib/consultant/metrics/periods";

// SAST = UTC+2 all year. 2026-10-01 00:30 SAST = 2026-09-30 22:30Z.
const at = (isoZ: string) => new Date(isoZ);

describe("SAST periods", () => {
  it("today flips at SAST midnight, not UTC midnight", () => {
    const lateUtc = at("2026-09-30T22:30:00Z"); // already 1 Oct in SA
    expect(sastParts(lateUtc)).toMatchObject({ year: 2026, month: 10, day: 1 });
    expect(periodRange("today", lateUtc)).toEqual({ from: "2026-09-30T22:00:00.000Z", to: "2026-10-01T22:00:00.000Z" });
    expect(periodRange("today", at("2026-09-30T21:59:59Z"))).toEqual({ from: "2026-09-29T22:00:00.000Z", to: "2026-09-30T22:00:00.000Z" });
  });

  it("week is Monday–Sunday SAST", () => {
    // Sunday 4 Oct 2026 23:00 SAST
    const sun = at("2026-10-04T21:00:00Z");
    expect(sastParts(sun).weekday).toBe(7);
    expect(periodRange("week", sun)).toEqual({ from: "2026-09-27T22:00:00.000Z", to: "2026-10-04T22:00:00.000Z" });
    // Monday 5 Oct 00:00 SAST starts a new week
    expect(periodRange("week", at("2026-10-04T22:00:00Z")).from).toBe("2026-10-04T22:00:00.000Z");
  });

  it("month and quarter, incl. year roll-over", () => {
    expect(periodRange("month", at("2026-12-31T21:59:59Z"))).toEqual({ from: "2026-11-30T22:00:00.000Z", to: "2026-12-31T22:00:00.000Z" });
    expect(periodRange("month", at("2026-12-31T22:00:00Z")).from).toBe("2026-12-31T22:00:00.000Z"); // 1 Jan 2027 SAST
    expect(periodRange("quarter", at("2026-11-15T10:00:00Z"))).toEqual({ from: "2026-09-30T22:00:00.000Z", to: "2026-12-31T22:00:00.000Z" });
    expect(quarterKey(at("2026-09-30T22:00:00Z"))).toBe("2026-Q4");
    expect(quarterKey(at("2026-09-30T21:59:59Z"))).toBe("2026-Q3");
    expect(monthKey(at("2026-09-30T22:00:00Z"))).toBe("2026-10");
  });

  it("leap-year February", () => {
    expect(periodRange("month", at("2028-02-15T00:00:00Z"))).toEqual({ from: "2028-01-31T22:00:00.000Z", to: "2028-02-29T22:00:00.000Z" });
  });

  it("previous month / quarter across the year boundary", () => {
    const jan2 = at("2027-01-02T08:00:00Z");
    expect(previousMonthRange(jan2)).toEqual({ from: "2026-11-30T22:00:00.000Z", to: "2026-12-31T22:00:00.000Z", key: "2026-12" });
    expect(previousQuarterRange(jan2)).toEqual({ from: "2026-09-30T22:00:00.000Z", to: "2026-12-31T22:00:00.000Z", key: "2026-Q4" });
  });

  it("is independent of the process timezone", () => {
    const prev = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      expect(periodRange("today", at("2026-09-30T22:30:00Z")).from).toBe("2026-09-30T22:00:00.000Z");
    } finally {
      process.env.TZ = prev;
    }
  });

  it("daysIntoPeriod", () => {
    expect(daysIntoPeriod("month", at("2026-10-01T00:00:00Z"))).toBe(0);
    expect(daysIntoPeriod("month", at("2026-10-03T00:00:00Z"))).toBe(2);
  });
});
