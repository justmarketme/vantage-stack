# Consultant Portal — go-live runbook

Every step below is **user-gated**: it needs a human with Twilio Console, Vercel and database
access. Nothing here is automated by the build. Do them in order; tick the smoke test at the end
before inviting real consultants.

Read with: `SPEC.md` (how a call works), `POPIA.md` (what is recorded and why).

---

## 0. Prerequisites and one blocker to check first

- [ ] **Vercel plan supports a 5-minute cron.** `vercel.json` declares
      `GET /api/cron/consultant-sweep` at `*/5 * * * *`. On the Hobby plan Vercel only allows
      crons that run once a day and **rejects the deployment** otherwise. The project must be
      on Pro (or the schedule changed to daily, which weakens the summary backstop — the
      primary summariser still runs from the call-completed callback).
- [ ] **Wave 2: Vercel Pro is mandatory.** `vercel.json` also declares
      `GET /api/cron/consultant-dispatch` at `* * * * *` (every minute: event outbox → n8n /
      EMMA, due Emma messages, calendar retries, reward tiers). Hobby rejects it outright. Pro
      runs it (cron invocations count against function usage). Crons run on the **production**
      deployment only — see `STAGING.md` for exercising it on previews.
- [ ] `CRON_SECRET` is already set in Vercel (existing crons use it). Vercel sends it as
      `Authorization: Bearer $CRON_SECRET`; the sweep route rejects anything else.
- [ ] You know the **public origin** the portal is served on (e.g. `https://www.vantagestack.co.za`).
      Below this is `$PUBLIC_URL`. It must be the exact origin Twilio will call — signature
      validation rebuilds webhook URLs from it, not from request headers.

## 1. Twilio — API key (browser voice tokens)

1. Console → **Account → API keys & tokens → Create API key**. Type **Standard**, name it
   `vantagestack-consultant-voice`.
2. Copy the **SID** (`SK…`) and **Secret** — the secret is shown once.
3. These go in `TWILIO_API_KEY_SID` / `TWILIO_API_KEY_SECRET`. They are used only to sign
   short-lived Voice access tokens; the account auth token never reaches a browser.

## 2. Twilio — TwiML App

1. Console → **Voice → Manage → TwiML Apps → Create new TwiML App**, name `Consultant Portal`.
2. **Voice Request URL:** `$PUBLIC_URL/api/consultant-voice/twiml`, method **HTTP POST**.
3. Leave Messaging empty. Save and copy the App SID (`AP…`) → `TWILIO_TWIML_APP_SID`.

## 3. Twilio — South African caller ID

Clinics see this number, so it must be a real SA number that can receive a call-back.

- **Option A (preferred):** buy a South African number in Console → Phone Numbers → Buy a
  number (ZA). SA numbers need an approved **Regulatory Bundle** (business registration + proof
  of address) — submit it early, approval can take days.
- **Option B:** verify an existing company number: Console → Phone Numbers → **Verified Caller
  IDs** → Add. Twilio calls it with a code.

Put it in E.164 (`+27…`) in `CONSULTANT_CALLER_ID`.

Also confirm **Voice → Settings → Geo permissions** allow calls to **South Africa** (mobile and
landline), and nowhere you don't sell to (limits toll-fraud exposure).

## 4. Twilio — Real-Time Transcription (live Coach Alex cards)

The TwiML uses `<Start><Transcription>` (Real-Time Transcription) with language
`CONSULTANT_TRANSCRIPTION_LANGUAGE` (default `en-ZA`).

- [ ] If the Console asks for it, accept the **Predictive and Generative AI/ML features
      addendum** (Voice → Settings, or the prompt shown on first use). Without it Twilio
      ignores the `<Transcription>` verb and calls still work, but no live cards or summaries.
- [ ] Check `en-ZA` is supported by the transcription engine on your account; if not, set
      `CONSULTANT_TRANSCRIPTION_LANGUAGE=en-US` (accuracy drops slightly for SA accents).
- Voice Intelligence is **not** required — transcripts are stored by our own webhook.

