# telegram-orchestrator (MCP)

Telegram Bot Controller MCP server.

## What it does

Exposes tools to run a real Telegram bot (long polling) that you can control from your phone. It routes slash commands to CRM queries and agent triggers, then responds with clean Markdown formatting + emojis.

Tools:

- `create-telegram-bot`
- `register-commands`
- `handle-user-input`
- `query-crm-data`
- `trigger-agent-tasks`
- `send-formatted-messages`

Supported commands (expected by your Cursor agent prompt):

- `/briefing` (pull today’s morning briefing)
- `/client [name]` (full client profile + latest report)
- `/pipeline` (kanban-style pipeline status)
- `/trigger-report [client_id]` (kick off a research+report cycle)
- `/upsells` (pending upsells + projected revenue)
- `/leads` (latest lead scrape results)
- `/revenue` (current MRR + pipeline value)
- `/tasks` (all tasks due today)

## Run locally

1) Install deps

```bash
npm install
```

2) Start the MCP server

```bash
npm run mcp:telegram-orchestrator
```

## BotFather setup (Telegram)

- Create your bot with BotFather: `/newbot`
- Copy the token into `.env.local` as `TELEGRAM_BOT_TOKEN`
- Send any message to your bot, then open:
  `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
  and copy the `chat.id` into `.env.local` as `TELEGRAM_CHAT_ID` (or `TELEGRAM_DEFAULT_CHAT_ID`)

3) In an MCP client, call:

- `create-telegram-bot` (starts polling + “live and listening”)
- `register-commands` (registers slash commands with Telegram)

## Environment variables

Add these to `.env.local` (or set them in your environment):

- `TELEGRAM_BOT_TOKEN`: your bot token
- `TELEGRAM_DEFAULT_CHAT_ID`: optional default chat id for sending messages
- `BRIEFING_PG_URL`: Postgres URL used for CRM queries (can also use `REPORTS_PG_URL` / `WEEKLY_PG_URL`)
- `RESEARCH_AGENT_WEBHOOK_URL`: optional webhook to trigger Agent 2 research directly (used by `/trigger-report`)

## CRM / DB queries

`query-crm-data` uses Postgres (prefers `BRIEFING_PG_URL`) and runs simple default queries against:

- `briefings` (for `/briefing`)
- `clients` + `reports` (for `/client`)
- `upsell_opportunities` (for `/upsells`)
- `leads` (for `/leads`)
- `revenue_snapshots` (for `/revenue`)
- `tasks` (for `/tasks`)

If your schema differs, set SQL overrides via env:

- `TELEGRAM_SQL_BRIEFING_TODAY`
- `TELEGRAM_SQL_CLIENT_BY_NAME`
- `TELEGRAM_SQL_LATEST_REPORT_FOR_CLIENT`
- `TELEGRAM_SQL_PIPELINE_KANBAN`
- `TELEGRAM_SQL_PENDING_UPSELLS`
- `TELEGRAM_SQL_LATEST_LEADS`
- `TELEGRAM_SQL_REVENUE_SNAPSHOT`
- `TELEGRAM_SQL_TASKS_DUE_TODAY`

