# scheduler-engine (MCP)

Tools to manage VantageStack cron orchestration.

## Tools

- `set-timezone`: Set scheduler timezone (stored in `data/scheduler-config.json`). Default: `UTC`.
- `create-cron-job`: Upsert a Vercel Cron entry in `vercel.json`.
- `schedule-research-batch`: Ensure research batch cron exists (`/api/cron/research-batch`, `0 2 * * *`).
- `schedule-morning-briefing`: Ensure morning briefing cron exists (`/api/cron/morning-briefing`, `15 5 * * *`).
- `schedule-weekly-reports`: Ensure weekly reports cron exists (`/api/cron/weekly-reports`, `0 8 * * 2`).
- `monitor-job-execution`: Return a dashboard snapshot (jobs + next run + last status/error).

## Notes

- Scheduling is implemented via **Vercel Cron** calling Next.js API routes.
- Cron execution logs are stored in Postgres if a DB URL is configured (recommended), otherwise in `data/scheduler_job_runs.json`.

