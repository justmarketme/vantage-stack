import { jwtVerify } from "jose/jwt/verify";
import type { TeamRole } from "../admin/roles";
import { isTeamRole } from "../admin/roles";

const TYP = "crm";

export type CrmJwtPayload = {
  typ?: string;
  role?: string;
  un?: string;
  sv?: number;
  sub?: string;
  exp?: number;
};

/** Edge/Node: verify CRM member JWT (HS256) without pulling jose JWE stack into middleware. */
export async function verifyCrmJwtEdge(
  token: string,
  secret: Uint8Array,
): Promise<{ memberId: string; role: TeamRole; username: string; exp: number; sv: number } | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    const p = payload as CrmJwtPayload;
    if (p.typ !== TYP || typeof p.sub !== "string" || !p.sub) return null;
    if (!p.role || !isTeamRole(String(p.role))) return null;
    const exp = typeof p.exp === "number" ? p.exp : 0;
    if (!exp || Date.now() / 1000 >= exp) return null;
    const username = typeof p.un === "string" ? p.un : "";
    const sv = typeof p.sv === "number" && Number.isFinite(p.sv) ? p.sv : 0;
    return {
      memberId: p.sub,
      role: p.role as TeamRole,
      username,
      exp: exp * 1000,
      sv,
    };
  } catch {
    return null;
  }
}
