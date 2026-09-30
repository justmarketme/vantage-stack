# Consultant Portal — Wave 2 build spec

Read first: `CLAUDE.md`, `docs/AGENT_ARCHITECTURE.md` (Decisions + Supplementary + Influences
sections are binding), `docs/consultant-portal/SPEC.md` (wave 1, still valid), then this file.

**Hard rules for every agent**
- Design: the standard VantageStack look only. **No amber anywhere.** No motorsport / pit-wall /
  telemetry / neon styling. Colours come only from `components/consultant/theme.css` tokens:
  red = high-risk / at-risk / errors, brand blue = Coach Alex, stall cards, info; green =
  progress; yellow only as the middle deal-health state.
- Localisation: money is **ZAR whole rand** (`R12 500`); phones are **SA +27 only**
  (`normalizeZaPhone`); every date/time is **SAST** (`Africa/Johannesburg`) regardless of the
  device timezone.
- No PII (phone, email, transcript text, message bodies) in logs, URLs, error bodies, events.
- Every tunable in `lib/consultant/config.ts` or the `consultant_settings` table. AI prompts and
  Emma rules in `/ai-configs/**` — never inside components or route code.
- Modular files, strict TypeScript, plain-English comments on complex logic (Cursor/Antigravity).
- Don't run `next build`/`next dev` (shared tree). Verify with `npx tsc --noEmit -p .` (others'
  in-progress files may error; yours must be clean), `npx eslint <your files>`, and jest on your
  tests. Don't commit. Revert `data/qa/*` and `tsconfig.tsbuildinfo` churn when done.

## Fixed contracts (coordinator-owned; request changes in your report)
`lib/consultant/types.ts` (see the "WAVE 2" section), `lib/consultant/schema.ts`
(`CONSULTANT_DDL_V2`: deals payment columns, meetings, calendar connections + sync, goals,
training progress, settings, rewards, Emma messages, consent, audit log, ingress keys, events +
deliveries, and the **outbox triggers** that emit every event), `lib/consultant/config.ts`
(wave 2 block).

Decisions that shape behaviour:
- New stages `no_show` and `paid`. **A sale counts when it is paid.** Headline ratios: paid ÷ dials
  and paid ÷ answered calls (target 30% on answered, editable). Track the whole funnel.
- Commission = `cfg.commission.rate` (25%) × the **amount paid**, frozen on the deal at payment.
  Visible to every consultant on the leaderboard.
- Payment is **confirmed by a manager** (proof of payment upload). Design the payment code as a
  `PaymentSource` seam ("manual" today) so Paystack can be added later without rework.
- Why Board goals are visible to the consultant and managers.
- Pool leads: the next consultant sees the **full** history (calls, transcripts, recordings). Keep.
- Leaders (Jono, KG, Steph) get manager roles via the admin UI — data, not code.
- Staging = a Supabase **branch** of the same VantageStack project, never a separate project.

## Event flow (built into the schema — use it, don't duplicate it)
Triggers write `consultant_events` + `consultant_event_deliveries` (targets `n8n`, `emma_owner`) in
the same transaction as the change. `GET /api/cron/consultant-dispatch` (every minute) and
`after()` from the mutating request deliver them. Signed with `X-VS-Signature: t=<unix>,v1=<hex
HMAC-SHA256 of "<t>.<raw body>">`. Retries with exponential backoff; after
`cfg.delivery.maxAttempts` → `dead` (visible + retryable in the Systems admin view). Receivers
dedupe on `event.id`.

## API (all JSON, `ApiError` on failure; session unless noted)

