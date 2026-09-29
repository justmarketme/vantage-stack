# Vantage Stack Clinics — CRM & Automation Platform (build spec)

The product sold on clinics.vantagestack.co.za: a multi-tenant CRM for private clinics
(SA dental / GP / allied health / aesthetics) that answers enquiries instantly, reminds
patients before appointments, follows up no-shows, and runs recalls — over WhatsApp and SMS
via Twilio. POPIA-compliant by construction.

Branch `feat/clinic-crm` (worktree `.claude/worktrees/clinic-crm`), built on `feat/clinics-landing`.

## Fixed contracts — do not change without the coordinator
- `lib/clinic-crm/types.ts` — zod input schemas + response types. FE and BE both import it.
- `lib/clinic-crm/schema.ts` — DDL (Postgres schema `clinic_crm`, RLS on, no policies).
- `lib/clinic-crm/db.ts` — `clinicDb()` + `audit()`.
If you need a contract change, write it under "Contract requests" in your final report instead of editing.

## Surfaces
- UI: `/clinic-crm` (App Router, `app/clinic-crm/**`). Pages: `login`, `/` (Today), `inbox`,
  `patients`, `patients/[id]`, `appointments`, `automations`, `goals` (whiteboard), `settings`.
- API: `/api/clinic-crm/**`, JSON only, errors are `ApiError` `{error, fields?}` — never driver text.

| Method + path | Body / query → response |
|---|---|
| POST `auth/login` | `LoginInput` → `Session` + sets `vs_clinic_session` cookie |
| POST `auth/logout` | → 204 |
| GET `auth/me` | → `Session` |
| GET `dashboard` | → `Dashboard` |
| GET `patients?q=&lead=1` | → `Patient[]` (max 200) |
| POST `patients` | `PatientInput` → `Patient` |
| GET/PATCH/DELETE `patients/[id]` | `PatientPatch` → `Patient`; DELETE = POPIA erasure (hard delete + audit) |
| GET `patients/[id]/export` | → JSON of everything held on the patient (POPIA s.23 access request) |
| GET `appointments?from=&to=` | → `Appointment[]` |
| POST `appointments` | `AppointmentInput` → `Appointment` (schedules reminder outbox rows) |
| PATCH `appointments/[id]` | `AppointmentPatch` → `Appointment` (reschedule re-keys reminders; `no_show` schedules follow-up) |
| GET `conversations` | → `Conversation[]` |
| GET `conversations/[patientId]` | → `Message[]` (marks inbound read) |
| POST `messages` | `SendMessageInput` → `Message` (409 if opted out; 409 if WhatsApp window closed and no template) |
| GET `automations` / PATCH `automations/[id]` | `AutomationPatch` → `Automation` (owner/manager only) |
| GET/POST `goals`, PATCH/DELETE `goals/[id]` | `GoalInput` / `GoalPatch` → `Goal` |
| GET/PUT `state/[key]` | `StateValue` ↔ JSON (cross-device continuity) |
| POST `webhooks/twilio` | Twilio inbound (SMS + WhatsApp), signature-validated, TwiML/empty 200 |
| POST `webhooks/twilio/status` | Twilio status callback, signature-validated |
| GET `cron/dispatch` | `Authorization: Bearer $CRON_SECRET` → drains due outbox rows |

## Agent ownership (flat — nobody edits another agent's files)

| Agent | Owns |
|---|---|
| **1 UI/UX designer** | `app/clinic-crm/**/page.tsx`, `app/clinic-crm/layout.tsx`, `components/clinic-crm/ui/**`, `components/clinic-crm/views/**`, `app/clinic-crm/theme.css` |
| **2 Front-end architect** | `lib/clinic-crm/client/**` (api client, cache, continuity, speech), `components/clinic-crm/providers/**`, `hooks/clinic-crm/**` |
| **3 Back-end integration engineer** | `app/api/clinic-crm/**` (except `auth/*`), `lib/clinic-crm/server/**` (repos, twilio, automations, outbox) |
| **4 QA / systems tester** | `tests/**/clinic-crm/**` — runs AFTER 1–3 land |
| **5 DevOps / security** | `lib/clinic-crm/auth/**`, `app/api/clinic-crm/auth/**`, `middleware.ts` (additive only), `vercel.json` (additive), `scripts/clinic-crm-*.ts`, `package.json` scripts (additive), `docs/clinic-crm/DEPLOY.md`, `docs/clinic-crm/POPIA.md`, `.env.example` |

### Seams between agents (code to these names)
- Auth (agent 5 provides, agent 3 consumes):
  `lib/clinic-crm/auth/session.ts` → `export async function requireSession(req: NextRequest, roles?: StaffRole[]): Promise<Session | NextResponse>`
  (returns a 401/403 `NextResponse` on failure — callers do `if (s instanceof NextResponse) return s;`).
  `export function rateLimit(key: string, limit: number, windowMs: number): boolean` in `lib/clinic-crm/auth/rateLimit.ts`.
- Twilio signature (agent 5 provides, agent 3 consumes):
  `lib/clinic-crm/auth/twilioSignature.ts` → `export function validTwilioSignature(url: string, params: Record<string,string>, signature: string | null): boolean`.
- Client (agent 2 provides, agent 1 consumes): `lib/clinic-crm/client/api.ts` typed fns
  (`api.patients.list(q)`, `api.patients.create(input)`, … one per endpoint above), `useQuery(key, fn)`
  hook with localStorage stale-while-revalidate, `useContinuity(key, initial)` (server-synced draft state),
  `useSpeechInput({ onResult, validate })`, `ThemeProvider` + `useTheme()` (light/dark/system).

## Non-negotiables
- Tenancy: `clinic_id` comes only from the session (or webhook `To` number lookup). Test it.
- POPIA: consent recorded with staff id + time; opt-out (`STOP`, `UNSUBSCRIBE`, `OPT OUT`, `STOPALL`, case-insensitive) sets `opted_out_at` and blocks all outbound except a single confirmation; erasure + export endpoints; audit every read of a patient record and every write.
- No patient data in logs, URLs, or error bodies. No PII in query strings.
- WhatsApp business-initiated sends (reminders, recalls, no-show) outside the 24h window REQUIRE an approved `content_sid`; if missing, fall back to SMS; if SMS not configured, mark outbox row `skipped` with a reason.
- Every number / template / timing in config or DB — nothing inline.
- Don't run `next build` or `next dev` (other agents share the tree). Verify with `npx tsc --noEmit` and jest scoped to your files. The coordinator runs the full build.
