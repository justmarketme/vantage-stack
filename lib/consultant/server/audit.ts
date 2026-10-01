import type { Sql } from "postgres";
import { logError } from "./http";

/**
 * POPIA audit log — every Emma interaction and every sensitive access/change to pipeline data
 * (payment confirmation, proof view, settings, rewards, dead-letter retries, n8n ingress).
 *
 * `meta` holds ids, counts, flags and enum values ONLY — never a phone number, email, message
 * body or transcript text. Values are restricted to scalars by the type, and strings are capped.
 *
 * Never throws: an audit write failure is logged (tag + error class) and swallowed so it can't
 * break the business action — but when called with a transaction handle, a failed insert still
 * aborts that transaction (Postgres semantics), which is the safer outcome for in-tx audits.
 */
export type AuditActorKind = "member" | "system" | "n8n" | "twilio";

export type AuditEntry = {
  actorId: string | null;
  actorKind: AuditActorKind;
  action: string;
  entity: string;
  entityId?: string;
  meta?: Record<string, string | number | boolean | null>;
};

const MAX_META_STRING = 120;

/** Pure: trims meta strings so a mistake can't dump a large blob into the audit log. */
export function sanitiseMeta(meta: AuditEntry["meta"]): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(meta ?? {})) {
    out[k] = typeof v === "string" ? v.slice(0, MAX_META_STRING) : typeof v === "number" && !Number.isFinite(v) ? null : v;
  }
  return out;
}

export async function audit(db: Sql, entry: AuditEntry): Promise<void> {
  try {
    await db`
      insert into public.consultant_audit_log (actor_id, actor_kind, action, entity, entity_id, meta)
      values (${entry.actorId}::uuid, ${entry.actorKind}, ${entry.action}, ${entry.entity}, ${entry.entityId ?? null},
        ${db.json(sanitiseMeta(entry.meta) as never)})
    `;
  } catch (e) {
    logError(`audit.${entry.action}`, e);
  }
}
