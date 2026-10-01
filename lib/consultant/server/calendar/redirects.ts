import { NextResponse } from "next/server";
import { consultantConfig } from "../../config";
import type { CalendarProvider } from "../../types";
import { CALENDAR } from "./constants";

/** Outcome flags the Settings screen reads from `?calendar=<provider>&status=<…>`. No details, ever. */
export type ConnectStatus = "connected" | "cancelled" | "error" | "unavailable";

/** Redirect the browser back to Settings; optionally clear the one-time nonce cookie. */
export function settingsRedirect(req: Request, provider: CalendarProvider | null, status: ConnectStatus, clearNonce = false): NextResponse {
  const base = consultantConfig().publicUrl || new URL(req.url).origin;
  const to = new URL(CALENDAR.settingsPath, base);
  if (provider) to.searchParams.set("calendar", provider);
  to.searchParams.set("status", status);
  const res = NextResponse.redirect(to, 302);
  res.headers.set("Cache-Control", "no-store");
  if (clearNonce) res.cookies.set(CALENDAR.nonceCookie, "", { path: "/api/consultant/calendar", maxAge: 0, httpOnly: true, sameSite: "lax" });
  return res;
}

/** Read one cookie from a Request's Cookie header (pure; no next/headers dependency). */
export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}
