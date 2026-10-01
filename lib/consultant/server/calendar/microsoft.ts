import { consultantConfig } from "../../config";
import { CALENDAR } from "./constants";
import { bearerJson, postForm, tokenSetFrom } from "./http";
import { sastWallClock } from "./sast";
import { CalendarProviderError, type CalendarEventSpec, type CalendarProviderClient, type TokenSet } from "./types";

/**
 * Microsoft Graph (Outlook / Microsoft 365 calendars) over plain fetch.
 *   OAuth: login.microsoftonline.com/{tenant}/oauth2/v2.0/{authorize,token} (offline_access)
 *   Events: POST /me/events · PATCH /me/events/{id} · DELETE /me/events/{id}
 * Graph wants a zone-less wall clock + a Windows zone name, so times are sent as SAST wall
 * clock with "South Africa Standard Time" (and the same zone requested back via Prefer).
 */

const GRAPH = "https://graph.microsoft.com/v1.0";

function creds() {
  return consultantConfig().calendar.microsoft;
}

function loginBase(): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(creds().tenant || "common")}/oauth2/v2.0`;
}

export function graphEventBody(spec: CalendarEventSpec, opts: { create: boolean }): Record<string, unknown> {
  return {
    subject: spec.title,
    body: { contentType: "text", content: spec.description },
    start: { dateTime: sastWallClock(spec.startIso), timeZone: CALENDAR.graphTimeZone },
    end: { dateTime: sastWallClock(spec.endIso), timeZone: CALENDAR.graphTimeZone },
    attendees: spec.attendee
      ? [{ emailAddress: { address: spec.attendee.email, ...(spec.attendee.name ? { name: spec.attendee.name } : {}) }, type: "required" }]
      : [],
    isReminderOn: true,
    // Graph de-duplicates POSTs that carry the same transactionId, so a retried create
    // can't produce a second event. Only valid on create.
    ...(opts.create ? { transactionId: spec.meetingId } : {}),
  };
}

function eventsPath(calendarId: string, eventId?: string): string {
  const base = calendarId === "primary" ? `${GRAPH}/me/events` : `${GRAPH}/me/calendars/${encodeURIComponent(calendarId)}/events`;
  return eventId ? `${GRAPH}/me/events/${encodeURIComponent(eventId)}` : base;
}

const PREFER_TZ = { Prefer: `outlook.timezone="${CALENDAR.graphTimeZone}"` };

export const microsoftCalendar: CalendarProviderClient = {
  provider: "microsoft",

  configured() {
    const c = creds();
    return !!(c.clientId && c.clientSecret);
  },

  authorizeUrl(state, redirectUri) {
    const q = new URLSearchParams({
      client_id: creds().clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: CALENDAR.microsoftScopes.join(" "),
      prompt: "select_account",
      state,
    });
    return `${loginBase()}/authorize?${q.toString()}`;
  },

  async exchangeCode(code, redirectUri): Promise<TokenSet> {
    const c = creds();
    const j = await postForm<Record<string, unknown>>(`${loginBase()}/token`, {
      client_id: c.clientId,
      client_secret: c.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      scope: CALENDAR.microsoftScopes.join(" "),
    });
    return tokenSetFrom(j);
  },

  async refresh(refreshToken): Promise<TokenSet> {
    const c = creds();
    const j = await postForm<Record<string, unknown>>(`${loginBase()}/token`, {
      client_id: c.clientId,
      client_secret: c.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: CALENDAR.microsoftScopes.join(" "),
    });
    return tokenSetFrom(j);
  },

  async accountEmail(accessToken) {
    const j = await bearerJson<{ mail?: unknown; userPrincipalName?: unknown }>(
      `${GRAPH}/me?$select=mail,userPrincipalName`,
      accessToken,
      { method: "GET" },
    );
    const v = typeof j?.mail === "string" && j.mail ? j.mail : typeof j?.userPrincipalName === "string" ? j.userPrincipalName : null;
    return v ? v.toLowerCase() : null;
  },

  async revoke() {
    // Microsoft identity platform has no endpoint to revoke a single delegated refresh token
    // (revokeSignInSessions would sign the consultant out of everything). Deleting our
    // encrypted copy is the revocation; the consultant can also remove the app at
    // myapps.microsoft.com. Intentionally a no-op.
  },

  async createEvent(accessToken, calendarId, spec) {
    const j = await bearerJson<{ id?: unknown }>(eventsPath(calendarId), accessToken, {
      method: "POST",
      body: graphEventBody(spec, { create: true }),
      headers: PREFER_TZ,
    });
    if (typeof j?.id !== "string") throw new CalendarProviderError("invalid", null);
    return j.id;
  },

  async updateEvent(accessToken, _calendarId, eventId, spec) {
    await bearerJson(eventsPath("primary", eventId), accessToken, {
      method: "PATCH",
      body: graphEventBody(spec, { create: false }),
      headers: PREFER_TZ,
    });
  },

  async deleteEvent(accessToken, _calendarId, eventId) {
    // Deleting an event the consultant organised sends cancellations to attendees automatically.
    try {
      await bearerJson(eventsPath("primary", eventId), accessToken, { method: "DELETE" });
    } catch (e) {
      if (e instanceof CalendarProviderError && e.kind === "not_found") return;
      throw e;
    }
  },
};
