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
