import { consultantConfig } from "../../config";
import { CALENDAR_PROVIDERS, type CalendarProvider } from "../../types";
import { googleCalendar } from "./google";
import { microsoftCalendar } from "./microsoft";
import type { CalendarProviderClient } from "./types";

const CLIENTS: Record<CalendarProvider, CalendarProviderClient> = {
  google: googleCalendar,
  microsoft: microsoftCalendar,
};

export function isProvider(v: unknown): v is CalendarProvider {
  return typeof v === "string" && (CALENDAR_PROVIDERS as readonly string[]).includes(v);
}

/** Test seam: swap a provider client (unit/integration tests never hit the network). */
export function setProviderClientForTests(provider: CalendarProvider, client: CalendarProviderClient | null): void {
  CLIENTS[provider] = client ?? (provider === "google" ? googleCalendar : microsoftCalendar);
}

export function providerClient(provider: CalendarProvider): CalendarProviderClient {
  return CLIENTS[provider];
}

/** OAuth callback URL registered with Google Cloud / Entra. */
export function redirectUri(provider: CalendarProvider): string {
  return `${consultantConfig().publicUrl}/api/consultant/calendar/${provider}/callback`;
}

/** Connect is possible only when the provider app, the token key and the public URL are all set. */
export function connectConfigured(provider: CalendarProvider): boolean {
  const cfg = consultantConfig();
  return !!cfg.publicUrl && !!cfg.calendar.tokenEncKey && CLIENTS[provider].configured();
}
