# Core Agent Architecture & Influences

> **Standing directive from Jono.** Every design and code decision on the VantageStack
> platforms filters through these 5 Core Agents, their strategic influences, and their 15
> Sub-Agents. Read this before any work on the Consultant Portal or the Clinic Portal.
>
> Where this directive and a later scope decision disagree, the
> **[Current scope](#current-scope--decisions-that-override-this-directive)** section at the
> bottom wins, and anything listed under **Open questions** must be asked, not assumed.

---

## Agent 1 — Chief Adaptive UI/UX & Interaction Designer

- **Strategic influence:** Fuselab Creative (clear, dense data visualisation) and Clay Global
  (sleek, frictionless B2B enterprise user journeys).
- **Why:** consultants need a motivating, high-performance workspace that never feels like a
  spreadsheet, with progressive disclosure so nobody is overwhelmed by data.

| Sub-agent | Persona | Directives |
|---|---|---|
| 1.1 Visual Design Lead | Dieter Rams | Functional minimalism. Enforces the VantageStack dark palette; colour-coded deal-health metrics (Red/Yellow/Green) read instantly without causing eye strain. |
| 1.2 Behavioural Psychologist | Jeremy Miner & BJ Fogg | Owns the "Coach Alex" persona. Structures the NEPQ (Neuro-Emotional Persuasion Questioning) UI prompts for the Live Coaching Hub and designs the psychological triggers for the Gamified Leaderboard and "Why" board. |
| 1.3 Interaction & Journey Analyst | Don Norman | Owns role-based views. A Sales Consultant sees a completely different, specialised view from a Clinic Owner; progressive disclosure hides complex settings until needed. |

## Agent 2 — Intelligent Frontend Architect & Speech Systems Engineer

- **Strategic influence:** GetDevDone (speed and frontend optimisation) and Acquaint Softtech
  (cross-device, cross-browser consistency).
- **Why:** field sales reps and busy clinic staff need a system that works flawlessly on an
  iPhone on 3G, an iPad in a clinic, or a desktop at HQ. **Offline capability is non-negotiable.**

| Sub-agent | Persona | Directives |
|---|---|---|
| 2.1 Mobile Continuity Specialist | Apple Human Interface Guidelines team | Builds the local offline caching architecture. If a rep loses signal, notes and UI state are saved locally and synced on reconnection. |
| 2.2 Speech Recognition Engineer | Google NLP lead | Mobile speech-to-text validation layer that accurately captures, formats and validates spoken URLs, email addresses and medical terminology. |
| 2.3 Frontend Performance Auditor | Vercel core team | Keeps the DOM lightweight. Flashcards and live leaderboards update in real time (sub-50 ms) without jitter or layout shift. |

## Agent 3 — Backend Integration Engineer & Data Science Strategist

- **Strategic influence:** MuleSoft (enterprise API orchestration) and Workato (complex
  integration automation).
- **Why:** the backend manages high-volume Twilio voice data, WhatsApp routing via the "Emma"
  persona, and internal ML predictions **without cross-contaminating the two distinct builds.**

| Sub-agent | Persona | Directives |
|---|---|---|
| 3.1 Twilio & WhatsApp Protocol Expert | Core Twilio API architect | Owns the "Emma" communication pipeline. Zero-fail delivery of automated SMS/WhatsApp for follow-ups (Clinic Portal) and lead routing (Internal Sales). |
| 3.2 Machine Learning Data Scientist | Andrew Ng | Prediction logic embedded in the backend: Clinic Churn Risk and Patient Lifetime Value (CLV) from historical pipeline data. |
| 3.3 Data Pipeline Architect | Zapier infrastructure lead | The central nervous system: routes frontend offline-sync payloads into the secure CRM database and triggers workflows. |

## Agent 4 — Quality Assurance System Tester & Compliance Auditor

- **Strategic influence:** Teslio (networked, edge-case QA) and DeviQA (rigorous automated testing).
- **Why:** sensitive patient medical inquiries (Clinic Portal) and proprietary commission/sales data
  (Internal). A single data leak or broken workflow is catastrophic.

| Sub-agent | Persona | Directives |
|---|---|---|
| 4.1 Automated Debugging Specialist | Selenium / Cypress master | Continuous E2E testing of the Coach Alex flashcard triggers and Emma WhatsApp dispatch logic. |
| 4.2 Data Privacy & Compliance Officer | POPIA/GDPR legal-tech expert | Gatekeeper for data security: encryption at rest and in transit; every Twilio log and WhatsApp message complies with POPIA and healthcare data standards. |
| 4.3 Performance Analytics Auditor | Quant data analyst | Validates the Performance Calculator: the maths linking a 30% close ratio to daily dial/appointment targets is exact, and the Gamified Leaderboard updates fairly. |

## Agent 5 — DevOps Research Specialist & Infrastructure Architect

- **Strategic influence:** Cloudreach (scalable, secure, cloud-native transformation).
- **Why:** isolated environments for the Internal Platform and the Client Portal, zero-downtime
  deployments, and ironclad security perimeters.

| Sub-agent | Persona | Directives |
|---|---|---|
| 5.1 Cloud Infrastructure Architect | AWS Well-Architected lead | Hosting environments with high availability, load balancing, and **isolated databases for VantageStack vs Clinic Clients.** |
| 5.2 Security & Network Engineer | Zero-trust cybersecurity architect | WAF, rate limiting on the Twilio/WhatsApp APIs against spam/DDoS, secure JWT auth for every role. |
| 5.3 Deployment Automation Lead | CI/CD pipeline master | Every push routes through staging, passes Agent 4's tests, then deploys to production without downtime. |

---

## Current scope — decisions that override this directive

Recorded from Jono, 2026-09-30. These win over the directive above where they conflict.

1. **Active build: the Consultant Portal** (internal sales). Consultants make calls and manage
   their pipeline. Everything they create **feeds the existing VantageStack CRM** (`/crm`,
   `public.clients` / `deals`) and is explicitly tagged as the **VantageStack Clinics vertical**
   so it is never confused with other deal types.
2. **Clinic Client Portal: PAUSED.** Do not build on or modify `/clinic-crm` until resumed.
   When it resumes it is a **results dashboard** for aesthetic clinics — the calls, bookings and
   revenue produced by the AI booking agents VantageStack builds for them. **It does not manage
   patients.** Patient-level features in the directive (patient follow-ups, patient CLV) are
   dormant until then.
3. **Capital Legacy (`Capital_Legacy_cc_leader_board`) is excluded entirely.** No code, design,
   leaderboard logic or data from it is reused or referenced. (Also a Critical Rule in `CLAUDE.md`.)
4. **"Emma" here is a clinic-facing messaging persona, not Jono's personal EMMA assistant.**
   No clinic or prospect data ever flows through the personal EMMA server.

## Decisions (Jono, 2026-09-30) — these override the directive text above

1. **Design system: the standard VantageStack look only** (`tailwind.config.ts` tokens; Space
   Grotesk + Inter). Motorsport / pit-wall / telemetry / neon styling is excluded completely,
   and **amber is not used anywhere in this build**. Colour carries meaning only: red = high-risk
   objection or at-risk deal, brand blue = Coach Alex and stall cards, green = progress, and
   yellow appears only as the middle Red/Yellow/Green deal-health state. The palette lives in
   one file: `components/consultant/theme.css`.
2. **No Lovable.dev and no Google AI Studio.** Lovable is at most a visual reference for any
   builder-style interface. Stack: Next.js on Vercel, Supabase Postgres, Twilio, Claude
   (Anthropic API) for Coach Alex analysis, n8n for multi-step orchestration.
3. **Close ratio** is measured from calls through to **the client's payment** (not demos or
   bookings). Target 30%. Show-up and dial-to-appointment rates are editable defaults.
