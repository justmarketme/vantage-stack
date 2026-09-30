# Consultant Portal — build spec (VantageStack Clinics vertical)

Commission-based **internal** sales consultants sell VantageStack's AI booking agents to
**aesthetic clinics**. The portal is where they call clinics **from the browser**, run their
pipeline, and get live NEPQ coaching from **Coach Alex**. Every record feeds the existing
VantageStack CRM (`/crm`) tagged `vertical = 'clinics'`.

Read `docs/AGENT_ARCHITECTURE.md` first — the agent personas and the *Current scope* rules apply.
Out of scope: the paused Clinic Portal (`/clinic-crm`), Capital Legacy, F1/telemetry styling.

## Fixed contracts — do not change without the coordinator
- `lib/consultant/types.ts` — zod inputs + response types. FE and BE both import it.
- `lib/consultant/schema.ts` — DDL (`ensureConsultantSchema`). Additive to CRM tables; new `consultant_*` tables, RLS on.
- `lib/consultant/config.ts` — every tunable (server-only; never import from a client component).

Need a contract change? Put it under **Contract requests** in your final report; don't edit.

## How a call works (end to end)
1. Consultant taps **Call** on a lead → `POST /api/consultant/calls {leadId}` creates a
   `consultant_calls` row (server looks up the lead's phone — **the browser never supplies the
   number**) → returns `Call`.
2. Browser `Device.connect({ params: { CallId } })` (Twilio Voice JS SDK, identity
   `consultant_<memberId>`). Twilio hits the TwiML App Voice URL
   `POST /api/consultant-voice/twiml`.
3. TwiML route validates the Twilio signature, loads the call by `CallId`, checks the caller
   identity owns it, stores `CallSid`, and returns:
   - `<Start><Transcription statusCallbackUrl=".../transcription?callId=…" track="both_tracks"
     languageCode=cfg partialResults="false"/></Start>`
   - `<Dial callerId=cfg record="record-from-answer-dual" recordingStatusCallback=".../recording?callId=…"
     timeLimit=cfg timeout=cfg action=".../dial-complete?callId=…">`
     `<Number url=".../whisper" statusCallback=".../status?callId=…" statusCallbackEvent="initiated ringing answered completed">+27…</Number></Dial>`
   - Whisper URL plays `cfg.recording.notice` **to the clinic only** before bridging (POPIA notice).
4. Real-Time Transcription posts `transcription-content` events (`TranscriptionData` JSON
   `{transcript, confidence}`, `Track`, `Final`). On the **parent** (browser) leg,
   `inbound_track` = the consultant, `outbound_track` = the clinic. Only final results are stored
   as `consultant_call_segments` (seq assigned server-side, monotonic per call).
5. Browser polls `GET /api/consultant/calls/[id]/live?after=<seq>` every `cfg.live.pollMs`;
   the Coach Alex matcher runs **client-side** on new *prospect* segments (instant, free, testable).
6. Call ends → status/dial-complete callbacks set `ended_at`, `duration_sec`; recording callback
   stores `recording_sid`. The summariser runs (Next `after()` from the completing callback, plus
   the cron sweep as a backstop): transcript → Claude → `CallSummary` JSON → stored on the call
   **and** as an editable `ai_summary` note authored "Coach Alex".
7. Everything is written to the CRM: `client_communications` (channel `call`, preview = summary),
   `crm_activity` (`consultant_call`, `consultant_stage_change`, `consultant_note`), and on **won**
   a `deals` row (`vertical='clinics'`, `consultant_id`, `service_type=cfg`).

## API — `/api/consultant/**` (session required) · JSON · errors are `ApiError {error, fields?}`
Never return driver/Twilio/Anthropic error text. Scope: consultants see **their own** leads plus
the unassigned pool; managers (roles with `view_clients`) see all Clinics leads.

