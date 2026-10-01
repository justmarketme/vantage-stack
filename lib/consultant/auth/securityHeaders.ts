/**
 * Response hardening for the Consultant Portal (`/consultant/**` pages and
 * `/api/consultant/**`). Edge-safe (config.ts only reads process.env) — called from
 * `middleware.ts`.
 *
 * Why a non-nonce CSP: Next.js only stamps a per-request nonce onto its inline bootstrap
 * scripts when a page is dynamically rendered. The portal's pages are owned by another
 * module and may be statically prerendered, so a nonce policy would silently block their
 * hydration. `'unsafe-inline'` for scripts is therefore required; the protection this policy
 * buys is elsewhere and is real:
 *   - `connect-src` pins every fetch/WebSocket to this origin and Twilio — transcript or
 *     lead data cannot be exfiltrated to an arbitrary host by injected script;
 *   - `frame-ancestors 'none'` (clickjacking a "Call" button), `object-src 'none'`,
 *     `base-uri 'self'`, `form-action 'self'`.
 *
 * Twilio hosts, verified against the installed @twilio/voice-sdk 2.18 source:
 *   wss://voice-js.<edge>.twilio.com/signal  signalling (regions.ts)
 *   https://eventgw[.<region>].twilio.com    call-quality insights (eventpublisher.ts)
 *   https://sdk.twilio.com/js/client/sounds  ringtone/DTMF sounds, fetched by XHR (connect-src)
 *                                            and played via <audio> (media-src)
 * Media itself flows over WebRTC (DTLS-SRTP), which CSP does not govern.
 *
 * Supabase (wave 2), pinned to THIS project's host only — never `*.supabase.co`, which would
 * let injected script post data to any Supabase project an attacker owns:
 *   https://<ref>.supabase.co   Storage signed upload (fetch PUT → connect-src) and signed
 *                               view URLs for Why Board images / proof of payment (img-src,
 *                               media-src), Realtime REST
 *   wss://<ref>.supabase.co     Realtime broadcast websocket (nudges only, no data)
 * The host is derived at runtime from NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL (config.ts), so
 * a staging branch (its own ref) gets its own host automatically.
 *
 * Service worker: `/consultant-sw.js` registers with scope `/consultant/`. A worker's maximum
 * scope is its script's directory (`/`), so no `Service-Worker-Allowed` header is needed;
 * `worker-src 'self'` covers the registration.
 */

import { consultantConfig, type ConsultantConfig } from "../config";

/** Hosts the Twilio Voice JS SDK talks to. CSP `*.` matches subdomains at any depth. */
export const TWILIO_CONNECT_SOURCES = ["https://*.twilio.com", "wss://*.twilio.com"] as const;
export const TWILIO_MEDIA_SOURCES = ["https://sdk.twilio.com"] as const;
/** Fonts are pulled by the `@import` in app/globals.css. */
const FONT_STYLE_SOURCE = "https://fonts.googleapis.com";
const FONT_FILE_SOURCE = "https://fonts.gstatic.com";

/** Microphone for this origin only; everything the portal never needs is switched off. */
export const CONSULTANT_PERMISSIONS_POLICY =
  "microphone=(self), screen-wake-lock=(self), camera=(), geolocation=(), payment=(), usb=(), display-capture=()";

/** The Supabase URLs the browser talks to: Realtime (public URL) and Storage (server URL). */
export function consultantSupabaseUrls(cfg: ConsultantConfig = consultantConfig()): string[] {
  return [cfg.realtime.supabaseUrl, cfg.storage.supabaseUrl];
}

/**
 * Exact https + wss origins for the configured Supabase host(s). Invalid or non-https URLs
 * are dropped (plain http is allowed in development only, for a local Supabase stack).
 */
export function supabaseCspSources(urls: readonly string[], isDev = false): { http: string[]; ws: string[] } {
  const http = new Set<string>();
  const ws = new Set<string>();
  for (const raw of urls) {
    if (!raw) continue;
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      continue;
    }
    if (u.protocol === "https:") {
      http.add(`https://${u.host}`);
      ws.add(`wss://${u.host}`);
    } else if (isDev && u.protocol === "http:") {
      http.add(`http://${u.host}`);
      ws.add(`ws://${u.host}`);
    }
  }
  return { http: [...http], ws: [...ws] };
}

function withSources(base: string, sources: readonly string[]): string {
  return sources.length ? `${base} ${sources.join(" ")}` : base;
}

export function consultantContentSecurityPolicy(isDev: boolean, supabaseUrls: readonly string[] = []): string {
  const supa = supabaseCspSources(supabaseUrls, isDev);
  return [
    "default-src 'self'",
    // 'unsafe-eval' only in dev (React Fast Refresh). See the header comment for 'unsafe-inline'.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline' ${FONT_STYLE_SOURCE}`,
    `font-src 'self' data: ${FONT_FILE_SOURCE}`,
    // Signed Storage URLs (Why Board images, proof of payment) come from the Supabase host.
    withSources("img-src 'self' data: blob:", supa.http),
    // Recordings are streamed through our own authenticated proxy ('self'), never from Twilio.
    withSources(`media-src 'self' blob: ${TWILIO_MEDIA_SOURCES.join(" ")}`, supa.http),
    withSources(`connect-src 'self' ${TWILIO_CONNECT_SOURCES.join(" ")}`, [...supa.http, ...supa.ws, ...(isDev ? ["ws:"] : [])]),
    // 'self' covers /consultant-sw.js; blob: is kept for SDK-internal workers.
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/** Headers shared by portal pages and portal API responses. */
function baseHeaders(isProd: boolean): Record<string, string> {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
    ...(isProd ? { "Strict-Transport-Security": "max-age=63072000; includeSubDomains" } : {}),
  };
}

export function consultantPageHeaders(env: {
  isDev: boolean;
  isProd: boolean;
  supabaseUrls?: readonly string[];
}): Record<string, string> {
  return {
    ...baseHeaders(env.isProd),
    "Content-Security-Policy": consultantContentSecurityPolicy(env.isDev, env.supabaseUrls ?? []),
    "Permissions-Policy": CONSULTANT_PERMISSIONS_POLICY,
    "X-Frame-Options": "DENY",
  };
}

export function consultantApiHeaders(env: { isProd: boolean }): Record<string, string> {
  return baseHeaders(env.isProd);
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence-in-depth for cookie-authenticated portal writes. The session cookie is
 * SameSite=Lax, which stops cross-*site* POSTs but not cross-*origin* same-site ones (e.g. a
 * sibling subdomain). A browser always sends `Origin` on a cross-origin POST/PATCH/DELETE,
 * so a present Origin that is not this host is rejected. No Origin (server-to-server,
 * curl) falls through to the normal session check.
 */
export function isCrossOriginWrite(method: string, originHeader: string | null, requestHost: string | null): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return false;
  if (!originHeader) return false;
  if (originHeader === "null") return true;
  try {
    return new URL(originHeader).host.toLowerCase() !== (requestHost ?? "").toLowerCase();
  } catch {
    return true;
  }
}