| Method + path | → |
|---|---|
| POST `/api/consultant/leads/search` | `LeadSearchInput` → `Lead[]` (replaces `GET leads?q=`; GET leads keeps `stage`/`scope` only and returns 400 if `q` is present) |
| GET/POST `/api/consultant/meetings?from=&to=&leadId=` · PATCH `meetings/[id]` | `MeetingInput`/`MeetingPatch` → `Meeting` |
| GET `/api/consultant/calendar` | → `CalendarConnection[]` |
| GET `/api/consultant/calendar/[provider]/connect` · GET `.../callback` · DELETE `/api/consultant/calendar/[provider]` | OAuth (state = signed, short-lived, bound to member) |
| POST `/api/consultant/uploads` | `UploadRequest` → `UploadTicket` (signed upload URL, private bucket) |
| GET/POST `/api/consultant/goals?consultantId=` · PATCH/DELETE `goals/[id]` | `GoalInput`/`GoalPatch` → `Goal` |
| GET `/api/consultant/metrics?period=&consultantId=` | → `FunnelMetrics` (own; managers any or `team` → `{ team: FunnelMetrics, byConsultant: (FunnelMetrics & {consultantId,name})[] }`) |
| GET `/api/consultant/leaderboard?period=&rankBy=points\|revenue` | → `Leaderboard` |
| GET/PUT `/api/consultant/settings/gamification` | `GamificationSettings` (PUT needs `manage_gamification`) |
| GET `/api/consultant/rewards?status=pending\|all` · POST `rewards/[id]/fulfil` | `Reward[]` (fulfil needs `manage_gamification`) |
| POST `/api/consultant/deals/[leadId]/payment` | `PaymentConfirmInput` → `Deal` (needs `confirm_payments`; sets stage `paid`) |
| GET `/api/consultant/deals/[leadId]/proof` | 302 to a short-lived signed URL (owner consultant or manager) |
| GET `/api/consultant/training` · POST `training/[moduleId]/complete` | `TrainingModule[]` (sequential unlock enforced server-side) |
| GET `/api/consultant/admin/health` | `SystemHealth` (needs `view_system_health`) |
| GET `/api/consultant/admin/dead-letters` · POST `admin/dead-letters/[kind]/[id]/retry` | kind = `event` \| `message` (needs `view_system_health`) |
| GET `/api/consultant/messages?leadId=` | `EmmaMessage[]` (lead owner or manager) |
| POST `/api/webhooks/n8n-ingress` (**no session**, `X-VS-Signature`) | `N8nIngress` → `{ok, result}`; idempotent via `consultant_ingress_keys` |
| POST `/api/webhooks/emma-inbound` (**no session**, Twilio signature) | WhatsApp/SMS replies: STOP/START consent, reply → consultant notification + audit |
| POST `/api/webhooks/emma-status` (**no session**, Twilio signature) | message status callbacks |
| GET `/api/cron/consultant-dispatch` (Bearer `CRON_SECRET`) | deliver events, send due Emma messages, calendar retries, award tiers |
| `Lead.score`, `Lead.deal` | included on `GET leads/[id]` (and optionally lists) |

Realtime: **nudges only** (no data) on Supabase Realtime broadcast topics
`${cfg.realtime.channelPrefix}:call:<callId>` (new transcript segment) and
`${prefix}:leaderboard` (any metric-affecting change). Client refetches through the authed API.

## Agent ownership (nobody edits another agent's files)