## 5. Twilio — recording security and retention

- [ ] Voice → Settings → **Enforce HTTP Auth on media URLs: ON.** Recording URLs then need
      account credentials; the portal streams recordings only through its authenticated proxy
      (`GET /api/consultant/calls/[id]/recording`), so nothing public breaks.
- [ ] **Leave "Voice Recording Encryption" (public-key) OFF** unless the recording proxy is
      extended to decrypt with your private key — otherwise every recording becomes
      unplayable in the portal. Twilio already encrypts stored recordings at rest.
- [ ] Decide the retention period (see `POPIA.md` → Retention) and set
      `CONSULTANT_RECORDING_RETENTION_DAYS` / `CONSULTANT_TRANSCRIPT_RETENTION_DAYS` (defaults
      90 / 365). The `consultant-sweep` cron deletes older recordings (via the Recordings API)
      and transcript segments; it needs the cron running (step 0).

## 6. Vercel environment variables

Vercel → Project → Settings → Environment Variables. Set for **Production** (and Preview only if
you want previews to place real calls — each preview is a different origin, so it needs its own
TwiML App). Full documented list: the "Consultant Portal" block in `.env.example`.

| Variable | Required | Value |
|---|---|---|
| `CONSULTANT_PUBLIC_URL` | yes (or `NEXT_PUBLIC_APP_URL`) | `$PUBLIC_URL`, no trailing slash |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | already set | account credentials (webhook signature + recording proxy) |
| `TWILIO_API_KEY_SID` / `TWILIO_API_KEY_SECRET` | yes | step 1 |
| `TWILIO_TWIML_APP_SID` | yes | step 2 |
| `CONSULTANT_CALLER_ID` | yes | step 3 |
| `ANTHROPIC_API_KEY` | for summaries | Anthropic Console key (org account, see POPIA.md) |
| `CONSULTANT_RECORDING_NOTICE` | recommended | legal-approved wording (POPIA.md) |
| `CRON_SECRET` | already set | — |
| everything else | no | defaults in `lib/consultant/config.ts` |

**Never** set `CONSULTANT_TWILIO_SKIP_SIGNATURE` in Vercel (it is forced off in production anyway).

Redeploy after changing variables — Vercel only applies them to new deployments.

## 7. Database migration

Run from a machine with `.env.local` pointing at the **app** database (Supabase project
`tinkmipmxunwvyemhalu`):

```bash
npm run consultant:migrate
```

It is idempotent. Expected output: the `consultant_*` tables with **RLS on**, the new
`clients` / `deals` columns, and the status values ensured. A non-zero exit means a table is
missing RLS — stop and investigate.

> Never apply this schema through the Supabase MCP — it is connected to a different project
> (`lead-velocity-staging`). See CLAUDE.md → Infra / Deployment.

## 8. Invite a consultant

1. `/admin/team` → **Invite** → role **Sales Consultant (Clinics)**.
2. They accept the invite and set a password; after login they land on `/consultant`.
3. They cannot open `/crm` (403 page) and every `/api/crm/**` call returns 403 — the portal
   API is their only door to CRM data, and it only shows their own leads plus the unassigned pool.
4. Managers (Super Admin / Admin / Agent Manager) can open the portal too, see all Clinics
   leads, reassign, and place calls. The legacy single-password admin is read-only (no calls).
5. **Leaders (Jono, KG, Steph)** are given roles in `/admin/team` — data, not code:
   - **Admin** / **Agent Manager** — full manager (Agent Manager can confirm payments and see
     team performance; Admin also edits gamification and sees system health).
   - **Systems & Operations** — read-only portal manager + `/consultant/admin/systems`
     (API/n8n health, dead letters + retry). No calls, no pipeline edits, no `/crm`.
   - **Acquisition & Creative Direction** — read-only portal manager + `/consultant/admin/growth`
     (pipeline velocity, gamification settings, reward fulfilment). No calls, no pipeline edits,
     no `/crm`.
   Middleware blocks every pipeline write from the two read-only roles; only their admin
   actions (gamification settings, reward fulfilment, dead-letter retry, lead search) pass.

