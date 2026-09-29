# AUDIT_REPORT.md — Phase 0 System Audit
**Project:** Vantage Stack — Blueprint + Isabel Walkthrough
**Date:** 2026-06-26
**Owner:** SystemAuditor (read-only — no code written)
**Method:** 4 parallel audit agents across (1) blueprint/form, (2) Isabel/ElevenLabs, (3) integrations/Python, (4) brand assets/knowledge.

---

## TL;DR — the headline finding

The build plan assumes five greenfield pillars. **Four of them already exist in production** and only need extension, not creation. This is a *re-use over rebuild* situation. Treat the plan's "High priority — does not exist" items with skepticism; verified status is below.

| Plan assumes missing | Reality | Real work |
|---|---|---|
| ElevenLabs RAG not configured | **EXISTS & LIVE** — KB uploaded, attached to agent, `usage_mode: auto` | Curate/extend KB content; add client tools |
| Voice/conversation layer | **EXISTS & LIVE** — `IsabelWidget.tsx` (ConvAI, voice+text) mounted on every page | Wire it into the form flow + add DOM client tools |
| Cal.com → handoff missing | **PARTIALLY EXISTS** — full v2 booking client, WhatsApp handoff live; no inbound webhook | Add booking-on-completion + (optional) inbound webhook |
| No automated video pipeline | **GENUINELY MISSING** (no Veo, no Innate, `GEMINI_API_KEY` not even set) | Build it — true new work |
| No transparent compositing | **GENUINELY MISSING** — Isabel is a static 1024² JPG, no video | Build it — true new work |
| No form state machine | **CONFIRMED** — plain `useState`, XState not installed | Build it — true new work |
| No background music | **CONFIRMED missing** | Source/generate — true new work |

---

## 0.1 Repo + system inventory

- **Repo type:** TypeScript / Next.js 15 (App Router). No Python in the app itself.
- **Blueprint route:** `app/blueprint/page.tsx` — Server Component → renders `<UnifiedBlueprintForm mode="detailed" />`.
- **Form components:** `components/blueprint/UnifiedBlueprintForm.tsx` (1506 lines — holds BOTH variants), `components/blueprint/BlueprintFlow.tsx` (homepage section wrapper).
- **Validation:** `lib/blueprint/schema.ts` — Zod (`BlueprintSubmitSchema`).
- **Intake pipeline:** `app/api/blueprint/submit/route.ts` → `lib/crm/intake.ts::performClientIntake()`.
- **Isabel widget:** `components/IsabelWidget.tsx` (ConvAI via `@elevenlabs/react` `useConversation`), mounted globally in `app/layout.tsx:24`.
- **Isabel WhatsApp bot:** `app/api/whatsapp/isabel/route.ts` + `lib/isabel/*` + `lib/calcom/booking.ts`.
- **Isabel persona scripts:** `scripts/set-isabel-prompt.ts` (LIVE/canonical), plus drift copies (see Gaps).
- **Isabel knowledge base:** `content/isabel-knowledge-base.md` (158 lines) → uploaded via `scripts/upload-isabel-kb.ts`.
- **Isabel image:** `public/images/isabel-avatar.jpg` — **1024×1024**, the only Isabel visual; **no video exists**.
- **Watermark-removal Python:** `Vantage stack general/Vantage stack elements/vantage-social-engine/tools/remove_watermark_free.py` (ffmpeg `delogo`) + siblings. Lives in the **untracked** asset folders, not the app.
- **Brand:** `tailwind.config.ts` + `mcp/design-system/tokens.json` + `lib/design-system/tokens.ts`; logos in `public/images/`.

### Current /blueprint form — actual structure
- **Public traffic uses the QUICK form** (3 steps, 4 branching paths) via homepage anchor `#blueprint` (`BlueprintFlow.tsx`, `id="blueprint"`). 11 CTAs point to `#blueprint`; **zero** link to the literal `/blueprint` route.
- The standalone `/blueprint` route renders the **DETAILED** form (4 fixed steps), effectively unlinked from public nav.
- **Quick form steps:** (1) Business — `clientName`, `industry` (13 opts), `subNiche`, `websiteExists`, `revenueRange`, `primaryIntent` (LEADS/PRESENCE/AUTOMATION/EXPLORE), `previousVendorExp`. (2) Branch-specific. (3) Contact — `email`, `whatsapp` (req), `websiteUrl`, `urgencyTimeline`, `primarySocialHandle`, etc.
- **State:** plain React `useState` (one flat ~35-field object + `step` integer). No reducer / RHF / Zustand / XState. Progress bar exists (`components/ui/ProgressBar`); step swap is conditional render, no animated transitions.

