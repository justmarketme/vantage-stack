import { NextResponse } from "next/server";
import { requireConsultant } from "@/lib/consultant/auth/session";
import { consultantConfig } from "@/lib/consultant/config";
import { queueUpcomingMeetings, saveConnection } from "@/lib/consultant/server/calendar/connections";
import { CALENDAR } from "@/lib/consultant/server/calendar/constants";
import { stateSecretFrom, verifyOAuthState } from "@/lib/consultant/server/calendar/oauthState";
import { connectConfigured, isProvider, providerClient, redirectUri } from "@/lib/consultant/server/calendar/providers";
import { readCookie, settingsRedirect } from "@/lib/consultant/server/calendar/redirects";
import { CalendarProviderError } from "@/lib/consultant/server/calendar/types";
import { connectConsultantDb, errorTag } from "@/lib/consultant/server/http";
import { auditSafe } from "@/lib/consultant/server/sideEffects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ provider: string }> };

/**
 * OAuth 2 redirect target. Checks the signed state (signature, expiry, same member, same
 * provider, nonce cookie), exchanges the code, stores the tokens ENCRYPTED with the account
 * email, and queues upcoming meetings for sync. The `code` / `state` never reach logs: only an
 * error category is logged, and the browser is redirected to Settings with a status flag.
 */
export async function GET(req: Request, ctx: Ctx) {
  const provider = (await ctx.params).provider;
  const s = await requireConsultant();
  if (s instanceof NextResponse) return s;
  if (!isProvider(provider)) return settingsRedirect(req, null, "error");
  if (!s.memberId || !connectConfigured(provider)) return settingsRedirect(req, provider, "unavailable", true);

  const url = new URL(req.url);
  if (url.searchParams.get("error")) return settingsRedirect(req, provider, "cancelled", true); // consent declined
  const code = url.searchParams.get("code");
  const check = verifyOAuthState(url.searchParams.get("state"), {
    secret: stateSecretFrom(consultantConfig().calendar.tokenEncKey),
    memberId: s.memberId,
    provider,
    nonce: readCookie(req, CALENDAR.nonceCookie),
  });
  if (!check.ok || !code || code.length > 4096) {
    console.warn(`[consultant] calendar callback rejected provider=${provider}`, check.ok ? "no_code" : check.reason);
    return settingsRedirect(req, provider, "error", true);
  }

  try {
    const client = providerClient(provider);
    const tokens = await client.exchangeCode(code, redirectUri(provider));
    if (!tokens.refreshToken) throw new CalendarProviderError("invalid", null); // no offline access granted
    const email = await client.accountEmail(tokens.accessToken).catch(() => null);
    const db = await connectConsultantDb();
    await saveConnection(db, s.memberId, provider, { ...tokens, refreshToken: tokens.refreshToken }, email);
    const queued = await queueUpcomingMeetings(db, s.memberId, provider);
    await auditSafe(db, {
      actorId: s.memberId,
      actorKind: "member",
      action: "calendar.connect",
      entity: "calendar_connection",
      entityId: provider,
      meta: { queuedMeetings: queued },
    });
    return settingsRedirect(req, provider, "connected", true);
  } catch (e) {
    console.warn(`[consultant] calendar connect failed provider=${provider}`, errorTag(e), e instanceof CalendarProviderError ? e.kind : "");
    return settingsRedirect(req, provider, "error", true);
  }
}
