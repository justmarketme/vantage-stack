import type { Sql } from "postgres";
import { decryptSecret, encryptSecret } from "../../auth/crypto";
import { CALENDAR_PROVIDERS, type CalendarConnection, type CalendarProvider } from "../../types";
import { txSql } from "../http";
import { iso } from "../util";
import { CALENDAR, CALENDAR_MESSAGES } from "./constants";
import { providerClient } from "./providers";
import { CalendarProviderError, type TokenSet } from "./types";

/**
 * Per-consultant calendar connections (`consultant_calendar_connections`).
 * Refresh and access tokens are stored ONLY encrypted (AES-256-GCM via `encryptSecret`, key
 * `cfg.calendar.tokenEncKey`); plaintext tokens exist only in memory for the duration of a call.
 */

type ConnRow = {
  provider: string;
  account_email: string | null;
  status: string;
  connected_at: Date | string | null;
  last_error: string | null;
};

export async function listConnections(db: Sql, memberId: string | null): Promise<CalendarConnection[]> {
  const rows = memberId
    ? await db<ConnRow[]>`
        select provider, account_email, status, connected_at, last_error
        from public.consultant_calendar_connections where consultant_id = ${memberId}::uuid`
    : [];
  return CALENDAR_PROVIDERS.map((provider) => {
    const r = rows.find((x) => x.provider === provider);
    if (!r) return { provider, accountEmail: null, status: "not_connected", connectedAt: null, lastError: null };
    return {
      provider,
      accountEmail: r.account_email,
      status: r.status === "error" ? "error" : "connected",
      connectedAt: iso(r.connected_at),
      lastError: r.status === "error" ? (r.last_error ?? CALENDAR_MESSAGES.reconnect) : null,
    };
  });
}

function expiresAt(t: TokenSet, now = Date.now()): Date {
  return new Date(now + t.expiresInSec * 1000);
}

/** Store (or replace) a connection after a successful OAuth exchange. */
export async function saveConnection(
  db: Sql,
  memberId: string,
  provider: CalendarProvider,
  tokens: TokenSet & { refreshToken: string },
  accountEmail: string | null,
): Promise<void> {
  await db`
    insert into public.consultant_calendar_connections
      (consultant_id, provider, account_email, refresh_token_enc, access_token_enc, access_expires_at,
       calendar_id, status, last_error, connected_at, updated_at)
    values (${memberId}::uuid, ${provider}, ${accountEmail}, ${encryptSecret(tokens.refreshToken)},
      ${encryptSecret(tokens.accessToken)}, ${expiresAt(tokens)}, 'primary', 'connected', null, now(), now())
    on conflict (consultant_id, provider) do update set
      account_email = excluded.account_email, refresh_token_enc = excluded.refresh_token_enc,
      access_token_enc = excluded.access_token_enc, access_expires_at = excluded.access_expires_at,
      calendar_id = 'primary', status = 'connected', last_error = null,
      connected_at = now(), updated_at = now()
  `;
}

/**
 * After (re)connecting, queue every upcoming scheduled meeting of this consultant for sync with
 * that provider, so meetings booked before the calendar was connected still land in it. The
 * retry cron picks the rows up within a minute. Any earlier unsynced row for this provider
 * (e.g. one that failed while the connection was broken) is reset to pending as well.
 */
export async function queueUpcomingMeetings(db: Sql, memberId: string, provider: CalendarProvider): Promise<number> {
  await db`
    update public.consultant_meeting_sync s set status = 'pending', attempts = 0, last_error = null,
      updated_at = now() - interval '1 day'
    from public.consultant_meetings m
    where s.meeting_id = m.id and m.consultant_id = ${memberId}::uuid and s.provider = ${provider} and s.status <> 'synced'
  `;
  const rows = await db`
    insert into public.consultant_meeting_sync (meeting_id, provider, status, attempts, last_error, updated_at)
    select m.id, ${provider}, 'pending', 0, null, now() - interval '1 day'
    from public.consultant_meetings m
    where m.consultant_id = ${memberId}::uuid and m.status = 'scheduled' and m.starts_at > now()
    on conflict (meeting_id, provider) do update set status = 'pending', attempts = 0, last_error = null,
      updated_at = now() - interval '1 day'
    returning meeting_id
  `;
  return rows.length;
}