---

## 0.2 Integration map (verified)

| Integration | Status | Where | Notes |
|---|---|---|---|
| **ElevenLabs ConvAI** | ✅ LIVE | `IsabelWidget.tsx`, `lib/isabel/elevenlabs-text.ts` | Voice (WebRTC) + text (WS). WhatsApp uses `simulate-conversation` REST (WS doesn't run on Vercel serverless). `@elevenlabs/react ^0.14.3`. |
| **ElevenLabs RAG/KB** | ✅ LIVE | `content/isabel-knowledge-base.md`, `scripts/upload-isabel-kb.ts`, `app/api/elevenlabs/knowledge-base/*` | KB uploaded + attached, `usage_mode: auto`. CRUD API routes exist. |
| **Cal.com** | ✅ LIVE (push-only) | `lib/calcom/booking.ts` (v2 REST) | `getSlots`/`createBooking`/`cancelBooking`. TZ `Africa/Johannesburg`. **No inbound webhook / signature verify.** Fallback link `cal.com/vantagestack/discovery-call`. |
| **WhatsApp** | ✅ LIVE — **Twilio (raw REST)** | `app/api/whatsapp/isabel/route.ts` (inbound), `lib/isabel/whatsapp-send.ts` (typing dots + paced bursts), `app/api/whatsapp/route.ts` (Jessica ack template) | Signature-validated. Content-template system via `WHATSAPP_ACK_CONTENT_SID`. No `twilio` npm SDK. |
| **Gemini** | ⚠️ PARTIAL / inactive | `lib/crm/blueprint-generator.ts` (raw REST, `gemini-2.0-flash`) | Reads `GEMINI_API_KEY` — **not set in `.env.local`/`.env.example`**, so enrichment is effectively off. **No Veo/video usage anywhere.** |
| **Innate** | ❌ ABSENT | — | Only named in the build plan. Not installed/referenced. |
| **Watermark removal** | ✅ EXISTS (offline) | `Vantage stack general/.../tools/remove_watermark_free.py` | ffmpeg `delogo`. In untracked asset folders, not wired to the app. |
| **POPIA / compliance** | ✅ doc exists | `docs/WHATSAPP_COMPLIANCE_PLAYBOOK.md` | Handoff rules documented; not yet a structured consent record on /blueprint. |

### Env var names present in `.env.local` (NAMES only — no values read)
`DATABASE_URL`, `SUPABASE_*`, `ADMIN_SESSION_SECRET`, `APIFY_TOKEN`, `ELEVEN_LABS_API_KEY` (+ back-compat `ELEVENLABS_API_KEY`), `NEXT_PUBLIC_ELEVENLABS_AGENT_ID`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_WHATSAPP_FROM`, `WHATSAPP_FROM`, `WHATSAPP_ACK_CONTENT_SID`, `NEXT_PUBLIC_APP_URL`, `SERPER_API_KEY`, `CALCOM_API_KEY`, `CALCOM_EVENT_TYPE_ID`, `BOOKING_INVITE_GUESTS`, `NOTIFY_WEBHOOK_SECRET`, `NOTIFY_SMS_RECIPIENTS`.

### Relevant package.json deps
`@elevenlabs/react ^0.14.3` ✅ · `framer-motion ^11` ✅ · `zod ^3.24` ✅ · `postgres ^3.4.7` ✅ · `next ^15` ✅ · `node-vibrant ^4.0.4` ✅ · **`xstate` ❌** · **`@xstate/react` ❌** · **`twilio` SDK ❌** (raw REST) · **`@google/generative-ai` ❌** (raw REST).

---

## 0.3 Current architecture (how it works today)

- **Isabel responds:** website widget = **text + voice** (ConvAI); WhatsApp = **text only** (`simulate-conversation`). **No talking-head video** — only the static avatar JPG.
- **Persona/brain:** lives in the **ElevenLabs dashboard** (one shared agent, dashboard-named "VS DEMO CALLER", id in `NEXT_PUBLIC_ELEVENLABS_AGENT_ID`). Code only *patches* it via REST scripts. The live persona is a sophisticated **NEPQ consultative-sales Isabel** (7-stage discovery, soft-sell, emits `%%BOOK%%` directive, shares the blueprint link). RAG KB attached.
- **Form:** plain `useState`, conditional-render steps, Zod validation, POST to `/api/blueprint/submit` → big upsert into `public.clients` (schema managed at runtime by `ensureCrmSchema`).
- **Booking today:** happens conversationally inside Isabel (widget `%%BOOK%%` → Cal.com embed; WhatsApp slot flow → `createBooking`). It is **not** wired to form completion.
- **Reaching /blueprint:** public users hit the quick form via homepage `#blueprint`; the standalone route is detached.

---

## 0.4 Gaps, risks & access needs

### Genuinely missing (true new build)
1. **Isabel intro video** — no `.mp4/.webm` of Isabel anywhere. Needs Veo 3.1 generation from the 1024² avatar, on a green background.
2. **Chroma-key / transparent overlay** — no compositing component (`IsabelOverlay.tsx` does not exist).
3. **Form state machine** — XState not installed; current form is `useState`. New dependency + machine + tests.
4. **Background audio** — none in repo.
5. **Gemini/Veo access** — `GEMINI_API_KEY` not configured; **no Veo access confirmed**. Innate not installed.
6. **POPIA consent record on /blueprint** — playbook exists, but no explicit, logged, revocable consent capture tied to the form submit.

### Already exists → extend, don't rebuild
- ConvAI voice/text widget · RAG knowledge base · Cal.com booking client · WhatsApp handoff · NEPQ persona · watermark-removal script.

### Risks / bugs flagged (adjacent — not fixed in this read-only phase)
- **Isabel prompt drift:** four divergent personas across `set-isabel-prompt.ts` (live/NEPQ) vs `restore-isabel-prompt.ts` + `setup-isabel-agent.ts` (old "showcase") vs `update-isabel-agent.ts` (a third). **`restore-isabel-prompt.ts` would REVERT the live NEPQ persona** despite its name. `update-isabel-agent.ts` **hardcodes an agent id** instead of reading env. → Recommend consolidating to one source-of-truth before touching the agent.
- **KB content thin for soft-sell:** `isabel-knowledge-base.md` has positioning + pricing but **no concrete per-vertical case studies** (subprime auto, collections, financial services, real estate). The plan's "weave in a relevant case study" beat needs this content created first.
- **Two large untracked folders** (`Vantage stack elements/`, `Vantage stack general/` — ~619 MB) hold the social pipeline + watermark scripts. Decide: keep ignored, or reference the watermark tool by absolute path. Do **not** commit 619 MB into the app repo.
- **Quick vs detailed form divergence** — the walkthrough must target the **quick** form (that's what public users see), not the detached `/blueprint` detailed route. Confirm intent.

### Access Jonathan must provide before building (Phase 1.4)
| Service | Why | Status |
|---|---|---|
| **Gemini / Google (Veo 3.1)** | Generate Isabel's intro video. **No key set, Veo access unconfirmed.** | ⛔ BLOCKER for Track A |
| **ElevenLabs dashboard** | Add client tools + extend KB on the live agent | Key present; dashboard login needed |
| **Cal.com** | Confirm event type + (optional) create inbound webhook + signing secret | API key present |
| **WhatsApp/Twilio** | Already live; confirm 24h-window vs template for post-booking handoff | Configured |
| **Case-study material** | Source content for the soft-sell RAG beats | ⛔ content gap |
| **Background music licence/source** | ~70 BPM ambient loop | Not sourced |

---

## Acceptance — Phase 0 complete
Inventory with exact paths ✅ · integration status verified ✅ · access/gaps flagged ✅. Re-use everything that already works; build only the 6 genuinely-missing items. Proceed to Phase 1 architecture.
