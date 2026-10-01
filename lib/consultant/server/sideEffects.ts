import type { Sql } from "postgres";
import { audit } from "./audit";
import { kickDispatch } from "./events/dispatch";
import { errorTag } from "./http";

/**
 * Post-commit side effects for 3B's repos (meetings, goals, calendar, uploads, imports).
 * Neither may ever fail the request that already committed: the outbox rows are safely in the
 * database (the dispatch cron delivers them regardless), and an audit write failing is logged.
 */

type AuditEntry = Parameters<typeof audit>[1];

/** Nudge the event dispatcher to deliver the outbox rows this request's triggers wrote. */
export function kick(): void {
  try {
    kickDispatch();
  } catch (e) {
    // e.g. called outside a request scope (scripts): the cron delivers within a minute.
    console.warn("[consultant] dispatch kick skipped", errorTag(e));
  }
}

/** POPIA audit trail entry (ids and counts only — never PII). Never throws. */
export async function auditSafe(db: Sql, entry: AuditEntry): Promise<void> {
  try {
    await audit(db, entry);
  } catch (e) {
    console.warn("[consultant] audit write failed", errorTag(e));
  }
}