| Method + path | Body / query → response |
|---|---|
| GET `me` | → `Me` |
| GET `stats/today` | → `TodayStats` (own; managers: `?consultantId=`) |
| GET `leads?stage=&q=&scope=mine\|pool\|all` | → `Lead[]` (max `cfg.limits.listMax`) |
| POST `leads` | `LeadInput` → `Lead` (CRM client row, `vertical='clinics'`, `sales_stage='new'`, `status=cfg.newLeadStatus`, owned by caller) — 409 `{error, fields:{phone}}` if a Clinics lead with that phone exists |
| GET `leads/[id]` | → `LeadDetail` |
| PATCH `leads/[id]` | `LeadPatch` → `Lead` (stage change stamps `sales_stage_changed_at`, maps CRM `status` via `crmStatusForStage`, `won` upserts the deal; `consultantId` managers only) |
| POST `leads/[id]/claim` | → `Lead` (only if unassigned) |
| POST `voice/token` | → `VoiceToken` (member sessions only; rate-limited) |
| POST `calls` | `StartCallInput` → `Call` (rate-limited; 409 if the caller already has a live call) |
| GET `calls/[id]` | → `CallDetail` |
| GET `calls/[id]/live?after=` | → `LiveCallState` |
| PATCH `calls/[id]` | `CallPatch` → `Call` (wrap-up; `salesStage` also patches the lead) |
| POST `calls/[id]/summarise` | → `Call` (re-run; idempotent; 202-style: returns current state) |
| GET `calls/[id]/recording` | → audio/mpeg stream proxied from Twilio (never expose Twilio URLs/creds) |
| POST `calls/[id]/cards` | `CardEventInput` → 204 |
| POST `notes` | `NoteInput` → `Note` (idempotent on `clientId`) |
| PATCH `notes/[id]` | `NotePatch` → `Note` (409 if `baseVersion` stale; writes a revision row with editor + time) |
| GET `notes/[id]/revisions` | → `NoteRevision[]` (newest first) |

## Twilio webhooks — `/api/consultant-voice/**` (NO session; Twilio signature required)
`twiml`, `whisper`, `status`, `dial-complete`, `recording`, `transcription`. Form-encoded POST.
Invalid signature → 403, nothing written. Always respond fast (TwiML or empty 200).

## Cron
`GET /api/cron/consultant-sweep` (`Authorization: Bearer $CRON_SECRET`): summarise calls stuck in
`pending`/`failed` (< `cfg.ai.maxSummaryAttempts`), close calls with no callback for > max call length.

## Agent ownership (nobody edits another agent's files)

| Agent | Owns |
|---|---|
| **1 UI/UX** (Rams · Miner & Fogg · Norman) | `app/consultant/**`, `components/consultant/**`, `lib/consultant/coach/cards.ts` (the NEPQ card library content), and **additive** Clinics badge + vertical filter in `app/crm/pipeline/page.tsx` and `app/crm/clients/page.tsx` |
| **2 Frontend** (Apple HIG · Google NLP · Vercel) | `lib/consultant/client/**`, `hooks/consultant/**`, `lib/consultant/coach/matcher.ts` |
| **3 Backend** (Twilio · Andrew Ng · Zapier) | `app/api/consultant/**`, `app/api/consultant-voice/**`, `app/api/cron/consultant-sweep/**`, `lib/consultant/server/**`, **additive** `vertical` in `lib/crm/service.ts` list/pipeline queries, **additive** CRM feed in `lib/clinics/store.ts` (landing-page clinic enquiries become unassigned Clinics leads), `scripts/consultant-backfill-clinic-leads.ts` |
| **4 QA** (Cypress · POPIA · Quant) | `tests/**/consultant/**` — runs after 1–3 and 5 land |
| **5 DevOps/Security** (AWS WA · Zero-trust · CI/CD) | `lib/consultant/auth/**`, `lib/admin/roles.ts`, `lib/admin/rbac-paths.ts`, `middleware.ts` (additive), `vercel.json` (additive), `.env.example` (additive), `package.json` scripts (additive), `scripts/consultant-migrate.ts`, `docs/consultant-portal/DEPLOY.md`, `docs/consultant-portal/POPIA.md`, security headers for `/consultant` |

### Seams (code to these exact names)
**Agent 5 → Agent 3**
- `lib/consultant/auth/session.ts`:
  `export type ConsultantSession = { memberId: string | null; username: string; displayName: string; role: TeamRole; isManager: boolean; canCall: boolean }`
  `export async function requireConsultant(opts?: { manager?: boolean; call?: boolean }): Promise<ConsultantSession | NextResponse>`
  (401/403 `NextResponse` on failure — callers do `if (s instanceof NextResponse) return s;`).
  `canCall` = member session with the `use_consultant_portal` permission.
  `isManager` = role has `view_clients` (sees all Clinics leads, may reassign).
