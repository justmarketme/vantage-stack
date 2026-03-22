# email-orchestrator (MCP)

Tools for the **CRM report review & delivery** workflow (VantageStack).

## Tools

| Tool | Purpose |
|------|---------|
| `build-review-page` | Returns the canonical Next.js route and API paths for the review UI. |
| `generate-email-html` | Builds responsive client HTML (video embed + report markdown + CTA) via `lib/email/report-client-html.ts`. |
| `send-via-resend` | POST to Resend `https://api.resend.com/emails/send` (requires `RESEND_API_KEY`). |
| `send-via-twilio` | POST to Twilio WhatsApp Messages API (requires Twilio env vars). |
| `generate-pdf` | Documents the PDF download route; generation uses `jspdf` in `lib/crm/report-pdf.ts`. |
| `schedule-send` | Documents scheduling + cron: `GET /api/cron/report-scheduled-send`. |
| `validate-recipients` | Validates primary + additional emails (same rules as CRM). |
| `store-send-event` | Documents `public.events` row shape for `report_sent`. |

## Run

```bash
npm run mcp:email-orchestrator
```

## Related app routes

- UI: `/crm/reports/:reportId/review`
- GET bundle: `GET /api/crm/reports/:reportId/review`
- Draft: `POST /api/crm/reports/:reportId/review/draft`
- Send: `POST /api/crm/reports/:reportId/review/send`
- Schedule: `POST /api/crm/reports/:reportId/review/schedule`
- PDF: `GET /api/crm/reports/:reportId/pdf`
- Public share: `/report/share/:token`
- Cron: `GET /api/cron/report-scheduled-send?secret=…` (or `Authorization: Bearer CRON_SECRET`)