4. **Why Board** goals are visible to the consultant and to managers.
5. **Leaderboard** shows every metric (revenue won, deals won, dials, appointments, points) and
   **commission is visible to all consultants**.
6. **Emma (WhatsApp/Twilio automation)** uses the existing VantageStack WhatsApp number.
7. **Jono's personal EMMA assistant** keeps him up to date on platform activity. This is a
   deliberate, narrow exception to the Current-scope rule 4 above: business events only
   (e.g. deal won, payment received, consultant milestones), never clinic patient data.

## Supplementary directive (2026-09-30) — accepted into the plan

- Supabase (Postgres + Realtime) and Vercel; n8n for multi-step webhook orchestration
  (Emma sequences, notifications) — kept out of the live-call hot path.
- Voice AI: ElevenLabs / Ultravox (already in this repo). Coach Alex optional spoken cues;
  Emma voice follow-ups; the existing demo sandbox (`components/sandbox/DemoSandbox.tsx`) is
  the reference for letting a clinic hear the AI agent during a demo.
- Gamification: quarterly targets with Tier 1 "Monthly Achiever" and Tier 2 "High Performer"
  (Takealot voucher rewards) and Tier 3 VantageStack branded apparel for top quarterly
  performers. Thresholds are config, not code.
- "Sales Readiness & Training" hub hosting a sequential 6-part series of 8-second clips
  (methodology, Why Board, NEPQ flashcards, mobile capture).
- RBAC: distinct admin views for **Systems & Operations** (n8n workflows, database logs, API
  health) and **Acquisition & Creative Direction** (pipeline velocity, UI configuration,
  gamification rewards).
- Codebase optimised for AI-assisted development in Cursor and Google Antigravity: modular
  files, strict TypeScript, plain-English comments on complex logic.
- Coach Alex tone: high-velocity, elite direct-sales standards **for the consultant** (pace,
  next-step commitment on every call, pipeline movement) while the words said **to the
  clinic** stay NEPQ — calm, curious, low-pressure (NEPQ loses its power when pushy).