/** Revoke (best effort) and delete. Sync rows for this provider go too — nothing left to retry. */
export async function removeConnection(db: Sql, memberId: string, provider: CalendarProvider): Promise<void> {
  const rows = await db<{ refresh_token_enc: string }[]>`
    select refresh_token_enc from public.consultant_calendar_connections
    where consultant_id = ${memberId}::uuid and provider = ${provider}
  `;
  if (rows[0]) {
    try {
      await providerClient(provider).revoke(decryptSecret(rows[0].refresh_token_enc));
    } catch {
      /* best effort — a key/decrypt problem must not block disconnecting */
    }
  }
  await db.begin(async (tx) => {
    const t = txSql(tx);
    await t`delete from public.consultant_calendar_connections where consultant_id = ${memberId}::uuid and provider = ${provider}`;
    await t`
      delete from public.consultant_meeting_sync s using public.consultant_meetings m
      where s.meeting_id = m.id and m.consultant_id = ${memberId}::uuid and s.provider = ${provider}
    `;
  });
}

export async function markConnectionError(db: Sql, memberId: string, provider: CalendarProvider): Promise<void> {
  await db`
    update public.consultant_calendar_connections
    set status = 'error', last_error = ${CALENDAR_MESSAGES.reconnect}, updated_at = now()
    where consultant_id = ${memberId}::uuid and provider = ${provider}
  `;
}

type TokenRow = {
  refresh_token_enc: string;
  access_token_enc: string | null;
  access_expires_at: Date | string | null;
  calendar_id: string;
  status: string;
};

export type ProviderAccess = { accessToken: string; calendarId: string };

/**
 * A usable access token for this consultant + provider, refreshing it when it is (nearly)
 * expired. Returns null when the consultant hasn't connected this provider, or the connection
 * is in the error state (they must reconnect). Throws CalendarProviderError("auth") when the
 * refresh token has been revoked — the connection is flagged so the UI asks to reconnect.
 */
export async function accessFor(db: Sql, memberId: string, provider: CalendarProvider): Promise<ProviderAccess | null> {
  const rows = await db<TokenRow[]>`
    select refresh_token_enc, access_token_enc, access_expires_at, calendar_id, status
    from public.consultant_calendar_connections
    where consultant_id = ${memberId}::uuid and provider = ${provider}
  `;
  const row = rows[0];
  if (!row || row.status === "error") return null;

  const exp = row.access_expires_at ? new Date(row.access_expires_at).getTime() : 0;
  if (row.access_token_enc && exp - CALENDAR.refreshSkewSec * 1000 > Date.now()) {
    try {
      return { accessToken: decryptSecret(row.access_token_enc), calendarId: row.calendar_id };
    } catch {
      /* fall through to a refresh */
    }
  }

  let refreshToken: string;
  try {
    refreshToken = decryptSecret(row.refresh_token_enc);
  } catch {
    await markConnectionError(db, memberId, provider);
    throw new CalendarProviderError("auth", null);
  }

  let fresh: TokenSet;
  try {
    fresh = await providerClient(provider).refresh(refreshToken);
  } catch (e) {
    if (e instanceof CalendarProviderError && e.kind === "auth") await markConnectionError(db, memberId, provider);
    throw e;
  }
  await db`
    update public.consultant_calendar_connections set
      access_token_enc = ${encryptSecret(fresh.accessToken)},
      access_expires_at = ${expiresAt(fresh)},
      refresh_token_enc = ${fresh.refreshToken ? encryptSecret(fresh.refreshToken) : row.refresh_token_enc},
      updated_at = now()
    where consultant_id = ${memberId}::uuid and provider = ${provider}
  `;
  return { accessToken: fresh.accessToken, calendarId: row.calendar_id };
}
