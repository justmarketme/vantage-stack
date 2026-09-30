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

- **Strategic influence:** Fuselab Creative (dark-mode, high-density data visualisation and
  telemetry dashboards) and Clay Global (sleek, frictionless B2B enterprise user journeys).
- **Why:** the platform requires a cinematic, high-status "Formula 1 Command Center" aesthetic
  for the internal sales team, but must also use progressive disclosure so clinic owners aren't
  overwhelmed by data. *(See Open question 1 before applying the F1 aesthetic.)*

| Sub-agent | Persona | Directives |
|---|---|---|
| 1.1 Visual Design Lead | Dieter Rams | Functional minimalism. Enforces the strict dark-mode palette; colour-coded deal-health metrics (Red/Yellow/Green) pop against the dark UI without causing eye strain. |
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

## Open questions — ask Jono, do not assume

1. **F1 "Command Center" aesthetic.** This directive calls for it for the internal sales team,
   but on 2026-09-30 Jono also asked for the "Dark F1-telemetry command center" to be excluded
   as creep from a separate project. Until he confirms, use the existing VantageStack design
   system (Space Grotesk + Inter, dark) and do not introduce F1/telemetry styling.
2. **Hosting.** Sub-agent 5.1 mentions Lovable.dev; this repo is Next.js on Vercel. Confirm
   before moving anything.
