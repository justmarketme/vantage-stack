# briefing-generator (MCP)

Morning Briefing Generator MCP server.

## What it does

Exposes tools to generate and deliver a daily exec briefing:

- `query-overnight-data`
- `identify-priorities`
- `detect-anomalies`
- `format-briefing`
- `send-telegram-briefing`

## Environment variables

Required:

- `BRIEFING_PG_URL` — Postgres connection URL.
- `TELEGRAM_BOT_TOKEN` — Telegram bot token.
- `TELEGRAM_CHAT_ID` — Chat/channel ID to send to.
- `BRIEFING_NEWS_API_KEY` — News API key for Google News-style scans (NewsAPI.org recommended).

Optional (SQL overrides):

- `BRIEFING_SQL_NEW_LEADS`
- `BRIEFING_SQL_AT_RISK_CLIENTS`
- `BRIEFING_SQL_UPSELL_OPPORTUNITIES`
- `BRIEFING_SQL_TASKS_DUE_TODAY`
- `BRIEFING_SQL_SYSTEM_ERRORS`
- `BRIEFING_SQL_ACTIVE_CLIENTS` — list active clients with industry + competitors (top 3).
- `BRIEFING_SQL_CLIENT_WEEKLY_METRICS` — weekly metrics + 7‑day averages for traffic/conversions/CPL.
- `BRIEFING_SQL_STORE_BRIEFING` — optional custom insert for storing the briefing record.

## Run locally

```bash
npm install
npm run mcp:briefing-generator
```

## Run the daily job (non-MCP)

This repo also includes a script you can schedule via cron/Task Scheduler:

```bash
npm run briefing:run
```

