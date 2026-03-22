# Weekly Report Automation

## Schedule

- **When**: Every Tuesday at 8:00am
- **How**: Vercel Cron hits `GET /api/cron/weekly-reports?secret=...`
- **Config**: `vercel.json` contains:
  - `path`: `/api/cron/weekly-reports`
  - `schedule`: `0 8 * * 2`

## Pipeline

For each **active** client in Postgres (`clients.status = 'active-client'` and `clients.last_active_at >= now() - 14 days`):

1) **Metrics rollup** (last 7 days)
   - Reads campaign data from the Postgres `reports` table (defaults to `report_type='campaign-daily'` with `source.visitors`, `source.new_leads`, `source.ad_spend_usd`, `source.revenue_attributed_usd`)
   - Computes week-over-week traffic trend (positive/negative/flat)

2) **Weekly report creation**
   - Generates an email body including:
     - Visitors, leads, conversion rate, CPL (if available), revenue attributed (if available)
     - Inline SVG chart for traffic trend (14 days)
     - Top 3 opportunities + upsell suggestion + CTA

3) **Delivery**
   - Sends via Resend (email only)

4) **Logging**
   - Inserts the weekly report into Postgres `reports` with:
     - `report_type = 'weekly-performance'`
     - `source.week_of` used to prevent duplicates
   - Inserts an automation run into `automation_runs`
   - Sends an internal Telegram summary (if configured)

## Storage

- Postgres tables: `reports`, `automation_runs`

## Required env

- `CRON_SECRET`
- `WEEKLY_PG_URL` (or reuse `BRIEFING_PG_URL`)
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- (optional) `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

## SQL overrides (optional)

If your schema differs, override the SQL used by weekly automation:

- `WEEKLY_SQL_ACTIVE_CLIENTS`
- `WEEKLY_SQL_WEEKLY_METRICS`
- `WEEKLY_SQL_TRAFFIC_TREND`

