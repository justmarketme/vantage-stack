# database-architect (MCP)

Database schema + Supabase Postgres setup tools for VantageStack.

## Tools

- `create-supabase-project`
  - Best-effort helper to create (or describe) a Supabase project.
  - Output: JSON with detected/created project details (or an actionable error if credentials are missing).

- `execute-sql-migration`
  - Execute a single SQL migration (by `sql` or `migration_path`) or run all bundled migrations in order.

- `set-row-level-security`
  - Enables RLS and creates ownership-based policies (Supabase `auth.uid()`).

- `create-indexes`
  - Creates performance indexes on `client_id`, `status`, and `created_at` (where relevant).

- `validate-schema`
  - Verifies required tables, columns, RLS state, and indexes exist.

- `backup-database`
  - Creates a local `./backups/*.dump` using `pg_dump` (must be installed and on PATH).

## Environment variables

- **Database connection**
  - `DATABASE_URL` (preferred)
  - or `SUPABASE_DB_URL`
  - or `REPORTS_PG_URL` / `BRIEFING_PG_URL` / `WEEKLY_PG_URL` (fallbacks used elsewhere in this repo)

- **Supabase project creation (optional; only needed for `create-supabase-project`)**
  - `SUPABASE_ACCESS_TOKEN`
  - `SUPABASE_ORG_ID`
  - `SUPABASE_PROJECT_NAME` (default: `vantage-stack`)
  - `SUPABASE_REGION` (default: `us-east-1`)

## Running locally

```bash
npm run mcp:database-architect
```

Then register an MCP named `database-architect` pointing to that command (stdio transport).

