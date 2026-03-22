/**
 * Edge-safe session verification (middleware). Supports CRM JWT (HS256) + legacy HMAC cookies.
 */
import type { TeamRole } from "./roles";
import { TEAM_ROLES } from "./roles";
import { verifyCrmJwtEdge } from "../auth/crm-jwt-verify";

function hexFromBuffer(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function isTeamRoleEdge(s: string): s is TeamRole {
  return (TEAM_ROLES as readonly string[]).includes(s);
}

export type EdgeSession =
  | { kind: "legacy"; exp: number }
  | {
      kind: "member";
      exp: number;
      memberId: string;
      role: TeamRole;
      auth: "hmac" | "jwt";
      username?: string;
      sessionVersion?: number;
    };

export async function parseSessionEdge(token: string | undefined, secret: string): Promise<EdgeSession | null> {
  if (!token || !secret) return null;

  if (token.split(".").length === 3) {
    const key = new TextEncoder().encode(secret);
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

  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sigHex = token.slice(dot + 1);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const expectedHex = hexFromBuffer(sigBuf);
  if (!timingSafeEqualHex(expectedHex, sigHex)) return null;
  try {
    const pad = payload.length % 4 === 0 ? "" : "=".repeat(4 - (payload.length % 4));
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = JSON.parse(new TextDecoder().decode(bytes)) as {
      v?: number;
      exp?: number;
      mid?: string;
      role?: string;
    };
    if (json.v !== 1 && json.v !== 2) return null;
    if (typeof json.exp !== "number") return null;
    if (Date.now() > json.exp) return null;
    if (json.v === 1) return { kind: "legacy", exp: json.exp };
    if (typeof json.mid === "string" && json.mid && json.role && isTeamRoleEdge(json.role)) {
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

export async function verifyAdminSessionTokenEdge(token: string | undefined, secret: string): Promise<boolean> {
  const s = await parseSessionEdge(token, secret);
  return s != null;
}
