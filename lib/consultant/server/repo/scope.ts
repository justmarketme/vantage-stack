import type { Sql } from "postgres";
import type { ConsultantSession } from "../../auth/session";
import { MESSAGES } from "../constants";
import { fail } from "../http";

/**
 * Tenancy for every query. A consultant sees and acts on leads they own plus the unassigned
 * pool; managers (`view_clients`) see every Clinics lead. Calls and notes are visible exactly
 * when their lead is. The consultant id used for writes comes from the session, never a body.
 */
export type Scope = Pick<ConsultantSession, "memberId" | "isManager">;

/** SQL predicate over the `public.clients c` alias: the lead is visible to this session. */
export function leadVisible(db: Sql, s: Scope) {
  if (s.isManager) return db`true`;
  if (!s.memberId) return db`c.consultant_id is null`;
  return db`(c.consultant_id = ${s.memberId}::uuid or c.consultant_id is null)`;
}

/** The member id for a write; the legacy admin session (no member id) is read-only. */
export function writerId(s: Pick<ConsultantSession, "memberId">): string {
  if (!s.memberId) fail(403, MESSAGES.readOnly);
  return s.memberId;
}