## 9. Smoke test (do all of it on production before real use)

Devices: **iPhone Safari** and **Android Chrome** at minimum, plus one desktop browser.

- [ ] Log in as the test consultant → lands on `/consultant`. `/crm` shows Access denied.
- [ ] Response headers on `/consultant` include `Content-Security-Policy` (with `wss://*.twilio.com`)
      and `Permissions-Policy: microphone=(self)…`. Browser console shows **no CSP violations**
      during a call.
- [ ] **Mic permission:** first call prompts for the microphone on both mobile browsers;
      denying it shows a clear message, not a silent failure. The screen stays on during the
      call (wake lock).
- [ ] Create a lead with your own mobile number. Tap **Call**.
- [ ] Your phone shows `CONSULTANT_CALLER_ID`. On answer you **hear the recording notice before**
      the consultant is connected; the consultant does not hear it.
- [ ] Say a few objection phrases ("it's too expensive", "we already have a receptionist") —
      **live transcript** lines and **Coach Alex cards** appear within a few seconds.
- [ ] Hang up → wrap-up sheet → **summary** appears ("Coach Alex is writing…" then fills).
- [ ] Recording plays in the call review page. The page never exposes an `api.twilio.com` URL
      (check the network tab — audio comes from `/api/consultant/calls/…/recording`).
- [ ] Edit the AI summary note → "Edited by *name* · *time*"; **History** lists the original and
      your edit with editor + timestamp.
- [ ] Move the lead to **Won** → `/crm` (as a manager) shows the client with the **Clinics** badge,
      a `deals` row with `vertical = clinics`, and the call in the client's communications.
- [ ] Twilio Console → Monitor → Debugger shows **no 11200 / 12300** errors for the webhooks
      (those mean an unreachable URL or a signature mismatch — usually a wrong `CONSULTANT_PUBLIC_URL`).
- [ ] Wait 5 minutes → Vercel → Cron Jobs shows `/api/cron/consultant-sweep` returning 200.

## Rollback

The portal is additive. To switch it off without a deploy: remove `TWILIO_TWIML_APP_SID`
(token minting returns 503, no calls can start), and deactivate consultants in `/admin/team`
if they must lose access entirely. Do **not** "downgrade" a consultant to Viewer — Viewer has
`view_clients` and would gain read access to the whole CRM. Schema changes are additive columns/tables and can stay.

---

# Wave 2 — payments, meetings, calendars, Emma, events

Do §0 (Pro plan) first. Staging is set up per `STAGING.md`; do every step below on staging,
smoke-test, then repeat on production.

## 10. Environment variables (wave 2)

All placeholders are in the "Consultant Portal · Wave 2" block of `.env.example`.

| Variable | Required | Value |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | project API URL + anon key (Realtime nudges; the CSP is pinned to this host) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | already set | Storage signed URLs (server only) |
| `CONSULTANT_TOKEN_ENC_KEY` | yes | `openssl rand -base64 32` — encrypts stored calendar tokens. Different per environment. Store a copy in the password manager: losing it disconnects every calendar |
| `GOOGLE_CALENDAR_CLIENT_ID` / `_SECRET` | for Google Calendar | §11 |
| `MS_CALENDAR_CLIENT_ID` / `_SECRET` (`MS_CALENDAR_TENANT`, default `common`) | for Outlook | §11 |
| `N8N_EVENTS_WEBHOOK_URL` / `N8N_SIGNING_SECRET` | for n8n | §12 |
| `EMMA_EVENTS_URL` / `EMMA_EVENTS_SECRET` | for Jono's EMMA | §12 |
| `TWILIO_WHATSAPP_FROM` | already set | the existing VantageStack WhatsApp sender (Emma) |
| everything else | no | defaults in `lib/consultant/config.ts` |

## 11. Calendar OAuth apps

Redirect URIs must match **exactly** (scheme, host, path, no trailing slash), using the same
`$PUBLIC_URL` as above:

