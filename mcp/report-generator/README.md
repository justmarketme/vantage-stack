# Report Generator MCP (Agent 3)

This MCP server turns **Agent 2 research JSON** into a **markdown onboarding report**, then stores it in Postgres in a `reports` table.

## Tools

- `format-onboarding-report`
  - Input: `{ research_json: object }`
  - Output: JSON containing `{ health_score, markdown }`

- `generate-onboarding-report`
  - Input: `{ research_json: object, client_id?: string, pg_url?: string }`
  - Side effect: creates table `reports` if missing, inserts a row with:
    - `report_type = 'onboarding-report'`
    - `report_generated = true`
  - Output: JSON containing `{ id, created_at, health_score, markdown, ... }`

## Environment variables

The server needs a Postgres URL, provided via one of:

- `REPORTS_PG_URL` (preferred)
- `BRIEFING_PG_URL` (fallback)
- `WEEKLY_PG_URL` (fallback)

You can also pass `pg_url` directly to the tool.

## Running locally

From repo root:

```bash
npx tsx mcp/report-generator/server.ts
```

## Cursor MCP registration

Register an MCP server named `report-generator` pointing to the command above (stdio transport).

