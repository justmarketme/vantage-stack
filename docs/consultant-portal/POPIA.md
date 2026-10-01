# Consultant Portal — POPIA notes (call recording, transcripts, AI summaries)

> Engineering record of how the portal handles personal information, written so the
> Information Officer and legal counsel can review it. It is **not legal advice** — have the
> lawful-basis wording and the recording notice signed off before go-live.

## Whose information, and what

Consultants phone **aesthetic clinics** (juristic persons — POPIA protects them too) and speak
to **clinic staff** (owners, managers, receptionists — natural persons).

| Data | Source | Where it lives |
|---|---|---|
| Clinic name, contact name/role, business phone, email, website | consultant or landing-page enquiry | `public.clients` (Supabase Postgres, app project) |
| Call audio (both parties, dual-channel) | Twilio `<Dial record>` | **Twilio** (recording storage). We store only the `recording_sid` |
| Live transcript (final segments only, speaker-labelled) | Twilio Real-Time Transcription → our webhook | `public.consultant_call_segments` |
| AI call summary (objections, NEPQ stages, next steps) | Anthropic API | `public.consultant_calls` (original) + editable `ai_summary` note in `public.consultant_notes` |
| Notes and every edit (editor + timestamp) | consultants / managers | `public.consultant_notes`, `public.consultant_note_revisions` |
| Coach Alex card events (which prompt was shown/used) | browser | `public.consultant_card_events` |
| CRM trail (call preview, stage changes, won deal) | portal server | `client_communications`, `crm_activity`, `deals` |

**Patients are out of scope.** The portal never asks for patient data. A clinic may still
mention a patient on a call; that would be special personal information (health, s26). Train
consultants to steer away from it and to redact it from notes. Transcripts are not searchable
from the portal UI and are only shown within the call the consultant is entitled to see.

## Lawful basis

- **Processing clinic contact details and call content:** legitimate interests of VantageStack
  in B2B sales to businesses that are plausibly interested (s11(1)(f)), and pursuing a contract
  with the clinic (s11(1)(b)) once they engage. Minimality (s10): only business contact details
  and the call itself.
- **Recording:** VantageStack is a party to the call, so recording is lawful participant
  monitoring under RICA s4; POPIA's openness requirement (s18) is met by the notice below.
  Recordings are used for quality, coaching and accurate records of what was agreed.
- **Live unsolicited voice calls** are not "electronic communications" for POPIA s69 purposes
  (that section covers automated calling, SMS, e-mail, fax). The Consumer Protection Act still
  applies: honour any request not to be called again (mark the lead Lost with that reason) and
  check the National Opt-Out register once it is operative.

## The notice played before bridging

When the clinic answers, Twilio plays `CONSULTANT_RECORDING_NOTICE` (config; default
*"Hi, this call from Vantage Stack is recorded for quality and training purposes."*) **to the
clinic only, before the consultant is connected** (Twilio `<Number url=…/whisper>`). Recording
is `record-from-answer-dual`, so the notice is at the start of every recording — which is the
evidence that it was played. If the callee objects, the consultant ends the call; do not
continue unrecorded through the portal.

Recommended wording for legal review (keep it under ~8 seconds):
*"Hi, this is Vantage Stack. This call is recorded for quality and training. You can ask us
not to record at any time."*

## Where data goes (operators and cross-border transfers — s20, s21, s72)

| Operator | What it processes | Location | Notes |
|---|---|---|---|
| **Twilio** | call audio, recordings, real-time transcription | USA (default region) | Recordings encrypted at rest by Twilio; media URLs must require HTTP auth (DEPLOY.md §5). |
| **Anthropic** (API) | full call transcript + lead context, to produce the summary | USA | Sent server-to-server by the portal on Jono's organisation API account (operator-level processing). Under Anthropic's commercial API terms inputs are not used for model training; confirm the current API data-retention terms and sign Anthropic's DPA. Transcripts are sent only for calls long enough to summarise (`CONSULTANT_MIN_SUMMARISE_SEC`). |
| **Supabase** | Postgres: leads, transcripts, summaries, notes | project region | New `consultant_*` tables have **RLS on with no policies** — the anon/authenticated PostgREST keys can read none of it; only the server's DB connection can. |
| **Vercel** | runs the app; transient request data | edge/functions | No transcript text, phone numbers or e-mails in logs, URLs or error bodies (SPEC non-negotiable). |

Each needs a signed operator agreement / DPA with adequate-protection terms (s72(1)(b)).
Twilio, Anthropic and Supabase all offer standard DPAs.

## Security measures (s19)

- Portal and API behind the admin session (signed cookie, per-member session versioning), with
  role checks in middleware **and** again in each route (`requireConsultant`).
- Twilio webhooks authenticated by `X-Twilio-Signature` against the configured public origin;
  invalid signature → 403, nothing written.
- Recordings are never linked directly: audio streams through
  `GET /api/consultant/calls/[id]/recording`, which applies the same scope rules as the call.
