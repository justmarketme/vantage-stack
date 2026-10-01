import type { CalendarProvider } from "../../types";

/** Provider-neutral calendar types. */

export type TokenSet = {
  accessToken: string;
  /** Google omits it on refresh (keep the stored one); Microsoft rotates it. */
  refreshToken: string | null;
  expiresInSec: number;
};

/** Everything a provider needs to create or update one meeting's calendar event. */
export type CalendarEventSpec = {
  meetingId: string;
  title: string;
  description: string;
  startIso: string;
  endIso: string;
  /** The clinic contact — only when the consultant chose to invite and the lead has a real email. */
  attendee: { email: string; name: string | null } | null;
};

/**
 * What went wrong, as a category. Deliberately carries NO provider response text: errors are
 * stored and shown generically (POPIA + never leak third-party internals).
 */
export type CalendarErrorKind =
  | "auth" // token revoked / expired refresh / insufficient scope → the consultant must reconnect
  | "not_found" // the event no longer exists at the provider
  | "conflict" // create with our deterministic id hit an existing event → patch instead
  | "transient" // 429 / 5xx / network / timeout → retry with backoff
  | "invalid" // 4xx we can't fix by retrying
  | "config"; // app not configured (client id/secret, encryption key, public URL)

export class CalendarProviderError extends Error {
  constructor(
    readonly kind: CalendarErrorKind,
    readonly status: number | null = null,
  ) {
    super(`calendar_${kind}${status ? `_${status}` : ""}`);
    this.name = "CalendarProviderError";
  }
}

export interface CalendarProviderClient {
  readonly provider: CalendarProvider;
  configured(): boolean;
  authorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<TokenSet>;
  refresh(refreshToken: string): Promise<TokenSet>;
  accountEmail(accessToken: string): Promise<string | null>;
  /** Best effort; never throws. */
  revoke(token: string): Promise<void>;
  createEvent(accessToken: string, calendarId: string, spec: CalendarEventSpec): Promise<string>;
  updateEvent(accessToken: string, calendarId: string, eventId: string, spec: CalendarEventSpec): Promise<void>;
  /** Resolves when the event is gone (already-deleted counts as success). */
  deleteEvent(accessToken: string, calendarId: string, eventId: string, notifyAttendees: boolean): Promise<void>;
}