- Google: `$PUBLIC_URL/api/consultant/calendar/google/callback`
- Microsoft: `$PUBLIC_URL/api/consultant/calendar/microsoft/callback`

Register the staging preview's URLs too (a stable preview alias — see `STAGING.md`).

**Google Cloud (Google Calendar)**
1. console.cloud.google.com → create/select project `vantagestack-consultant` →
   **APIs & Services → Library → Google Calendar API → Enable**.
2. **OAuth consent screen**: User type **External**; app name "VantageStack Consultant Portal";
   support + developer e-mail; authorised domain `vantagestack.co.za`; privacy policy URL.
   Scopes: `openid`, `email`, `https://www.googleapis.com/auth/calendar.events`.
3. `calendar.events` is a **sensitive** scope. While the app is in *Testing*, add each
   consultant as a test user — but Google expires Testing-mode refresh tokens after **7 days**,
   so consultants would have to reconnect weekly. For real use, **publish** the app and submit
   it for verification (days to weeks; start early).
4. **Credentials → Create credentials → OAuth client ID → Web application**; add the redirect
   URI(s) above. Copy the client ID/secret → `GOOGLE_CALENDAR_CLIENT_ID` / `GOOGLE_CALENDAR_CLIENT_SECRET`.

**Microsoft Entra (Outlook / Microsoft 365 calendars)**
1. entra.microsoft.com → **App registrations → New registration**, name "VantageStack
   Consultant Portal". Supported account types: **Accounts in any organizational directory and
   personal Microsoft accounts** (matches `MS_CALENDAR_TENANT=common`; use your tenant ID
   instead to allow only company accounts).
2. Redirect URI: platform **Web**, the Microsoft URI above (add the staging one under
   Authentication later).
3. **Certificates & secrets → New client secret** (24 months max). Copy the *Value* →
   `MS_CALENDAR_CLIENT_SECRET`; the Application (client) ID → `MS_CALENDAR_CLIENT_ID`.
   Put the expiry date in the team calendar — an expired secret silently breaks sync.
4. **API permissions → Microsoft Graph → Delegated**: `offline_access`, `Calendars.ReadWrite`,
   `User.Read`. No admin consent is needed for personal accounts; a clinic-staff M365 tenant
   whose policy blocks user consent will need its admin to consent once.

The callback is a top-level GET navigation back from Google/Microsoft, so the SameSite=Lax
session cookie arrives and the portal's cross-origin write check (writes only) does not apply.
The `state` parameter is signed, short-lived and bound to the member.

## 12. n8n and Jono's EMMA (signed events)

Every hop is signed with `X-VS-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`
(`lib/consultant/auth/signing.ts`); receivers reject anything older/newer than
`N8N_SIGNATURE_TOLERANCE_SEC` (300 s) and dedupe on `event.id`.

- [ ] Generate `N8N_SIGNING_SECRET` (`openssl rand -hex 32`); set it in Vercel **and** as an
      n8n credential. Both directions use it.
- [ ] n8n: import the generated workflows in `n8n/` (Emma follow-up sequences, EMMA daily digest,
      Serper lead prospecting) and follow `n8n/README.md`. The sequences workflow's webhook
      production URL → `N8N_EVENTS_WEBHOOK_URL`. It verifies the signature over the **raw** body
      and the app re-checks consent and stop conditions before anything is sent.
- [ ] n8n → app calls go to `POST $PUBLIC_URL/api/webhooks/n8n-ingress`, signed the same way,
      each with an idempotency key (replays are answered from `consultant_ingress_keys`).
- [ ] Generate `EMMA_EVENTS_SECRET`; set it in Vercel and on the EMMA server; set
      `EMMA_EVENTS_URL` to EMMA's receiver on its tunnel. Business events only — never clinic
      contact or patient data (AGENT_ARCHITECTURE Decision 7). Leave it blank on staging.
- [ ] Undelivered events retry with backoff and go `dead` after `CONSULTANT_EVENT_MAX_ATTEMPTS`
      (8); see and retry them in `/consultant/admin/systems`.

