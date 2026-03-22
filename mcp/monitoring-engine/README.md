# monitoring-engine (MCP)

Monitoring & observability tools for VantageStack:

## Tools

- `setup-error-tracking`: Adds Sentry environment keys and basic initialization guidance.
- `create-uptime-monitor`: Returns the centralized uptime-check endpoint (`/api/cron/uptime-check`) and a setup checklist.
- `configure-performance-alerts`: Confirms thresholds (warn \(>3s\), alert \(>10s\)) and where they’re enforced.
- `track-api-health`: Ensures health endpoints + cron checks exist.
- `monitor-database-performance`: Enables DB ping + slow-query thresholds and provides env checklist.
- `send-alert-to-telegram`: Sends a test alert to the configured Telegram chat.
- `generate-health-dashboard`: Points to `/monitoring` and `/api/monitoring/dashboard`.

## Notes

- Vercel Cron is used for hourly third‑party checks and daily Sentry digest.
- Telegram alerting uses `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` (or `TELEGRAM_DEFAULT_CHAT_ID`).