| Agent | Owns |
|---|---|
| **1 UI/UX** | `app/consultant/**` pages + `components/consultant/**` (all new screens below), `ai-configs/coach-alex/cards.ts` (moved from `lib/consultant/coach/cards.ts`, which becomes a one-line re-export), `lib/consultant/training/modules.ts` (the 6 module definitions) |
| **2 Frontend** | `lib/consultant/client/**`, `hooks/consultant/**`, `lib/consultant/coach/matcher.ts`, `public/consultant-sw.js`, `lib/consultant/client/format.ts` (`formatZar`, `formatSast*`) |
| **3A Integrations & data science** | `lib/consultant/server/events/**`, `lib/consultant/server/emma/**`, `lib/consultant/server/realtime.ts`, `lib/consultant/server/audit.ts`, `lib/consultant/server/repo/{deals,metrics,leaderboard,rewards,settings}.ts`, `lib/consultant/server/scoring/**`, `lib/consultant/metrics/**` (pure calculator + funnel maths), `ai-configs/emma/**`, `ai-configs/coach-alex/review-prompt.ts` (move the summary system prompt here; update `summaryModel.ts` to import it), routes: `deals/**`, `metrics`, `leaderboard`, `settings/**`, `rewards/**`, `admin/**`, `messages`, `app/api/webhooks/{n8n-ingress,emma-inbound,emma-status}`, `app/api/cron/consultant-dispatch`, `app/api/consultant/me` (add `permissions`), and the realtime publish call inside `lib/consultant/server/repo/segments.ts` |
| **3B Scheduling, storage & data** | `lib/consultant/server/calendar/**`, `lib/consultant/server/storage.ts`, `lib/consultant/server/repo/{meetings,goals,training}.ts`, routes `meetings/**`, `calendar/**`, `uploads`, `goals/**`, `training/**`, `leads/search` + the `q` removal in `leads/route.ts`, `scripts/consultant-seed-staging.ts`, stage automation from meetings (booking a discovery → `discovery_booked`; `no_show` → lead `no_show`; demo held → `demo_done`), and fixing `tests/unit/consultant/server/stageMapping.test.ts` for the new stages |
| **4 QA** | runs after all others — `tests/**/consultant/**` |
| **5 DevOps/Security** | `lib/consultant/auth/**` (incl. new `signing.ts`, `crypto.ts`), `lib/admin/{roles,rbac-paths}.ts`, `middleware.ts` (additive), CSP in `securityHeaders.ts`, `vercel.json`, `.env.example`, `package.json` scripts, `scripts/consultant-storage-setup.ts`, `docs/consultant-portal/{DEPLOY,POPIA,STAGING}.md`, `AGENTS.md`, `.cursorrules`, `.cursor/rules/**` |
| **EMMA bridge** (separate repo `/home/user/EMMA`) | receiver for platform events + GitHub build progress → Jono |

### Seams (code to these names)
**5 → everyone**
- `lib/consultant/auth/signing.ts`: `signBody(secret: string, rawBody: string, nowSec?: number): string` (header value) and `verifyBody(secret: string, rawBody: string, header: string | null, toleranceSec: number, nowSec?: number): boolean` (constant-time).
- `lib/consultant/auth/crypto.ts`: `encryptSecret(plain: string): string`, `decryptSecret(enc: string): string` (AES-256-GCM, key `cfg.calendar.tokenEncKey`; throws a typed error if unset).
- Permissions (new): `confirm_payments`, `manage_gamification`, `view_system_health`, `view_team_performance`. Roles (new): `systems_ops` ("Systems & Operations": use_consultant_portal read-only manager + view_system_health), `acquisition_creative` ("Acquisition & Creative Direction": use_consultant_portal read-only manager + manage_gamification + view_team_performance). `super_admin` all; `admin` all four; `agent_manager` confirm_payments + view_team_performance; `sales_consultant` unchanged.
- `requireConsultant(opts?: { manager?: boolean; call?: boolean; permission?: Permission })` and `ConsultantSession.permissions: Permission[]`.

**3A → 3B / 1 / 2**
- `lib/consultant/metrics/calculator.ts`: `calculate(input: CalculatorInput): CalculatorResult` (pure; `Math.ceil` on counts; documented formula).
- `lib/consultant/server/repo/metrics.ts`: `metricValue(db, consultantId: string, metric: GoalMetric, fromIso: string, toIso: string): Promise<number>` (3B uses it for goal progress) and `funnel(db, scope, period)`.
- `lib/consultant/server/realtime.ts`: `nudge(topic: "leaderboard" | { callId: string }): Promise<void>` (fire-and-forget, never throws).
- `lib/consultant/server/audit.ts`: `audit(db, entry: { actorId: string | null; actorKind: "member"|"system"|"n8n"|"twilio"; action: string; entity: string; entityId?: string; meta?: Record<string, string|number|boolean|null> }): Promise<void>`.
- `lib/consultant/server/events/dispatch.ts`: `dispatchDue(db, opts?)` and `kickDispatch()` (schedules `after()`); 3B calls `kickDispatch()` after meeting/goal mutations.

