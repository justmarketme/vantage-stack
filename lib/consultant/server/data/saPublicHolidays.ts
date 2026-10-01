/**
 * South African public holidays (Public Holidays Act 36 of 1994), as SAST calendar dates.
 *
 * Used by the working-day calculator behind Why Board daily plans. Includes the "Sunday rule":
 * when a holiday falls on a Sunday, the Monday after it is a public holiday too — those
 * observed Mondays are listed explicitly (marked "observed").
 *
 * TO EXTEND: add the next year's dates below (Good Friday / Family Day move with Easter), plus
 * any once-off holidays the President proclaims (e.g. an election day — the 2026/27 local
 * government election date had not been proclaimed when this list was written). Dates outside
 * the listed years are treated as having no holidays, so keep this at least a year ahead.
 */
export const SA_PUBLIC_HOLIDAYS: Readonly<Record<string, string>> = {
  // 2026
  "2026-01-01": "New Year's Day",
  "2026-03-21": "Human Rights Day", // Saturday — no substitute day
  "2026-04-03": "Good Friday",
  "2026-04-06": "Family Day",
  "2026-04-27": "Freedom Day",
  "2026-05-01": "Workers' Day",
  "2026-06-16": "Youth Day",
  "2026-08-09": "National Women's Day", // Sunday
  "2026-08-10": "National Women's Day (observed)",
  "2026-09-24": "Heritage Day",
  "2026-12-16": "Day of Reconciliation",
  "2026-12-25": "Christmas Day",
  "2026-12-26": "Day of Goodwill", // Saturday — no substitute day

  // 2027
  "2027-01-01": "New Year's Day",
  "2027-03-21": "Human Rights Day", // Sunday
  "2027-03-22": "Human Rights Day (observed)",
  "2027-03-26": "Good Friday",
  "2027-03-29": "Family Day",
  "2027-04-27": "Freedom Day",
  "2027-05-01": "Workers' Day", // Saturday — no substitute day
  "2027-06-16": "Youth Day",
  "2027-08-09": "National Women's Day",
  "2027-09-24": "Heritage Day",
  "2027-12-16": "Day of Reconciliation",
  "2027-12-25": "Christmas Day", // Saturday
  "2027-12-26": "Day of Goodwill", // Sunday
  "2027-12-27": "Day of Goodwill (observed)",
};

export function isSaPublicHoliday(dateKey: string): boolean {
  return Object.prototype.hasOwnProperty.call(SA_PUBLIC_HOLIDAYS, dateKey);
}
