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
- `/consultant` pages send a restrictive CSP (network only to this origin and Twilio),
  `Permissions-Policy: microphone=(self)`, `X-Frame-Options: DENY`, `Cache-Control: no-store`.
- Transcripts, summaries and note bodies are never cached in browser storage for offline use
  (only lead lists and unsent drafts are).

## Access control

| Who | Sees | Can |
|---|---|---|
| **Sales Consultant (Clinics)** | own leads + the unassigned pool; calls, transcripts, recordings and notes on those leads only | call, create/edit own leads and notes, claim pool leads. **No** `/crm` or `/api/crm` access. |
| **Agent Manager / Admin / Super Admin** | all Clinics leads and calls | everything a consultant can, plus reassign leads |
| **Legacy single-password admin** | all (read-only manager) | cannot place calls (no member identity) |
| Report Generator / CSM / Viewer | nothing in the portal | — (CRM access unchanged) |

`consultant_id` on every write comes from the session, never from the request body.

## Retention (recommendation — make it configurable)

| Data | Recommended retention |
|---|---|
| Call recordings (Twilio) | **90 days** after the call, then delete |
| Transcript segments | **12 months**, or until the lead is closed Lost + 90 days, whichever is sooner |
| AI summaries and notes | life of the business relationship; Lost leads + 12 months |
| Card events | 12 months (coaching analytics only) |

Today the portal does **not** delete anything automatically. Until it does, recordings must be
deleted manually on the chosen schedule (DEPLOY.md §5). Retention periods should be config
values enforced by the existing `consultant-sweep` cron (see the contract request in the
DevOps report).

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
