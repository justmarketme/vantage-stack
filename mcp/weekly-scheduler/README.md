# weekly-scheduler (MCP)

Weekly report automation MCP server.

## What it does

Exposes orchestration tools for a recurring pipeline:

- `trigger-research-agent` (Agent 2) → fetch fresh client research JSON
- `trigger-report-generator` (Agent 3) → generate weekly markdown report
- `trigger-delivery` (Agent 5) → deliver via email + WhatsApp (webhook-based)
- `schedule-cron-job` → write/update `vercel.json` cron entry
- `log-automation-run` → append a run record to `data/automation_runs.json`

The pipeline persists a `weekly_reports` table:

- If `WEEKLY_PG_URL` (or `BRIEFING_PG_URL`) is set: Postgres tables `weekly_reports` + `automation_runs` are created automatically (if missing).
- Otherwise: JSON fallback files `data/weekly_reports.json` + `data/automation_runs.json`.

## Run locally

```bash
npm install
npm run mcp:weekly-scheduler
```

## Required env

- `RESEARCH_AGENT_WEBHOOK_URL`: webhook that returns Agent 2 research JSON
- `DELIVERY_AGENT_WEBHOOK_URL`: webhook that performs delivery (email/WhatsApp)
- `CRON_SECRET`: used by the cron API route
- (optional) `WEEKLY_REPORTS_TZ`: timezone label used for logging only

