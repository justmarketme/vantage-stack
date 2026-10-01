/**
 * Calendar-sync tunables and user-facing strings that are not (yet) in `lib/consultant/config.ts`.
 * config.ts is a fixed contract, so each is listed under "Contract requests" in the 3B report
 * and should move into `cfg.calendar` once accepted. Nothing here is secret.
 *
 * TODO(contract-request 3B-CR-1): move CALENDAR into cfg.calendar.
 */
export const CALENDAR = {
  /** OAuth `state` lifetime (and the nonce cookie's Max-Age). */
  stateTtlSec: 600,
  /** Cookie that binds an OAuth round-trip to the browser that started it. */
  nonceCookie: "vs_cal_oauth_nonce",
  /** Refresh an access token this many seconds before it actually expires. */
  refreshSkewSec: 60,
  /** Per-request timeout for every provider call (token, events, profile). */
  requestTimeoutMs: 8_000,
  /** Retry backoff: attempt n waits base × 2^(n-1) seconds, capped at max. */
  retryBaseSec: 60,
  retryMaxSec: 3_600,
  /** Where the browser lands after connect/callback (the Settings screen). */
  settingsPath: "/consultant/settings",
  /** Title labels per meeting kind: "<Kind> · <Clinic name>". */
  kindLabels: { discovery: "Discovery call", demo: "Demo", follow_up: "Follow-up" },
  /** Microsoft Graph's Windows zone name for SAST (Google uses the IANA name). */
  graphTimeZone: "South Africa Standard Time",
  /** OAuth scopes. Google: events only on the user's calendars + their email address. */
  googleScopes: ["openid", "email", "https://www.googleapis.com/auth/calendar.events"],
  microsoftScopes: ["offline_access", "openid", "email", "User.Read", "Calendars.ReadWrite"],
} as const;

/** Generic strings stored in `last_error` / shown in the UI. Never provider error text. */
export const CALENDAR_MESSAGES = {
  syncFailed: "Calendar sync failed. It will retry automatically.",
  syncGaveUp: "Calendar sync failed after several attempts.",
  reconnect: "Calendar access expired. Reconnect your calendar in Settings.",
  notConfigured: "Calendar connections aren't available right now.",
  unknownProvider: "Unknown calendar provider.",
  connectFailed: "We couldn't connect your calendar. Please try again.",
} as const;