- `lib/consultant/auth/twilioSignature.ts`:
  `export function verifyTwilioRequest(pathWithQuery: string, params: Record<string, string>, signature: string | null): boolean`
  (builds the full URL from `consultantConfig().publicUrl`; honours `cfg.twilio.skipSignature`).
- `lib/consultant/auth/rateLimit.ts`: `export function rateLimit(key: string, limit: number, windowMs: number): boolean`.
- Voice identity: `export function voiceIdentity(memberId: string): string` → `consultant_<memberId>` and
  `export function memberIdFromIdentity(identity: string): string | null` in `lib/consultant/auth/identity.ts`.
- Role `sales_consultant` + permission `use_consultant_portal` (granted to `sales_consultant`,
  `super_admin`, `admin`, `agent_manager`). `sales_consultant` gets **no** `view_clients`.
  Middleware: `/consultant/**` pages need `use_consultant_portal`; `/api/crm/**` returns 403 for
  roles without `view_clients` (closes the gap where any session could read the whole CRM API);
  `/api/consultant-voice/**` is **not** in the matcher (Twilio signature is its auth).

**Agent 2 → Agent 1** (all client-side, `"use client"` where needed)
- `lib/consultant/client/api.ts`: `api.me()`, `api.stats.today()`, `api.leads.list({stage,q,scope})`,
  `api.leads.create(input)`, `api.leads.get(id)`, `api.leads.patch(id, patch)`, `api.leads.claim(id)`,
  `api.voice.token()`, `api.calls.start(leadId)`, `api.calls.get(id)`, `api.calls.live(id, after)`,
  `api.calls.patch(id, patch)`, `api.calls.summarise(id)`, `api.calls.cards(id, input)`,
  `api.calls.recordingUrl(id)` (string), `api.notes.create(input)`, `api.notes.patch(id, patch)`,
  `api.notes.revisions(id)`. Throws `ApiClientError { status, error, fields }`.
- `hooks/consultant/useQuery.ts`: `useQuery<T>(key: string | null, fn, { refreshMs?, persist? })` →
  `{ data, error, loading, refresh, mutate }` — stale-while-revalidate; `persist` (localStorage) only
  for lists/leads, **never** transcripts, summaries or notes bodies.
- `hooks/consultant/useVoiceCall.ts`: `useVoiceCall()` →
  `{ ready, state: "idle"|"connecting"|"ringing"|"in_progress"|"ended"|"error", call: Call | null,
  muted, durationSec, error, start(leadId), hangup(), toggleMute() }` (handles token refresh,
  mic permission errors, device teardown).
- `hooks/consultant/useLiveTranscript.ts`: `useLiveTranscript(callId, active)` → `{ segments, status, ended }`.
- `hooks/consultant/useCoachCards.ts`: `useCoachCards(callId, segments)` →
  `{ active: (CoachCard & { heard: string }) | null, queue: CoachCard[], stage: NepqStage, markUsed(id),
  dismiss(id), history }` — batches `api.calls.cards` events.
- `lib/consultant/coach/matcher.ts`: `export function matchCards(text: string, cards: CoachCard[], opts?: { exclude?: Set<string> }): CardMatch[]`
  and `export function inferStage(segments: TranscriptSegment[]): NepqStage` (pure, unit-testable).
- `lib/consultant/client/speech.ts` (pure): `normaliseSpokenEmail`, `normaliseSpokenUrl`,
  `normaliseSpokenPhone`, `normaliseMedicalTerms`, `validateSpoken(kind, text)`;
  `hooks/consultant/useSpeechInput.ts`: `useSpeechInput({ kind: "email"|"url"|"phone"|"text", onResult })` →
  `{ supported, listening, interim, error, start(), stop() }`.
- `hooks/consultant/useNoteDraft.ts`: `useNoteDraft(key)` → `{ draft, setDraft, clear }` (localStorage,
  survives signal loss); `hooks/consultant/useOutbox.ts`: `useOutbox()` → `{ pending, enqueue(op), flush() }`
  — queues note creates/edits and lead patches while offline, replays on `online` (note creates carry
  `clientId` so replays are idempotent; edits carry `baseVersion` so conflicts surface, not overwrite).
- `hooks/consultant/useOnline.ts`, `hooks/consultant/useWakeLock.ts(active)`.

**Agent 1 → Agent 2**: `lib/consultant/coach/cards.ts` exports `export const COACH_CARDS: CoachCard[]`.

