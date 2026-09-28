import type { Sql } from "postgres";
import { AUTOMATION_KINDS } from "../types";
import { AUTOMATION_DEFAULTS } from "./config";

export { AUTOMATION_DEFAULTS };

/**
 * Seeds the four default automations for a clinic (disabled, SA-English bodies).
 * Idempotent: existing rows — including any the practice edited — are never touched.
 */
export async function seedAutomations(sql: Sql, clinicId: string): Promise<void> {
  const rows = AUTOMATION_KINDS.map((k) => AUTOMATION_DEFAULTS[k]);
  const kinds = rows.map((r) => r.kind);
  const enabled = rows.map((r) => r.enabled);
  const offsets = rows.map((r) => r.offset);
  const bodies = rows.map((r) => r.body);
  await sql`
    INSERT INTO clinic_crm.automations (clinic_id, kind, enabled, "offset", body)
    SELECT ${clinicId}, k, e, o, b
      FROM unnest(${sql.array(kinds)}::text[], ${sql.array(enabled)}::boolean[],
                  ${sql.array(offsets)}::int[], ${sql.array(bodies)}::text[]) AS t(k, e, o, b)
    ON CONFLICT (clinic_id, kind) DO NOTHING`;
}