- Staging is seeded with realistic data (discovery meetings, calendar entries).
- **Localisation (hard rules):** all money is South African Rand (ZAR, shown as `R12 500`);
  every phone number is SA `+27` E.164 in inputs, the database and Twilio/WhatsApp payloads
  (non-SA numbers rejected); every timestamp, schedule and calendar sync is SAST
  (`Africa/Johannesburg`) regardless of the device's timezone.
- **Seed data:** staging gets one generic but realistic test clinic profile (contacts,
  discovery meetings, pipeline stages) so Emma's automations can be tested end to end
  immediately.
- **Prompt isolation:** Coach Alex's and Emma's master prompts and rule sets live in a root
  `/ai-configs` directory, never inside components or route code, so NEPQ logic and
  follow-up rules can be tuned without touching application code.
- **n8n handshake:** dedicated, signed Next.js routes (e.g. `/api/webhooks/n8n-ingress`) are the
  only way payloads pass between the app and n8n.
- **Live-call audio:** the Twilio Voice JS SDK runs in the browser (built). Speech-to-text runs
  on Twilio's side on **both** audio tracks, because the clinic's objections are in the far-end
  audio, which the browser's microphone stream never contains.
- **Offline state:** Zustand with the persist middleware is the client state/offline store
  (outbox, drafts, deck state), plus a service worker so the portal shell and the Coach Alex
  deck open with no signal. Sensitive text (transcripts, summaries) is never persisted.
- **Why Board images:** a private Supabase Storage bucket, RLS on with no public access;
  uploads and views go through short-lived signed URLs issued by the app after its own
  session check (the app uses its own JWT auth, not Supabase Auth, so `auth.uid()` policies
  can't identify consultants).
- **Emma triggers:** event-driven from the database. A Postgres trigger on every pipeline-stage
  change writes an event row (transactional outbox), and a dispatcher sends it, signed and
  idempotent, to n8n within seconds, with retries. This catches every change, whether from a
  drag on the board, the wrap-up sheet or the CRM.

## Resolved

- **Lovable.dev (Sub-agent 5.1).** Not a hosting move. It is a *reference* for what any
  vibe-coding / builder-style interface section should look and feel like, if the platform ever
  needs one. The app stays Next.js on Vercel. (Jono, 2026-09-30)

## Influences → engineering rules (directive 20, 2026-09-30)

What each influence means *in this codebase*. When in doubt, the rule on the right is what gets built.

| Influence | Rule it imposes here |
|---|---|
| Fuselab Creative / Clay Global | A daily-motivation workspace, not a spreadsheet: live numbers, clear hierarchy, dense but calm. **Styling follows Decision 1.** |
| Dieter Rams | Colour only where it carries data (card severity, deal health); nothing decorative; unobtrusive; no amber. |
| Jeremy Miner + BJ Fogg | Coach Alex = Fogg's *Prompt* (card fires the moment the objection is heard) + *Ability* (exact NEPQ wording). Motivation comes from the Why Board and leaderboard. |
| Don Norman | Live call shows only the next action; NEPQ theory stays behind the expand icon. |
| GetDevDone / Acquaint Softtech | Zero layout shift on every page, all devices; reserved space for anything that appears live. |
| Apple HIG | Native-feeling swipe deck, 44px+ targets, offline-first (service worker + Zustand persist). |
| Google DeepMind NLP | Spoken emails, URLs, +27 numbers, aesthetic terms **and South African names** captured without manual correction. |
| Guillermo Rauch / Vercel | Leaderboard and deal health pushed live (Supabase Realtime websockets), no polling jank. |
| MuleSoft / Workato | Next.js hands multi-step automation to n8n asynchronously; never blocks a request or the live call. |
| Jeff Lawson / Twilio | Every Emma message goes through an outbox with retries and a **dead-letter queue**; nothing is dropped silently. |
| Andrew Ng | Churn and CLV as lightweight, explainable scoring in Postgres (SQL functions/views), recalibrated as won/lost data accrues. No external AI wrappers. |
| Wade Foster / Zapier | Pipeline-stage changes emit events from the database (trigger → outbox → n8n). |
| Teslio / DeviQA | Commission and incentive maths are covered by exhaustive tests, including boundaries. |
| Jason Huggins / Selenium | E2E browser tests that Coach Alex cards fire under phone and desktop conditions. |
| POPIA / GDPR frameworks | Data minimisation, encryption in transit and at rest, an audit log of every Emma interaction and every access to pipeline data. |
| Quant pioneers | The 30% close-ratio engine and payouts are mathematically verified; fairness is tested. |
| Cloudreach | Deploys never interrupt selling hours (Vercel atomic deploys; DB changes are additive and backwards-compatible). |
| AWS Well-Architected | Schemas and deployments reviewed against security, reliability, performance, cost. |
| Zero-trust pioneers | Reps reach only their own pipeline; **leaders (Jono, KG, Steph) have global access**. Enforced in the API today; a database-level second wall is planned. |
| Jez Humble / CI/CD | Staging with seeded test data validates every change before it reaches the sales floor. |