## 13. Twilio — Emma WhatsApp / SMS webhooks

Both routes have no session; `X-Twilio-Signature` against `CONSULTANT_PUBLIC_URL` is their auth
(a wrong public URL = every webhook 403s).

- [ ] **WhatsApp sender** (Messaging → Senders → WhatsApp senders → the VantageStack number):
      *Webhook URL for incoming messages* `$PUBLIC_URL/api/webhooks/emma-inbound` (POST);
      *Status callback URL* `$PUBLIC_URL/api/webhooks/emma-status` (POST).
- [ ] **SMS** (Phone Numbers → `CONSULTANT_CALLER_ID` number → Messaging): *A message comes in*
      → `$PUBLIC_URL/api/webhooks/emma-inbound` (POST). Outbound messages also carry
      `StatusCallback=$PUBLIC_URL/api/webhooks/emma-status`.
- [ ] Emma's WhatsApp templates are approved in the WhatsApp Manager before use (business-
      initiated messages outside the 24-hour window must be templates).
- [ ] Test STOP / START from a phone: STOP must set the opt-out immediately (POPIA.md).

## 14. Storage, schema and wave-2 smoke test

```bash
npm run consultant:migrate    # wave-2 tables, outbox triggers, RLS — additive, idempotent
npm run consultant:storage    # private bucket, size + type limits, public-policy check
```

`consultant:storage` exits non-zero if the bucket is public or any anon/authenticated policy on
`storage.objects` could reach it — stop and fix before continuing.

- [ ] `/consultant` response CSP contains `https://<ref>.supabase.co wss://<ref>.supabase.co`
      (your ref, not `*.supabase.co`) and still `wss://*.twilio.com`; no CSP violations while
      uploading a Why Board image and watching the leaderboard update live.
- [ ] Why Board image upload → the image shows; its URL is a signed Storage URL that stops
      working after `CONSULTANT_SIGNED_URL_TTL_SEC`. The bucket's public URL returns 400/404.
- [ ] Connect Google and Outlook in `/consultant/settings`; book a discovery meeting → it
      appears in the consultant's calendar at the right SAST time. In the DB the
      `refresh_token_enc` column starts with `v1.` (never a readable token).
- [ ] Manager confirms a payment with proof → deal `paid`, commission shown on the leaderboard,
      one `deal.paid`-type event delivered to n8n (check n8n executions) and EMMA.
- [ ] Log in as **Systems & Operations** → `/consultant/admin/systems` opens; `/crm` is denied;
      editing a lead is refused ("Read-only access").
- [ ] Vercel → Cron Jobs shows `/api/cron/consultant-dispatch` returning 200 every minute.

## Operational notes — public-domain (scraped) leads

- Leads come from public business listings (e.g. Google Places, via the CRM lead scraper) —
  see `POPIA.md` → *Public-domain (scraped) leads* before running an import.
- Respect each source's **terms of use and robots rules**: prefer the official API (Google
  Places API under its terms, incl. its caching limits and attribution), never scrape sites
  whose terms or `robots.txt` forbid it, throttle requests, and never collect personal social
  profiles or anything about patients.
- **Research runs in n8n, not in this app.** The `APOLLO`, `SERPER`, `TAVILY` and `EXA` API
  keys (and any Google Places key used by the workflow) live in **n8n credentials** — never in
  Vercel or `.env.local`. The workflow posts its results to
  `POST $PUBLIC_URL/api/webhooks/n8n-ingress` with action `leads.import`, signed with
  `N8N_SIGNING_SECRET` (§12) and an idempotency key per batch; each lead carries its `provider`.
- Manual imports go through `POST /api/consultant/leads/import` (managers only; it is under
  `/api/consultant/**`, so middleware requires a portal session, blocks the read-only roles,
  and applies the cross-origin write check). Scraped leads enter the pool unassigned with
  `lead_source = 'public_scrape'`, `source_url` and `sourced_at`.

