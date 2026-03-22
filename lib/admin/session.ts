import { createHmac, timingSafeEqual } from "crypto";
import type { TeamRole } from "./roles";
import { isTeamRole } from "./roles";
import { jwtSecretKey, verifyCrmJwtEdge, signCrmMemberJwt } from "../auth/crm-jwt";

export const ADMIN_COOKIE = "vs_admin_session";

const SESSION_MS = 7 * 24 * 60 * 60 * 1000; // legacy HMAC

function secret(): string {
  const s =
    (process.env.ADMIN_SESSION_SECRET || "").trim() ||
    (process.env.CRON_SECRET || "").trim() ||
    "";
  return s;
}

export function adminPasswordConfigured(): boolean {
  return Boolean((process.env.CRM_ADMIN_PASSWORD || "").trim());
}

export function getAdminPassword(): string {
  return (process.env.CRM_ADMIN_PASSWORD || "").trim();
}

export type LegacySession = { kind: "legacy"; exp: number };
export type MemberSession = {
  kind: "member";
  exp: number;
  memberId: string;
  role: TeamRole;
  auth: "hmac" | "jwt";
  username?: string;
  sessionVersion?: number;
};
export type ParsedSession = LegacySession | MemberSession;

function signPayload(payload: string): string {
  const s = secret();
  const sig = createHmac("sha256", s).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

/** Legacy single-password login (treated as Super Admin everywhere). */
export function createAdminSessionToken(): string | null {
  const s = secret();
  if (!s) return null;
  const exp = Date.now() + SESSION_MS;
  const payload = Buffer.from(JSON.stringify({ v: 1 as const, exp }), "utf8").toString("base64url");
  return signPayload(payload);
}

/** @deprecated Prefer signMemberJwtCookie for new logins. */
export function createMemberSessionToken(memberId: string, role: TeamRole): string | null {
  const s = secret();
  if (!s) return null;
  const exp = Date.now() + SESSION_MS;
  const payload = Buffer.from(JSON.stringify({ v: 2 as const, exp, mid: memberId, role }), "utf8").toString("base64url");
  return signPayload(payload);
}

export async function signMemberJwtCookie(input: {
  memberId: string;
  role: TeamRole;
  username: string;
  sessionVersion: number;
  rememberMe: boolean;
}): Promise<string | null> {
  return signCrmMemberJwt(input);
}

function verifySignature(token: string): { payload: string; ok: boolean } {
  const s = secret();
  if (!s) return { payload: "", ok: false };
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return { payload: "", ok: false };
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", s).update(payload).digest("hex");
  try {
    if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"))) {
      return { payload, ok: false };
    }
  } catch {
    return { payload, ok: false };
  }
  return { payload, ok: true };
}

/** HMAC v1/v2 only (sync). */
export function parseAdminSessionHmac(token: string | undefined | null): ParsedSession | null {
  if (!token || typeof token !== "string") return null;
  const { payload, ok } = verifySignature(token);
  if (!ok) return null;
  try {
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      v?: number;
      exp?: number;
      mid?: string;
      role?: string;
    };
    if (typeof json.exp !== "number" || Date.now() > json.exp) return null;
    if (json.v === 1) return { kind: "legacy", exp: json.exp };
    if (json.v === 2 && typeof json.mid === "string" && json.mid && json.role && isTeamRole(json.role)) {
      return {
        kind: "member",
        exp: json.exp,
        memberId: json.mid,
        role: json.role,
        auth: "hmac",
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** JWT (crm) + HMAC fallback. */
export async function parseFullAdminSession(token: string | undefined | null): Promise<ParsedSession | null> {
  if (!token || typeof token !== "string") return null;
  const key = jwtSecretKey();
  if (key && token.split(".").length === 3) {
    const j = await verifyCrmJwtEdge(token, key);
    if (j) {
      return {
        kind: "member",
        exp: j.exp,
        memberId: j.memberId,
        role: j.role,
        auth: "jwt",
        username: j.username,
        sessionVersion: j.sv,
      };
    }
  }
  return parseAdminSessionHmac(token);
}

/** @deprecated Use parseFullAdminSession */
export function parseAdminSession(token: string | undefined | null): ParsedSession | null {
  return parseAdminSessionHmac(token);
}

export async function verifyAdminSessionTokenAsync(token: string | undefined | null): Promise<{ exp: number } | null> {
  const full = await parseFullAdminSession(token);
  if (!full) return null;
  return { exp: full.exp };
}

export function sessionRole(session: ParsedSession | null): TeamRole | null {
  if (!session) return null;
  if (session.kind === "legacy") return "super_admin";
  return session.role;
}
