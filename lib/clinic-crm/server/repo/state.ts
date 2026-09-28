import type { Sql } from "postgres";

/**
 * Cross-device continuity blobs. Keyed by staff id from the session; staff belong
 * to exactly one clinic, so the clinic id is asserted too (defence in depth).
 */
export async function getState(sql: Sql, clinicId: string, staffId: string, key: string): Promise<unknown | null> {
  const [r] = await sql<{ value: unknown }[]>`
    SELECT s.value FROM clinic_crm.staff_state s
      JOIN clinic_crm.staff st ON st.id = s.staff_id AND st.clinic_id = ${clinicId}
     WHERE s.staff_id = ${staffId} AND s.key = ${key}`;
  return r ? r.value : null;
}

export async function putState(sql: Sql, clinicId: string, staffId: string, key: string, value: unknown): Promise<void> {
  await sql`
    INSERT INTO clinic_crm.staff_state (staff_id, key, value, updated_at)
    SELECT st.id, ${key}, ${sql.json((value ?? null) as never)}, now()
      FROM clinic_crm.staff st WHERE st.id = ${staffId} AND st.clinic_id = ${clinicId}
    ON CONFLICT (staff_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
}
