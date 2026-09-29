/**
 * Clinic CRM edge gate — called from the root middleware.ts for /clinic-crm/** and
 * /api/clinic-crm/**. EDGE-SAFE: no database, no node:crypto.
 *
 * Layers:
 *  1. Authentication by cookie signature (the DB re-check happens in requireSession).
 *  2. Cross-site request rejection on state-changing API calls (defence in depth on
 *     top of SameSite=Lax).
 *  3. Security headers on every response: noindex, no-store, nonce-based CSP,
 *     frame-ancestors none, strict referrer, microphone limited to self (dictation).
 *
 * Public by design (each validates its caller in-route):
 *   /clinic-crm/login, POST auth/login, POST auth/logout,
 *   /api/clinic-crm/webhooks/*  (X-Twilio-Signature), /api/clinic-crm/cron/* (Bearer CRON_SECRET).
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./token";

export const CLINIC_CRM_PAGE_PREFIX = "/clinic-crm";
export const CLINIC_CRM_API_PREFIX = "/api/clinic-crm";
export const CLINIC_CRM_LOGIN_PAGE = "/clinic-crm/login";

function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + "/");
}

export function isClinicCrmPath(path: string): boolean {
  return under(path, CLINIC_CRM_PAGE_PREFIX) || under(path, CLINIC_CRM_API_PREFIX);
}

/** Endpoints that authenticate their caller themselves (signature / bearer), not by cookie. */
export function isMachineApi(path: string): boolean {
  return under(path, `${CLINIC_CRM_API_PREFIX}/webhooks`) || under(path, `${CLINIC_CRM_API_PREFIX}/cron`);
}

export function isPublicClinicCrmPath(path: string, method: string): boolean {
  if (under(path, CLINIC_CRM_LOGIN_PAGE)) return true;
  if (path === `${CLINIC_CRM_API_PREFIX}/auth/login` && method === "POST") return true;
  // Logout must work with an expired/invalid cookie so the browser can always clear it.
  if (path === `${CLINIC_CRM_API_PREFIX}/auth/logout` && method === "POST") return true;
  return isMachineApi(path);
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * true when a state-changing browser request comes from another site. Requests
 * without Origin / Sec-Fetch-Site (curl, server-to-server) pass — they carry no
 * ambient cookie risk, and still need a valid session cookie to do anything.
 */
export function isCrossSiteWrite(req: NextRequest): boolean {
  if (SAFE_METHODS.has(req.method)) return false;
  if (req.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const host = req.headers.get("host") || req.nextUrl.host;
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

export function contentSecurityPolicy(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // No nonce here on purpose: a nonce makes browsers ignore 'unsafe-inline', and React
    // `style={{…}}` attributes (e.g. the goals whiteboard positions) need it.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

function applySecurityHeaders(res: NextResponse, csp: string | null): NextResponse {
  const h = res.headers;
  h.set("x-robots-tag", "noindex, nofollow");
  h.set("Cache-Control", "no-store, max-age=0");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "DENY");
  h.set("Permissions-Policy", "microphone=(self), camera=(), geolocation=(), payment=(), usb=()");
  if (process.env.NODE_ENV === "production") {
    h.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  }
  if (csp) h.set("Content-Security-Policy", csp);
  return res;
}

function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function clinicCrmMiddleware(request: NextRequest): Promise<NextResponse> {
  const path = request.nextUrl.pathname;
  const method = request.method;
  const isApi = under(path, CLINIC_CRM_API_PREFIX);

  if (isApi) {
    if (!isMachineApi(path) && isCrossSiteWrite(request)) {
      return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }), null);
    }
    if (!isPublicClinicCrmPath(path, method)) {
      const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
      if (!session) {
        return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), null);
      }
    }
    return applySecurityHeaders(NextResponse.next(), null);
  }

  // Pages
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const onLogin = under(path, CLINIC_CRM_LOGIN_PAGE);

  if (!session && !onLogin) {
    const url = request.nextUrl.clone();
    url.pathname = CLINIC_CRM_LOGIN_PAGE;
    url.search = "";
    url.searchParams.set("next", path); // a path only — never PII
    return applySecurityHeaders(NextResponse.redirect(url), null);
  }
  if (session && onLogin) {
    const url = request.nextUrl.clone();
    url.pathname = CLINIC_CRM_PAGE_PREFIX;
    url.search = "";
    return applySecurityHeaders(NextResponse.redirect(url), null);
  }

  // Nonce CSP: Next.js reads the nonce from the request's CSP header and stamps it on
  // its own scripts. This requires the /clinic-crm pages to be dynamically rendered.
  const nonce = newNonce();
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  return applySecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), csp);
}