**3B → 3A**: `lib/consultant/server/calendar/retry.ts`: `retryCalendarSync(db, limit: number): Promise<{ attempted: number; synced: number; failed: number }>` — called by the dispatch cron. `lib/consultant/server/storage.ts`: `createUploadTicket(...)`, `signedViewUrl(path)`, `deleteObject(path)` (3A uses for payment proof).

**2 → 1** (additive to wave-1 hooks)
- `lib/consultant/client/api.ts` gains a typed method for every endpoint above.
- `hooks/consultant/useRealtimeNudge.ts`: `useRealtimeNudge(topic, onNudge)`; `useLiveTranscript` and a new `useLeaderboard(period, rankBy)` use it (with polling fallback).
- `lib/consultant/client/format.ts`: `formatZar(n)`, `formatSastDateTime(iso)`, `formatSastDate(iso)`, `formatSastTime(iso)`, `sastWallClockToIso(date, time)`.
- `hooks/consultant/useServiceWorker.ts` (registers `/consultant-sw.js` with scope `/consultant/`).
- Stores migrated to **Zustand + persist** (outbox, drafts, persisted query cache) with the same public hook APIs and passing tests.
- Optional Coach Alex audio cues: `hooks/consultant/useCoachAudio.ts` (off by default, headset-only toggle, Web Speech `speechSynthesis` fallback).

## Screens (Agent 1)
- **Why Board** `/consultant/why`: goal cards with image (signed URL), the "why", target date, KPI
  progress bar and "what it takes per day" from `Goal.dailyPlan`; create/edit with image upload;
  managers can view any consultant's board.
- **Performance** `/consultant/performance`: full funnel (dials → connects → conversations →
  meetings booked/held/no-show → proposals → won → paid), both headline ratios vs the 30% target,
  avg sale, cycle days, pipeline + weighted pipeline, velocity; the **calculator** (goal →
  deals → answered calls → dials per working day, with editable rates defaulting to the
  consultant's actual rates where data exists); managers see the team and per-consultant table.
- **Leaderboard** `/consultant/leaderboard`: period tabs, rank by points or revenue, every metric
  incl. commission; quarterly target bar; Tier 1 / Tier 2 / Tier 3 badges with placeholder
  reward graphics (Takealot voucher, VantageStack apparel — simple SVG/CSS placeholders, no
  third-party logos); live via nudges.
- **Training** `/consultant/training`: 6 sequential modules (8-second clips), locked until the
  previous is done, progress bar; `<video playsInline>` with a "clip coming soon" placeholder.
- **Settings** `/consultant/settings`: connect Google / Outlook calendars, status, disconnect;
  Coach Alex audio cue toggle.
- **Lead workspace additions**: schedule discovery/demo (SAST picker), mark held / no-show, the
  deal panel (sale value, won, payment status; managers get "Confirm payment" with proof upload),
  deal score (churn band, win probability, CLV, top factors), Emma message history.
- **Pipeline**: `no_show` and `paid` columns/tabs.
- **Admin** (`/consultant/admin/systems` for `view_system_health`: health, dead letters with
  retry; `/consultant/admin/growth` for `manage_gamification`/`view_team_performance`: pipeline
  velocity, gamification settings editor, rewards to fulfil).
- **Demo** `/consultant/demo`: embed the existing `components/sandbox/DemoSandbox.tsx` so a
  consultant can let a clinic hear the AI agent (reuse, don't fork).
- **Coach Alex tone**: rewrite card copy so consultant-facing lines (Listen, theory, stage
  tracker) carry a high-velocity, elite direct-sales standard (pace, commit to a next step every
  call), while what is said **to the clinic** (Ask, Reframe, Confirm) stays calm, curious NEPQ.
