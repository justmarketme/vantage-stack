import type { Sql } from "postgres";
import { connectCrmDb } from "@/lib/crm/db";
import { ensureClinicCrmSchema } from "./schema";

/**
 * The Clinic CRM shares the app's single pooled Postgres connection (the pooler
 * caps connections, so a second pool would compete with the rest of the site)
 * and makes sure its own schema exists before the first query.
 *
 * Tenancy rule: every query against clinic_crm.* MUST filter on a clinic_id that
 * came from the verified session (or, for webhooks, from the Twilio `To` number) —
 * never from a request body or query string.
 */
export async function clinicDb(): Promise<Sql> {
  const db = await connectCrmDb();
  if (!db) throw new Error("Clinic CRM database is not configured");
  await ensureClinicCrmSchema(db);
  return db;
}

/** Append-only POPIA accountability record. Failures are logged, never thrown into the request. */
export async function audit(
  db: Sql,
  clinicId: string,
  actor: string,
  action: string,
  entity: string,
  entityId?: string,
): Promise<void> {
  try {
    await db`INSERT INTO clinic_crm.audit_log (clinic_id, actor, action, entity, entity_id)
             VALUES (${clinicId}, ${actor}, ${action}, ${entity}, ${entityId ?? null})`;
  } catch (e) {
    console.error("[clinic-crm] audit write failed", (e as Error).message);
  }
}