- The browser never supplies the number to dial; voice tokens are outgoing-only, short-lived
  (`CONSULTANT_VOICE_TOKEN_TTL_SEC`) and bound to the consultant's identity.
- `/consultant` pages send a restrictive CSP (network only to this origin, Twilio and this
  project's own Supabase host — never `*.supabase.co`),
  `Permissions-Policy: microphone=(self)`, `X-Frame-Options: DENY`, `Cache-Control: no-store`.
- Transcripts, summaries and note bodies are never cached in browser storage for offline use
  (only lead lists and unsent drafts are).

## Access control

| Who | Sees | Can |
|---|---|---|
| **Sales Consultant (Clinics)** | own leads + the unassigned pool; calls, transcripts, recordings and notes on those leads only | call, create/edit own leads and notes, claim pool leads. **No** `/crm` or `/api/crm` access. |
| **Agent Manager / Admin / Super Admin** | all Clinics leads and calls | everything a consultant can, plus reassign leads |
| **Legacy single-password admin** | all (read-only manager) | cannot place calls (no member identity) |
| **Systems & Operations** | all Clinics leads (read-only) + system health, dead letters | retry dead letters only. No calls, no pipeline edits, no `/crm` |
| **Acquisition & Creative Direction** | all Clinics leads (read-only) + team performance | edit gamification settings, fulfil rewards. No calls, no pipeline edits, no `/crm` |
| Report Generator / CSM / Viewer | nothing in the portal | — (CRM access unchanged) |

`consultant_id` on every write comes from the session, never from the request body.
Payments are confirmed only by roles with `confirm_payments` (Super Admin, Admin, Agent Manager).
The read-only roles are enforced twice: middleware refuses their pipeline writes, and each
admin route checks its own permission.

## Retention (recommendation — make it configurable)

| Data | Recommended retention |
|---|---|
| Call recordings (Twilio) | **90 days** after the call, then delete |
| Transcript segments | **12 months**, or until the lead is closed Lost + 90 days, whichever is sooner |
| AI summaries and notes | life of the business relationship; Lost leads + 12 months |
| Card events | 12 months (coaching analytics only) |

The `consultant-sweep` cron enforces two of these automatically (verified against a real
Postgres in `tests/integration/consultant/`): Twilio recordings older than
`CONSULTANT_RECORDING_RETENTION_DAYS` (default 90) are deleted on Twilio and their SID cleared,
and transcript segments older than `CONSULTANT_TRANSCRIPT_RETENTION_DAYS` (default 365) are
deleted; summaries and notes stay. Lost-lead and card-event retention are **not** automated yet.

## Data-subject requests, export and deletion

- Requests (access, correction, deletion, objection — s23–s25, s11(3)) go to the
  **Information Officer**, not to individual consultants.
- **Export:** there is no self-service export. A Super Admin exports a clinic's records with a
  SQL query against the app DB (clients row, communications, activity, consultant_* rows) and
  downloads the recordings from Twilio by SID.
- **Delete:** Super Admin only. Delete the Twilio recordings by SID first, then the
  `consultant_*` rows for that client, then anonymise or delete the CRM client row. Log the
  request and the date completed.
- Consultants cannot delete calls, transcripts or recordings; they can only edit notes, and
  every edit is kept as a revision.

---

# Wave 2 additions

## Public-domain (scraped) leads

Clinics are found in **public business listings** and research tools. A clinic is a juristic
person, but its owner / named contact is still a **data subject** (a natural person), so POPIA
applies even though the details were published.

**Sources and one intake.** Claude scraping, Google Places, Serper.dev, Apollo, Tavily, Exa and
the in-app prospecting engine all feed ONE intake: the manager import
(`POST /api/consultant/leads/import`) or the signed n8n `leads.import` action on
`/api/webhooks/n8n-ingress`. Every record carries its `provider`; the app validates it,
normalises phones to +27, dedupes and records provenance. The research tools themselves run in
n8n / Claude workflows, not in this app.

**Apollo is different:** it supplies *named* business contacts from a data broker, not
details the clinic published itself. Record `provider = apollo` on every such lead, keep
business-role data only (name, role, business phone / e-mail — no personal numbers, social
profiles or anything else Apollo offers), and **Jono should confirm Apollo's own POPIA/GDPR
terms (its lawful basis and notice to data subjects) cover South African use** before relying on it.

- **Lawful basis — legitimate interest (s11(1)(f)).** B2B contact with a business, about its
  business, using contact details the business itself published for enquiries. The balancing
  test holds because the contact is expected, low-intrusion and easy to refuse. Record the
  assessment (one page) with the Information Officer.
- **Minimisation (s10).** Business fields only: clinic name, business phone, business e-mail,
  website, address/city, listing URL. **Never** patients, personal social-media profiles,
  reviews' authors, or private numbers. Deduped on +27 phone / place id.
- **Openness (s18).** Every scraped lead stores `lead_source = 'public_scrape'`, `source_url`
  and `sourced_at`. The call opener tells the clinic where we found their details
  ("We found your clinic on Google…"), and the source is given on request.
- **Direct marketing (s69).** A live human call is not "electronic communication", so
  consultants may call. **Emma must not WhatsApp / SMS / e-mail a scraped lead** until it has
  opted in — consent is captured by the consultant on the call (wrap-up "agreed to WhatsApp
  follow-up", stored with the call id in `consultant_contact_consent`) or by the landing-page
  form. **Opt-outs are permanent** and override any later opt-in attempt by staff.
- **Objection (s11(3)).** "Don't call us again" → mark the lead Lost with that reason; it is
  never re-imported (dedupe keeps the record).
- **Inbound vs outbound (Decision 8).** *Outbound* — scraped, referral / word of mouth,
  event, consultant-added: consultants may call; **Emma only after opt-in**. *Inbound* — website
  / landing-page form, social-media enquiry, inbound call: the clinic contacted us, so Emma may
  follow up **on that enquiry**. In every case **opt-outs always win**.
- **Retention (recommendation, not automated).** Scraped leads that never engaged (no answered
  call, no consent) should be reviewed and deleted after **12 months**.
- Respect each source's terms of use and robots rules (DEPLOY.md → Operational notes).

## Emma messaging (WhatsApp / SMS)

- Sent from the existing VantageStack WhatsApp sender through Twilio, only via the outbox
  (`consultant_messages`) with retries and a dead-letter state — nothing is dropped silently,
  and nothing is sent twice (idempotency key).
- **Consent gate:** a lead is messaged only with a recorded opt-in and no opt-out
  (`consultant_contact_consent`). Replying **STOP** (or equivalent) sets `opted_out_at`
  immediately via `/api/webhooks/emma-inbound`; **START** re-subscribes only when the clinic
  itself sends it. Messages to consultants/owner (internal) are not direct marketing.
- Message bodies are rendered from templates in `/ai-configs/emma`; the row stores the template
  key and variables, never free text. Bodies, numbers and replies are never logged.
- Inbound replies are relayed to the owning consultant as a notification and audited.
- Twilio is an operator here too (USA); covered by the same DPA as voice.

## Audit log

`consultant_audit_log` records every Emma interaction (queued, sent, failed, delivered,
inbound, opt-out/in), every payment confirmation, reward fulfilment, settings change, lead
import, calendar connect/disconnect and access to pipeline data (s19, accountability). Each
row is actor id + kind (member / system / n8n / twilio), action, entity and id, and a `meta`
of **ids and counts only — never PII**. RLS on, no policies: server-only. Recommended
retention: 3 years (then delete), so disputes and data-subject requests can be answered.

## Calendar connections (encrypted tokens)

- A consultant connects their **own** Google or Microsoft calendar (explicit OAuth consent;
  scopes limited to calendar events + identity). Meetings are written with the clinic's
  business contact details only when `invite_clinic` is set.
- Access and refresh tokens are stored **encrypted at rest** with AES-256-GCM
  (`lib/consultant/auth/crypto.ts`, key `CONSULTANT_TOKEN_ENC_KEY`, random IV per value,
  tamper-evident). A database dump alone gives no calendar access.
- Disconnect deletes the stored tokens (and should revoke them at the provider). Google and
  Microsoft are operators for the calendar data (USA / EU).

## Why Board images and proof of payment (Supabase Storage)

- One **private** bucket (`CONSULTANT_STORAGE_BUCKET`), created by `npm run consultant:storage`:
  not public, size-limited, JPEG/PNG/WebP/PDF only, and **no** anon/authenticated policies on
  `storage.objects` — only the server's service-role key can read or write.
- The app does not use Supabase Auth, so `auth.uid()` policies cannot identify consultants.
  Instead the API checks the session and ownership, then issues a **short-lived signed URL**
  (`CONSULTANT_SIGNED_URL_TTL_SEC`, default 10 min) for exactly one object.
- **Why Board images** are personal (they can show family, homes, goals). Visible to the
  consultant and managers only; deleted when the goal is deleted, and with the member's account.
- **Proof of payment** can contain bank details and names. Visible to the owning consultant and
  managers only. Keep it as long as the financial record requires (SARS / Tax Administration
  Act: **5 years** from the payment), then delete the object and clear `payment_proof_path`.
  Not automated yet — a recommendation for the Information Officer.

## Events to n8n and to Jono's EMMA

The outbox payloads carry **business facts only** (ids, stage, amounts, consultant name) — no
phone numbers, e-mails, transcripts or message bodies. Every delivery is HMAC-signed
(`X-VS-Signature`) and time-bound. EMMA (Jono's personal assistant) receives business events
only; clinic contact and patient data never flow to it (AGENT_ARCHITECTURE Decision 7).
n8n is an operator: host it in a region covered by a DPA and keep its execution logs short.

> **Final legal sign-off is Jono's** (with the Information Officer / counsel): the
> legitimate-interest assessment for scraped leads, the call opener wording, Emma consent
> capture, and every retention period above.

