import { NextResponse } from "next/server";
import { requireConsultant } from "@/lib/consultant/auth/session";
import { consultantConfig } from "@/lib/consultant/config";
import { CALENDAR } from "@/lib/consultant/server/calendar/constants";
import { createOAuthState, newNonce, stateSecretFrom } from "@/lib/consultant/server/calendar/oauthState";
import { connectConfigured, isProvider, providerClient, redirectUri } from "@/lib/consultant/server/calendar/providers";
import { settingsRedirect } from "@/lib/consultant/server/calendar/redirects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ provider: string }> };

/**
 * Start the OAuth 2 authorisation-code flow: mint a signed, 10-minute `state` bound to this
 * member + provider + a nonce held in an HttpOnly cookie, then send the browser to the provider.
 * Browser navigation, so failures redirect back to Settings with a status (never JSON/raw errors).
 */
export async function GET(req: Request, ctx: Ctx) {
  const provider = (await ctx.params).provider;
  const s = await requireConsultant();
  if (s instanceof NextResponse) return s;
  if (!isProvider(provider)) return settingsRedirect(req, null, "error");
  if (!s.memberId) return settingsRedirect(req, provider, "error");
  if (!connectConfigured(provider)) return settingsRedirect(req, provider, "unavailable");

  const nonce = newNonce();
  const state = createOAuthState({
    secret: stateSecretFrom(consultantConfig().calendar.tokenEncKey),
    memberId: s.memberId,
    provider,
    nonce,
  });
  const res = NextResponse.redirect(providerClient(provider).authorizeUrl(state, redirectUri(provider)), 302);
  res.headers.set("Cache-Control", "no-store");
  res.cookies.set(CALENDAR.nonceCookie, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // must survive the top-level redirect back from the provider
    path: "/api/consultant/calendar",
    maxAge: CALENDAR.stateTtlSec,
  });
  return res;
}
