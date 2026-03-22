# Research Orchestrator MCP (Agent 2)

This MCP server is the **competitive intelligence engine**. It accepts a client profile, gathers free/public signals (Tranco rank, optional OpenPageRank, on-page keyword extraction) plus Whois and Google PageSpeed, repeats the process for competitor domains, and returns a structured research JSON.

It also stores the research JSON in Postgres in the `reports` table with:

- `report_type = 'onboarding'`
- `research_complete = true`

## Tools

- `call-similarweb-api` (deprecated; kept for back-compat)
- `call-semrush-api` (deprecated; kept for back-compat)
- `call-tranco-rank`
- `call-openpagerank`
- `call-whois-api`
- `call-pagespeed-api`
- `aggregate-competitor-data` (end-to-end orchestrator + DB write)
- `structure-research-output`

## Environment variables

### Database (required to store results)

- `REPORTS_PG_URL` (preferred)
- `BRIEFING_PG_URL` (fallback)
- `WEEKLY_PG_URL` (fallback)

### API configuration

Free-only mode uses:

- `OPENPAGERANK_API_KEY` (optional; enables authority-like score)
- `WHOIS_BASE_URL` (optional; legacy gateway mode expects `{base}/lookup?domain=...&api_key=...`)
- `WHOIS_API_KEY` (optional)
- `PAGESPEED_API_KEY` (optional, uses Google PageSpeed public endpoint)

## Running locally

```bash
npx tsx mcp/research-orchestrator/server.ts
```

## Notes

- The orchestrator throttles calls with a small delay (default `delay_ms = 1000`) to reduce rate-limit risk.
- If any upstream API call fails, the error is recorded and the pipeline continues.

