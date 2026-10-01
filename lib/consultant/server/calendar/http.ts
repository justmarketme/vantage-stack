import { CALENDAR } from "./constants";
import { CalendarProviderError } from "./types";

/**
 * Plain-fetch plumbing shared by the Google and Microsoft clients (no SDKs).
 * Every non-2xx is turned into a CalendarProviderError CATEGORY; the response body is read only
 * to find an OAuth `error` code and is never logged, stored or rethrown.
 */

export function classifyStatus(status: number, oauthError?: string | null): CalendarProviderError {
  if (oauthError === "invalid_grant" || oauthError === "unauthorized_client" || oauthError === "invalid_client") {
    return new CalendarProviderError(oauthError === "invalid_grant" ? "auth" : "config", status);
  }
  if (status === 401 || status === 403) return new CalendarProviderError("auth", status);
  if (status === 404 || status === 410) return new CalendarProviderError("not_found", status);
  if (status === 409) return new CalendarProviderError("conflict", status);
  if (status === 408 || status === 425 || status === 429 || status >= 500) return new CalendarProviderError("transient", status);
  return new CalendarProviderError("invalid", status);
}

async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(CALENDAR.requestTimeoutMs), cache: "no-store" });
  } catch {
    // Network error or timeout — safe to retry later.
    throw new CalendarProviderError("transient", null);
  }
}

async function oauthErrorCode(res: Response): Promise<string | null> {
  try {
    const j = (await res.json()) as { error?: unknown };
    return typeof j.error === "string" ? j.error : null;
  } catch {
    return null;
  }
}

/** POST an application/x-www-form-urlencoded OAuth token request. */
export async function postForm<T>(url: string, form: Record<string, string>): Promise<T> {
  const res = await send(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(form).toString(),
  });
  if (!res.ok) throw classifyStatus(res.status, await oauthErrorCode(res));
  return (await res.json()) as T;
}

/** A JSON API call with a bearer token. Returns parsed JSON, or null for 204 / empty bodies. */
export async function bearerJson<T>(
  url: string,
  token: string,
  init: { method: string; body?: unknown; headers?: Record<string, string> },
): Promise<T | null> {
  const res = await send(url, {
    method: init.method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw classifyStatus(res.status);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : null;
}

export function tokenSetFrom(j: { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown }) {
  if (typeof j.access_token !== "string" || !j.access_token) throw new CalendarProviderError("invalid", null);
  const exp = Number(j.expires_in);
  return {
    accessToken: j.access_token,
    refreshToken: typeof j.refresh_token === "string" && j.refresh_token ? j.refresh_token : null,
    expiresInSec: Number.isFinite(exp) && exp > 0 ? exp : 3600,
  };
}
