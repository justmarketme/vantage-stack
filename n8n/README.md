# n8n workflows for the Consultant Portal

These files are **generated** — don't edit them in n8n and expect the changes to survive.
Change the source, re-export, re-import:

| File | Generated from | What it does |
|---|---|---|
| `vantage-emma-sequences.workflow.json` | `ai-configs/emma/sequences.ts` | Receives every signed platform event, plans Emma's follow-up steps, waits until each is due, then asks the app to send it. |
| `vantage-emma-digest.workflow.json` | `scripts/emma-n8n-export.ts` | Weekdays 17:30 SAST: asks Jono's EMMA to send the daily digest. |
| `vantage-lead-prospecting-serper.workflow.json` | `scripts/emma-n8n-export.ts` | Mondays 07:00 SAST: Serper Maps search for aesthetic clinics in SA cities → Clinics pool. A template for Apollo / Tavily / Exa workflows too. |

```bash
npm run emma:n8n-export   # rewrites the three files from the app's config
```

## How the pieces fit

- **n8n only handles timing.** It never decides *whether* to message a clinic. When a step is due
  it calls `POST /api/webhooks/n8n-ingress` with `emma.send`, the event id and the step's stop
  conditions. The app then checks, against live data, whether the clinic replied, the meeting
  moved, the deal advanced or was lost, or the clinic opted out, and whether Emma has consent at
  all (`lib/consultant/server/events/stopConditions.ts`, `lib/consultant/server/emma/consent.ts`).
  A step that no longer makes sense comes back `{ skipped: "stop_condition", stop: "…" }`.
- **Every hop is signed** (`X-VS-Signature`, HMAC-SHA256 over the raw body, 300 s window), the
  same scheme as `lib/consultant/auth/signing.ts`. Unit tests run the generated n8n code against
  the app's real signing and contract (`tests/unit/consultant/server/wave2/n8nExport.test.ts`).
- **Replays are harmless.** Each step's idempotency key is `<event id>:<sequence>:<step>`; the app
  answers a repeat from `consultant_ingress_keys` without sending again.

## One-time setup in n8n

1. **Environment of the n8n instance** (self-hosted: `.env` / Docker env). The Code nodes read
   these with `$env`; on n8n Cloud, environment access from Code nodes may be restricted by your
   plan, so check that first:
   - `N8N_SIGNING_SECRET`: same value as the portal's `N8N_SIGNING_SECRET` in Vercel.
   - `VANTAGE_APP_URL`: the portal's public URL, no trailing slash (e.g. `https://vantagestack.co.za`).
   - `EMMA_URL`: `https://emmadoesit.cloud`.
   - `N8N_TRIGGER_SECRET`: same value as on EMMA's server.
   - `NODE_FUNCTION_ALLOW_BUILTIN=crypto` and `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`: the Code
     nodes sign and verify with Node's `crypto` and read the secret from the environment
     (Code nodes cannot read stored credentials).
2. **Import** each file: Workflows → Import from File.
3. **Credentials:** in the Serper workflow, create a *Header Auth* credential named
   "Serper API key (X-API-KEY)" with header `X-API-KEY` and your Serper key. Apollo, Tavily and
   Exa keys also live in n8n credentials, never in Vercel.
4. **Connect the portal to n8n:** open the *Emma follow-up sequences* workflow, copy the
   **production** URL of its "Portal event (signed)" webhook, and set it as `N8N_EVENTS_WEBHOOK_URL`
   in Vercel.
5. **Activate** the three workflows.

## Checking it works (staging)

- Book a discovery meeting on the seeded test clinic → n8n shows a waiting execution for the
  reminders.
- Reschedule it → when the old reminder comes due, the ingress answers `meeting_rescheduled` and
  nothing is sent.
- Mark a meeting *no-show* on an inbound (or opted-in) lead → the re-engagement is queued 2 hours
  later; reply to the WhatsApp → the next-day touch is skipped (`lead_replied`).
- Staging must use Twilio test credentials or `EMMA_DRY_RUN=true` so no real number is messaged.
