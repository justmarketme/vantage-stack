import type { Sql } from "postgres";
import type { z } from "zod";
import type { Automation, AutomationKind, AutomationPatch } from "../../types";
import { seedAutomations } from "../automations";

interface AutomationRow {
  id: string;
  kind: AutomationKind;
  enabled: boolean;
  offset: number;
  body: string;
  content_sid: string;
}

export function toAutomation(r: AutomationRow): Automation {
  return { id: r.id, kind: r.kind, enabled: r.enabled, offset: r.offset, body: r.body, contentSid: r.content_sid };
}

/** Display order: the order a patient meets them. */
const ORDER: AutomationKind[] = ["new_lead_ack", "appointment_reminder", "no_show_followup", "recall"];

export async function listAutomations(sql: Sql, clinicId: string): Promise<Automation[]> {
  await seedAutomations(sql, clinicId);
  const rows = await sql<AutomationRow[]>`
    SELECT id, kind, enabled, "offset", body, content_sid FROM clinic_crm.automations WHERE clinic_id = ${clinicId}`;
  return rows.map(toAutomation).sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}

export async function getAutomation(sql: Sql, clinicId: string, kind: AutomationKind): Promise<Automation | null> {
  const [r] = await sql<AutomationRow[]>`
    SELECT id, kind, enabled, "offset", body, content_sid FROM clinic_crm.automations
     WHERE clinic_id = ${clinicId} AND kind = ${kind}`;
  return r ? toAutomation(r) : null;
}

export async function updateAutomation(
  sql: Sql,
  clinicId: string,
  id: string,
  patch: z.infer<typeof AutomationPatch>,
): Promise<Automation | null> {
  const [r] = await sql<AutomationRow[]>`
    UPDATE clinic_crm.automations SET
      enabled = coalesce(${patch.enabled ?? null}::boolean, enabled),
      "offset" = coalesce(${patch.offset ?? null}::int, "offset"),
      body = coalesce(${patch.body ?? null}::text, body),
      content_sid = coalesce(${patch.contentSid ?? null}::text, content_sid)
     WHERE clinic_id = ${clinicId} AND id = ${id}
    RETURNING id, kind, enabled, "offset", body, content_sid`;
  return r ? toAutomation(r) : null;
}
