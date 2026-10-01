import { SA_PUBLIC_HOLIDAYS } from "../../../../lib/consultant/server/data/saPublicHolidays";
import { isWorkingDay, workingDaysBetween, workingDaysUntil } from "../../../../lib/consultant/server/workingDays";

describe("SA working days", () => {
  test("weekends and public holidays don't count", () => {
    expect(isWorkingDay("2026-10-05")).toBe(true); // Monday
    expect(isWorkingDay("2026-10-03")).toBe(false); // Saturday
    expect(isWorkingDay("2026-10-04")).toBe(false); // Sunday
    expect(isWorkingDay("2026-09-24")).toBe(false); // Heritage Day (Thursday)
    expect(isWorkingDay("2026-12-16")).toBe(false); // Day of Reconciliation
    expect(isWorkingDay("2026-08-10")).toBe(false); // Women's Day observed (Sunday rule)
    expect(isWorkingDay("2027-12-27")).toBe(false); // Day of Goodwill observed
  });

  test("both ends inclusive; reversed range is 0", () => {
    expect(workingDaysBetween("2026-10-05", "2026-10-09")).toBe(5);
    expect(workingDaysBetween("2026-10-05", "2026-10-05")).toBe(1);
    expect(workingDaysBetween("2026-10-10", "2026-10-11")).toBe(0);
    expect(workingDaysBetween("2026-10-09", "2026-10-05")).toBe(0);
  });

  test("December 2026: 23 weekdays minus 16th and 25th = 21 working days", () => {
    expect(workingDaysBetween("2026-12-01", "2026-12-31")).toBe(21);
  });

  test("Easter 2027 week: Good Friday + Family Day", () => {
    expect(workingDaysBetween("2027-03-22", "2027-04-02")).toBe(7); // 10 weekdays − 22 Mar (observed) − 26 Mar − 29 Mar
  });

  test("'today' is the SAST date, not UTC", () => {
    // Friday 2026-10-09 23:30 UTC is already Saturday in Johannesburg → nothing left this week.
    expect(workingDaysUntil("2026-10-10", new Date("2026-10-09T23:30:00Z"))).toBe(0);
    expect(workingDaysUntil("2026-10-09", new Date("2026-10-09T21:00:00Z"))).toBe(1);
  });

  test("holiday list covers 2026 and 2027 and only lists valid dates", () => {
    const keys = Object.keys(SA_PUBLIC_HOLIDAYS);
    expect(keys.some((k) => k.startsWith("2026-"))).toBe(true);
    expect(keys.some((k) => k.startsWith("2027-"))).toBe(true);
    for (const k of keys) expect(new Date(`${k}T00:00:00Z`).toISOString().slice(0, 10)).toBe(k);
  });
});