## UX spec (Agent 1) — the portal must feel fast, calm and premium on a phone
Design system: existing VantageStack tokens (Tailwind `background #0B0B0C`, `surface #1A1A1D`,
`accent #3B82F6`, `textPrimary`, `textMuted`; Space Grotesk headings, Inter body). Dark. Deal
health is the only strong colour: **Red / Yellow / Green** dots and edges (never text-only — pair
with a label for colour-blind users). No F1/telemetry styling. WCAG AA contrast. Touch targets ≥ 44px.
Respect `prefers-reduced-motion`. Safe-area insets on iOS.

Pages:
- `/consultant` **Today** — stats strip (dials, connects, talk time, booked), "Call next" queue
  (due follow-ups first, then new leads), unassigned pool count with Claim.
- `/consultant/pipeline` — desktop: kanban by `SalesStage` with health edges; mobile: stage tabs +
  list. Tap a lead → workspace.
- `/consultant/leads/new` — short form; mic buttons on email/website/phone fields using
  `useSpeechInput` with the right `kind`; inline validation from `LeadInput`.
- `/consultant/leads/[id]` — **Lead workspace**: header (clinic, contact, stage selector, health,
  big **Call** button), next action, timeline of calls (each: disposition, duration, AI summary,
  recording player), notes (create / edit — edited notes show "Edited by *name* · *time*" and a
  "History" disclosure listing every revision with editor + timestamp).
- `/consultant/call/[callId]` — **Live call** (the heart of the product):
  - *Phone (<768px):* sticky top call bar (clinic, timer, status dot, ● REC); main area = the
    **active Coach Alex card**, large: stage chip, "Heard: '…'" (the phrase that triggered it),
    then **Ask** lines as the biggest text (what to say next), Listen / Reframe / Confirm
    collapsible beneath; swipe right = used, left = dismiss (buttons too); queue dots for waiting
    cards. No card → NEPQ stage tracker + the suggested question for the current stage. Live
    transcript lives in a bottom sheet showing the last 2 lines, tap/drag to expand. Fixed bottom
    control bar in the thumb zone: Mute · Note · **Hang up** (largest, red). Screen wake lock on.
  - *Tablet/desktop (≥1024px):* three columns — lead brief | live transcript (prospect vs
    consultant bubbles, auto-scroll with "Jump to live") | Coach Alex panel (active card, queue,
    stage tracker). Controls in the top bar.
  - Cards enter with a short slide/fade into a **reserved** area (no layout shift).
  - On hang-up → **Wrap-up** sheet: disposition chips, stage select, next action + date, quick note
    (offline-safe draft), and "Coach Alex is writing your summary…" that fills in when ready.
- `/consultant/calls/[callId]` — call review: recording player, transcript, summary, objections
  (handled / missed with better responses), NEPQ stage checklist, coaching tips, notes with history.
- Navigation: bottom tab bar on mobile (Today · Pipeline · New lead), side rail on desktop.
- Offline banner when `useOnline()` is false; queued changes count; calls disabled offline with a reason.
- CRM (`/crm`): a "Clinics" badge on Clinics-vertical cards/rows and a vertical filter. Additive only.

## Non-negotiables
- Tenancy/scope: a consultant can only read or act on leads they own or the unassigned pool; calls
  and notes only on those leads. `consultant_id` comes from the session, never the body. Test it.
- The browser never supplies a phone number to dial or a recording URL.
- POPIA: recording notice played to the clinic before bridging; recordings streamed only through the
  authenticated proxy; no transcript text, phone numbers or emails in logs, URLs or error bodies.
- Every number / message / timing in `config.ts` or the DB — nothing inline.
- Coach Alex (AI) summaries are **drafts**: stored as an `ai_summary` note that humans can edit; every
  edit keeps a revision with editor + timestamp. The original AI output stays on the call row.
- Claude calls use `@anthropic-ai/sdk`, model `cfg.ai.model` (default `claude-opus-5-5`), structured
  output via `zodOutputFormat`, server-side refusal fallback (`fallbacks: "default"`, beta
  `server-side-fallback-2026-07-01`), and check `stop_reason` before reading content.
- Don't run `next build` / `next dev` (shared tree). Verify with `npx tsc --noEmit -p .` and jest scoped
  to your files. The coordinator runs the full build.
