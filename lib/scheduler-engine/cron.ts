function parseField(field: string, min: number, max: number): number[] | "*" {
  const f = field.trim();
  if (f === "*") return "*";
  const n = Number(f);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Unsupported cron field: ${field}`);
  return [n];
}

function matches(field: number[] | "*", value: number): boolean {
  if (field === "*") return true;
  return field.includes(value);
}

/**
 * Minimal UTC cron "next run" calculator for 5-field expressions:
 *   minute hour day-of-month month day-of-week
 * Supports: '*' and single numeric values only.
 *
 * This is intentionally strict so the dashboard never lies.
 */
export function nextRunUtcFromCron(schedule: string, from = new Date()): Date | null {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Unsupported cron schedule (expected 5 fields): ${schedule}`);

  const [minF, hourF, domF, monF, dowF] = parts;
  const minute = parseField(minF, 0, 59);
  const hour = parseField(hourF, 0, 23);
  const dom = parseField(domF, 1, 31);
  const mon = parseField(monF, 1, 12);
  const dow = parseField(dowF, 0, 7); // 0 or 7 = Sunday

  const start = new Date(from.getTime() + 60_000); // strictly after "from"
  start.setUTCSeconds(0, 0);

  const maxMinutes = 60 * 24 * 14; // search up to 14 days
  let t = new Date(start);
  for (let i = 0; i < maxMinutes; i++) {
    const m = t.getUTCMinutes();
    const h = t.getUTCHours();
    const day = t.getUTCDate();
    const month = t.getUTCMonth() + 1;
    const wd0 = t.getUTCDay(); // 0=Sun..6
    const wd = wd0 === 0 ? 7 : wd0; // normalize Sunday to 7 for matching "7"

    if (
      matches(minute, m) &&
      matches(hour, h) &&
      matches(dom, day) &&
      matches(mon, month) &&
      (matches(dow, wd0) || matches(dow, wd))
    ) {
      return t;
    }
    t = new Date(t.getTime() + 60_000);
  }
  return null;
}

