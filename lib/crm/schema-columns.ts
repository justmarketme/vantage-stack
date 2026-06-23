/**
 * BASE columns of `public.clients`, from the original table definition in
 * `mcp/database-architect/migrations/001_create_tables.sql`.
 *
 * Every OTHER column the app writes to `public.clients` must be created at runtime by
 * `ensureCrmSchema()` in `./db.ts` (the de-facto schema manager — there are no live
 * migration files). The drift-guard test `tests/unit/clients-schema-drift.test.ts`
 * enforces the invariant:
 *
 *   every column written by an INSERT/UPDATE must be a base column OR added by ensureCrmSchema().
 *
 * This is what prevents `column "<x>" of relation "clients" does not exist` 500s — the
 * exact class of bug that broke blueprint submit (current_website_status) and client
 * edits (website_enrichment). When you add a new clients column: add it here only if it
 * is a base column, otherwise add an `add column if not exists` line to ensureCrmSchema.
 */
export const CLIENT_BASE_COLUMNS = [
  "id",
  "owner_id",
  "name",
  "email",
  "whatsapp",
  "website_url",
  "industry",
  "revenue_range",
  "challenges",
  "competitors",
  "current_marketing",
  "tools_used",
  "monthly_budget",
  "success_goals",
  "status",
  "created_at",
  "updated_at",
] as const;
