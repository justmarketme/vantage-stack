## analytics-engine (MCP)

Business intelligence + analytics tooling for VantageStack.

### Tools

- `track-client-events`: Store client-journey events (blueprint → report → proposal → activation → upsell).
- `calculate-business-metrics`: Compute daily/weekly business KPIs (pipeline, conversion, timing, revenue).
- `generate-revenue-charts`: Produce chart-ready datasets (MRR, pipeline value, forecast).
- `analyze-funnel-conversion`: Funnel step counts + conversion rates.
- `export-reports`: Export metrics + charts as CSV (and a basic PDF summary).
- `build-analytics-dashboard`: Returns local dashboard routes and configuration hints.

### Database

Requires the `public.events` table. Apply migrations in `mcp/database-architect/migrations/004_analytics_events.sql` (and follow-ons if added).

Environment variables supported (in priority order):

- `DATABASE_URL`
- `SUPABASE_DB_URL`
- `REPORTS_PG_URL` / `BRIEFING_PG_URL` / `WEEKLY_PG_URL`

