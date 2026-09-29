/**
 * Clinic CRM session token — EDGE-SAFE (jose only; no postgres, no node:crypto).
 * Imported by middleware.ts and by the Node-side session helpers.
 *
 * The cookie carries a short-lived HS256 JWT. The middleware trusts the signature
 * alone (it cannot reach the database); every API route then re-checks the staff
 * row via `requireSession`, so a deleted staff member is locked out on their very
 * next API call even though their cookie is still cryptographically valid.
 */
import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";
import type { Session, StaffRole } from "../types";

export const SESSION_COOKIE = "vs_clinic_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
export const MIN_SECRET_LENGTH = 32;

const TYP = "clinic-crm";
const ISSUER = "vantage-stack/clinic-crm";
const ROLES: readonly StaffRole[] = ["owner", "manager", "reception"];

/** The signing key, or null when the secret is missing or too short (fail closed). */
export function sessionSecret(): Uint8Array | null {
  const raw = (process.env.CLINIC_CRM_SESSION_SECRET || "").trim();
  if (raw.length < MIN_SECRET_LENGTH) return null;
  return new TextEncoder().encode(raw);
}

export async function signSessionToken(session: Session, secret: Uint8Array): Promise<string> {
  return new SignJWT({
    typ: TYP,
    cid: session.clinicId,
    role: session.role,
    nm: session.name,
    cn: session.clinicName,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setSubject(session.staffId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret);
}

/** Maps verified JWT claims to a Session; null for anything malformed. Pure — unit-tested. */
export function claimsToSession(p: Record<string, unknown>): Session | null {
  if (p.typ !== TYP) return null;
  const { sub, cid, role, nm, cn } = p;
  if (typeof sub !== "string" || !sub) return null;
  if (typeof cid !== "string" || !cid) return null;
  if (typeof role !== "string" || !(ROLES as readonly string[]).includes(role)) return null;
  return {
    staffId: sub,
    clinicId: cid,
    role: role as StaffRole,
    name: typeof nm === "string" ? nm : "",
    clinicName: typeof cn === "string" ? cn : "",
  };
}

/** Signature + expiry + claim shape. Never throws. */
export async function verifySessionToken(
  token: string | undefined | null,
  secret: Uint8Array | null = sessionSecret(),
): Promise<Session | null> {
  if (!token || !secret) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"], issuer: ISSUER });
    return claimsToSession(payload as Record<string, unknown>);
  } catch {
    return null;
  }
}
