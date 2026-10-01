import { consultantConfig } from "../../config";
import { SAST_TIME_ZONE } from "../../types";
import { CALENDAR } from "./constants";
import { bearerJson, postForm, tokenSetFrom } from "./http";
import { sastRfc3339 } from "./sast";
import { CalendarProviderError, type CalendarEventSpec, type CalendarProviderClient, type TokenSet } from "./types";

/**
 * Google Calendar API v3 over plain fetch.
 *   OAuth: accounts.google.com/o/oauth2/v2/auth → oauth2.googleapis.com/token (offline access)
 *   Events: POST/PATCH/DELETE https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const API = "https://www.googleapis.com/calendar/v3";

/**
 * Deterministic Google event id for a meeting, so a create that is retried (or races the cron)
 * can never produce two events: the second insert gets 409 and we patch instead. Google ids use
 * base32hex (0-9, a-v), 5–1024 chars; a UUID's hex digits are a subset of that alphabet.
 */
export function googleEventId(meetingId: string): string {
  return `vsm${meetingId.toLowerCase().replace(/[^0-9a-f]/g, "")}`;
}

/** The Events resource body. SAST offset on the instant AND the IANA zone on the event. */
export function googleEventBody(spec: CalendarEventSpec, opts: { includeId: boolean }): Record<string, unknown> {
  return {
    ...(opts.includeId ? { id: googleEventId(spec.meetingId) } : {}),
    // "confirmed" also restores an event that was deleted earlier (Google keeps deleted events
    // as "cancelled" under the same id, and our ids are deterministic).
    status: "confirmed",
    summary: spec.title,
    description: spec.description,
    start: { dateTime: sastRfc3339(spec.startIso), timeZone: SAST_TIME_ZONE },
    end: { dateTime: sastRfc3339(spec.endIso), timeZone: SAST_TIME_ZONE },
    attendees: spec.attendee
      ? [{ email: spec.attendee.email, ...(spec.attendee.name ? { displayName: spec.attendee.name } : {}) }]
      : [],
    reminders: { useDefault: true },
    extendedProperties: { private: { vsMeetingId: spec.meetingId } },
  };
}

function eventsUrl(calendarId: string, eventId?: string, sendUpdates?: "all" | "none"): string {
  const base = `${API}/calendars/${encodeURIComponent(calendarId)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ""}`;
  return sendUpdates ? `${base}?sendUpdates=${sendUpdates}` : base;
}

function creds() {
  return consultantConfig().calendar.google;
}

export const googleCalendar: CalendarProviderClient = {
  provider: "google",

  configured() {
    const c = creds();
    return !!(c.clientId && c.clientSecret);
  },

  authorizeUrl(state, redirectUri) {
    const q = new URLSearchParams({
      client_id: creds().clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: CALENDAR.googleScopes.join(" "),
      access_type: "offline", // we need a refresh token
      prompt: "consent", // …and Google only re-issues one on explicit consent
      include_granted_scopes: "true",
      state,
    });
    return `${AUTH_URL}?${q.toString()}`;
  },

  async exchangeCode(code, redirectUri): Promise<TokenSet> {
    const c = creds();
    const j = await postForm<Record<string, unknown>>(TOKEN_URL, {
      code,
      client_id: c.clientId,
      client_secret: c.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });
    return tokenSetFrom(j);
  },

  async refresh(refreshToken): Promise<TokenSet> {
    const c = creds();
    const j = await postForm<Record<string, unknown>>(TOKEN_URL, {
      refresh_token: refreshToken,
      client_id: c.clientId,
      client_secret: c.clientSecret,
      grant_type: "refresh_token",
    });
    return tokenSetFrom(j);
  },

  async accountEmail(accessToken) {
    const j = await bearerJson<{ email?: unknown }>(USERINFO_URL, accessToken, { method: "GET" });
    return typeof j?.email === "string" ? j.email.toLowerCase() : null;
  },

  async revoke(token) {
    try {
      await postForm(REVOKE_URL, { token });
    } catch {
      /* best effort: we delete our copy regardless */
    }
  },

  async createEvent(accessToken, calendarId, spec) {
    const send = spec.attendee ? "all" : "none";
    const j = await bearerJson<{ id?: unknown }>(eventsUrl(calendarId, undefined, send), accessToken, {
      method: "POST",
      body: googleEventBody(spec, { includeId: true }),
    });
    if (typeof j?.id !== "string") throw new CalendarProviderError("invalid", null);
    return j.id;
  },

  async updateEvent(accessToken, calendarId, eventId, spec) {
    await bearerJson(eventsUrl(calendarId, eventId, spec.attendee ? "all" : "none"), accessToken, {
      method: "PATCH",
      body: googleEventBody(spec, { includeId: false }),
    });
  },

  async deleteEvent(accessToken, calendarId, eventId, notifyAttendees) {
    try {
      await bearerJson(eventsUrl(calendarId, eventId, notifyAttendees ? "all" : "none"), accessToken, { method: "DELETE" });
    } catch (e) {
      if (e instanceof CalendarProviderError && e.kind === "not_found") return; // already gone
      throw e;
    }
  },
};
