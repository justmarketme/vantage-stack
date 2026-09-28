/**
 * QA regression: POPIA erasure left the patient's unsent message draft
 * (staff_state key `draft:<patientId>`) behind, because staff_state is not FK-linked
 * to patients and so doesn't cascade.
 */
import type { Sql } from "postgres";
import { deletePatient } from "../../../../lib/clinic-crm/server/repo/patients";

function fakeSql(deletedRows: unknown[]) {
  const calls: { text: string; values: unknown[] }[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    return Promise.resolve(text.startsWith("DELETE FROM clinic_crm.patients") ? deletedRows : []);
  }) as unknown as Sql;
  return { sql, calls };
}

const CLINIC = "11111111-1111-4111-8111-111111111111";
const PATIENT = "22222222-2222-4222-8222-222222222222";

describe("QA: erasure removes the patient's message drafts", () => {
  it("deletes draft:<id> for this clinic's staff after the patient row", async () => {
    const { sql, calls } = fakeSql([{ id: PATIENT }]);
    await expect(deletePatient(sql, CLINIC, PATIENT)).resolves.toBe(true);
    const drafts = calls.find((c) => c.text.startsWith("DELETE FROM clinic_crm.staff_state"));
    expect(drafts).toBeDefined();
    expect(drafts!.values).toEqual([`draft:${PATIENT}`, CLINIC]);
    expect(drafts!.text).toMatch(/staff_id IN \(SELECT id FROM clinic_crm\.staff WHERE clinic_id = \?\)/);
  });

  it("touches nothing else when the patient isn't in this clinic", async () => {
    const { sql, calls } = fakeSql([]);
    await expect(deletePatient(sql, CLINIC, PATIENT)).resolves.toBe(false);
    expect(calls).toHaveLength(1);
  });
});
