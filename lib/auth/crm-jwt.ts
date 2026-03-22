import { SignJWT } from "jose/jwt/sign";
import type { TeamRole } from "../admin/roles";

const TYP = "crm";

/** Same string used for JWT signing and middleware verification. */
export function crmAuthSecretRaw(): string {
  return (
    (process.env.CRM_JWT_SECRET || "").trim() ||
    (process.env.ADMIN_SESSION_SECRET || "").trim() ||
    (process.env.CRON_SECRET || "").trim()
  );
}

export function jwtSecretKey(): Uint8Array | null {
  const raw = crmAuthSecretRaw();
  if (!raw) return null;
  return new TextEncoder().encode(raw);
}

export async function signCrmMemberJwt(input: {
  memberId: string;
  role: TeamRole;
  username: string;
  sessionVersion: number;
  rememberMe: boolean;
}): Promise<string | null> {
  const secret = jwtSecretKey();
  if (!secret) return null;
  const exp = input.rememberMe ? "30d" : "24h";
  return new SignJWT({
    typ: TYP,
    role: input.role,
    un: input.username,
    sv: input.sessionVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.memberId)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(secret);
}

export { verifyCrmJwtEdge } from "./crm-jwt-verify";
