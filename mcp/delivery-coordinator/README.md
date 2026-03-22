# delivery-coordinator (MCP)

Outbound delivery coordinator MCP server.

## What it does

Exposes tools for Agent 5 to deliver a client report via Email (Resend) and WhatsApp (Twilio), plus lightweight delivery logging + open tracking:

- `generate-email-template`
- `call-resend-api`
- `call-twilio-whatsapp-api`
- `log-delivery`
- `track-opens`

## Run locally

1) Install deps

```bash
npm install
```

2) Start the MCP server

```bash
npm run mcp:delivery-coordinator
```

## Notes

- Email opens are tracked by embedding a 1×1 pixel pointing at `NEXT_PUBLIC_APP_URL/api/track-open?delivery_id=...`.
- Delivery logs are stored locally at `data/delivery-logs.json` (you can swap this for a real DB later).

