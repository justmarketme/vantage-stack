import {
  formatSastDate,
  formatSastDateTime,
  formatSastTime,
  formatZar,
  isoToSastWallClock,
  sastDayRange,
  sastToday,
  sastWallClockToIso,
} from "../../../../lib/consultant/client/format";
import { MeetingInput } from "../../../../lib/consultant/types";
import { execFileSync } from "node:child_process";
import path from "node:path";

describe("formatZar", () => {
  it.each([
    [12500, "R12 500"],
    [0, "R0"],
    [999, "R999"],
    [1000, "R1 000"],
    [1234567, "R1 234 567"],
    [12500.49, "R12 500"],
    [12500.5, "R12 501"],
    [-1200.6, "-R1 201"],
    [-0.2, "R0"],
  ])("%p → %s", (n, out) => expect(formatZar(n)).toBe(out));

  it("never shows cents and handles empties", () => {
    expect(formatZar(99.99)).not.toMatch(/[.,]\d/);
    expect(formatZar(null)).toBe("—");
    expect(formatZar(undefined)).toBe("—");
    expect(formatZar(Number.NaN)).toBe("—");
  });
});

/**
 * Device-timezone independence. A jest worker can't reliably change its own
 * timezone, so the helpers are run in child processes started with different
 * `TZ` values; each child also reports its local offset, proving the device
 * timezone really differed while the SAST output stayed identical.
 * (The in-process suite below also passes under `TZ=America/New_York npx jest …`.)
 */
describe("device-timezone independence (child processes)", () => {
  const root = path.resolve(__dirname, "../../../..");
  const tsx = path.join(root, "node_modules/.bin/tsx");
  const script = `
    import * as f from "./lib/consultant/client/format";
    const iso = "2026-09-30T22:30:00Z";
    console.log(JSON.stringify({
      offset: new Date("2026-06-01T00:00:00Z").getTimezoneOffset(),
      dt: f.formatSastDateTime(iso), d: f.formatSastDate(iso), t: f.formatSastTime(iso),
      wall: f.sastWallClockToIso("2026-10-05", "09:30"), today: f.sastToday(new Date(iso)),
      range: f.sastDayRange("2026-12-31"),
    }));`;
  const zones: [string, number][] = [
    ["UTC", 0],
    ["America/New_York", 240],
    ["Asia/Kolkata", -330],
    ["Pacific/Auckland", -720],
    ["Africa/Johannesburg", -120],
  ];
  it.each(zones)(
    "TZ=%s gives the same SAST output",
    (tz, offset) => {
      const out = JSON.parse(
        execFileSync(tsx, ["-e", script], {
          cwd: root,
          env: { ...process.env, TZ: tz },
          encoding: "utf8",
          timeout: 60_000,
        }),
      );
      expect(out.offset).toBe(offset);
      expect(out).toMatchObject({
        dt: "Thu 1 Oct 2026, 00:30",
        d: "Thu 1 Oct 2026",
        t: "00:30",
        wall: "2026-10-05T09:30:00+02:00",
        today: "2026-10-01",
        range: {
          from: "2026-12-31T00:00:00+02:00",
          to: "2027-01-01T00:00:00+02:00",
        },
      });
    },
    60_000,
  );
});

describe("SAST formatting (in-process, whatever the device TZ)", () => {
  it("formats instants in Johannesburg time", () => {
    // 22:30 UTC on 30 Sep = 00:30 SAST on 1 Oct (date rolls over in SA, not in UTC/NY).
    const iso = "2026-09-30T22:30:00Z";
    expect(formatSastDate(iso)).toBe("Thu 1 Oct 2026");
    expect(formatSastTime(iso)).toBe("00:30");
    expect(formatSastDateTime(iso)).toBe("Thu 1 Oct 2026, 00:30");
    expect(formatSastDateTime("2026-12-25T07:05:00+02:00")).toBe(
      "Fri 25 Dec 2026, 07:05",
    );
    // No DST in SA: a northern-summer and a southern-summer instant are both +2.
    expect(formatSastTime("2026-07-01T10:00:00Z")).toBe("12:00");
    expect(formatSastTime("2026-01-15T10:00:00Z")).toBe("12:00");
  });

  it("builds ISO instants from SAST wall-clock input", () => {
    const iso = sastWallClockToIso("2026-10-05", "09:30");
    expect(iso).toBe("2026-10-05T09:30:00+02:00");
    expect(new Date(iso!).toISOString()).toBe("2026-10-05T07:30:00.000Z");
    expect(isoToSastWallClock(iso)).toEqual({
      date: "2026-10-05",
      time: "09:30",
    });
    expect(sastDayRange("2026-12-31")).toEqual({
      from: "2026-12-31T00:00:00+02:00",
      to: "2027-01-01T00:00:00+02:00",
    });
    expect(sastToday(new Date("2026-09-30T22:30:00Z"))).toBe("2026-10-01");
  });
});

describe("sastWallClockToIso validation", () => {
  it.each([
    ["2026-02-30", "10:00"],
    ["2026-13-01", "10:00"],
    ["2026-10-05", "24:00"],
    ["2026-10-05", "9:30"],
    ["05/10/2026", "09:30"],
    ["", ""],
  ])("%s %s → null", (d, t) => expect(sastWallClockToIso(d, t)).toBeNull());

  it("accepts seconds and a leap day, and satisfies the MeetingInput contract", () => {
    expect(sastWallClockToIso("2028-02-29", "23:59:59")).toBe(
      "2028-02-29T23:59:59+02:00",
    );
    const r = MeetingInput.safeParse({
      leadId: "11111111-1111-4111-8111-111111111111",
      kind: "discovery",
      startsAt: sastWallClockToIso("2026-10-05", "09:30"),
    });
    expect(r.success).toBe(true);
  });

  it("empty / invalid instants render a placeholder", () => {
    expect(formatSastDateTime(null)).toBe("—");
    expect(formatSastDate("not a date")).toBe("—");
    expect(formatSastTime(undefined)).toBe("—");
    expect(isoToSastWallClock("nope")).toBeNull();
  });
});
