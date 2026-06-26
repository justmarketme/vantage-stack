# VANTAGE STACK — BLUEPRINT + ISABEL BUILD ORCHESTRATION PLAN
**Status:** Ready for Claude Code ingestion
**Project Owner:** Jonathan
**Target Outcome:** An interactive blueprint intake experience where Isabel (Vantage Stack's AI assistant) guides users through the form via voice + text, demonstrates Vantage Stack's capabilities naturally, books a consultation, and hands off to WhatsApp.
**Live page being upgraded:** https://www.vantagestack.co.za/blueprint
**Created:** 2026-06-26
---
## HOW TO USE THIS FILE (READ FIRST)
1. Save this file in the root of your Vantage Stack project folder.
2. Open Claude Code in that folder.
3. Paste this single command:
   ```
   Read VANTAGE_STACK_BUILD_PLAN.md and execute it. Start with Phase 0 only.
   Do not write any code until you have completed Phase 0 and Phase 1 and I have approved the plan.
   ```
4. Claude Code will audit your system, show you the gap analysis and the build plan, then pause for your approval before building anything.
---
## OPERATING PRINCIPLES (APPLY THROUGHOUT)
- **Act as a project manager, not just a builder.** Decompose the work, run independent tasks in parallel via sub-agents, and respect blocking dependencies. Never build a thing whose inputs aren't ready yet.
- **First principles, decoupled architecture.** The voice layer, the form-state layer, and the UI layer are three separate concerns that communicate via events. Any one can be swapped (different video generator, different form schema, different LLM) without breaking the others.
- **Audit before you build.** Discover what already exists on the system before writing anything new. Re-use over rebuild.
- **No surprises.** After the audit and gap analysis, explain the plan in plain language and pause for approval before building.
- **Disclose access needs upfront.** Tell Jonathan exactly which services need a login (ElevenLabs, Cal.com, Gemini/Google, WhatsApp) BEFORE starting the build, so he can sign in once and not be interrupted.
- **South African compliance is mandatory.** POPIA consent for WhatsApp contact, and align with NCR/NCA where any credit-adjacent messaging appears. Consent must be explicit, logged, and revocable.
### Brand constants (use these, do not invent)
- Vantage Blue (deep) `#1565B8`
- Vantage Blue (bright) `#2789EA`
- Action Blue `#3B82F6`
- Ink (background) `#0B0B0C`
- State colors: emerald (success), rose (error), amber (warning)
- Isabel = Vantage Stack's AI call-handler product/persona
- "Revenue System™" = core brand framework — reference it where natural
---
## EXECUTIVE SUMMARY
**Technologies:**
- **Video generation:** Gemini Veo 3.1 + Innate (free GitHub version)
- **Watermark removal:** existing Python script
- **Transparent "hologram" overlay:** HTML5 Canvas / WebGL chroma-key compositing
- **Voice + conversation:** ElevenLabs Agents (with RAG knowledge base + client tools)
- **Form state:** XState v5 state machine (deterministic, testable)
- **Orchestration:** event-driven glue (voice → form state → UI), fully decoupled
- **Booking:** Cal.com popup on completion
- **Handoff:** POPIA-compliant WhatsApp consent → Isabel continues on WhatsApp
**The experience, end to end:**
1. User lands on `/blueprint`. Soft ambient music begins (~70 BPM, major key, low volume).
2. Isabel appears on the left as a transparent overlay (only she is visible, no background box) and introduces herself: *"Hi, I'm Isabel — an AI built by Vantage Stack. I'm going to walk you through this, and I'll be right here the whole way."*
3. She "jumps" into the chat widget on the right; the conversation continues there.
4. She guides the form one field at a time — highlighting the active field, confirming each answer, making light, warm small talk.
5. When the user mentions an industry or pain point, RAG surfaces a relevant Vantage Stack capability/case study and Isabel weaves it in naturally (soft-sell, never pushy): *"We actually helped a company in your space automate their intake calls — cut handling time by about 40%."*
6. A progress bar at the top tracks completion. Slides advance like a deck (click-through or Isabel-driven).
7. On completion, Isabel offers booking; the Cal.com calendar pops up; the user books and receives a confirmation email.
8. The user confirms the POPIA WhatsApp-contact consent and submits.
9. Isabel continues the conversation on WhatsApp via the existing integration.
---
## SUB-AGENT ROSTER & DEPENDENCY MATRIX
| Sub-Agent | Responsibility | Blocks | Blocked By |
|---|---|---|---|
| `SystemAuditor` | Inventory the repo + system, map integrations | everyone | — |
| `ArchitectPlanner` | Gap analysis, architecture, dependency graph, plain-language brief | all build agents | `SystemAuditor` |
| `VideoBuilder` | Gemini Veo 3.1 / Innate automation + watermark removal | `CanvasCompositor` | `ArchitectPlanner` |
| `CanvasCompositor` | Transparent overlay + chroma-key rendering | `FormOrchestrator` | `VideoBuilder` |
| `FormStateEngineer` | XState machine + schema + tests | `FormOrchestrator` | `ArchitectPlanner` |
| `ElevenLabsEngineer` | RAG knowledge base, client tools, agent/persona config | `FormOrchestrator` | `ArchitectPlanner` |
| `KnowledgeCurator` | Curate Vantage Stack capabilities/case studies for RAG | `ElevenLabsEngineer` | `ArchitectPlanner` |
| `BookingIntegrator` | Cal.com webhook + POPIA consent + WhatsApp handoff | `WebsiteDeployer` | `ArchitectPlanner` |
| `AudioIntegrator` | Source/generate background music + volume controls | `WebsiteDeployer` | `ArchitectPlanner` |
| `FormOrchestrator` | Event glue layer (voice ↔ state ↔ UI) | `WebsiteDeployer` | `CanvasCompositor`, `FormStateEngineer`, `ElevenLabsEngineer` |
| `WebsiteDeployer` | Final assembly, end-to-end test, deploy, docs | — | all of the above |
### Execution graph
```
SystemAuditor
   └─ ArchitectPlanner
        ├─ TRACK A:  VideoBuilder ──► CanvasCompositor ─┐
        ├─ TRACK B:  FormStateEngineer ─────────────────┤
        ├─ TRACK C:  KnowledgeCurator ► ElevenLabsEngineer ─┤
        ├─ TRACK D:  BookingIntegrator (scaffold; await)  │
        └─ TRACK E:  AudioIntegrator (independent)        │
                                                          ▼
                                              FormOrchestrator
                                                          ▼
                                               WebsiteDeployer
```
**Start in parallel immediately after Phase 1:** VideoBuilder, FormStateEngineer, KnowledgeCurator→ElevenLabsEngineer, BookingIntegrator, AudioIntegrator.
**Hard blocks:** CanvasCompositor waits for VideoBuilder. FormOrchestrator waits for CanvasCompositor + FormStateEngineer + ElevenLabsEngineer. WebsiteDeployer waits for everyone.
**While the Gemini video renders** (the slowest single step), the form machine, RAG setup, booking webhook, and audio work all proceed — nobody sits idle.
---
## PHASE 0 — SYSTEM AUDIT  *(BLOCKING — do this first, write no code)*
**Owner:** `SystemAuditor` · **Output:** `AUDIT_REPORT.md`
### 0.1 Inventory the repo + system
- Recursively scan the Vantage Stack folder. List every `.py`, `.js`, `.ts`, `.tsx`, `.json`, `.md`, and asset file.
- Locate and note paths for:
  - Existing Isabel system prompt(s) / persona config
  - The existing Python **watermark-removal** script (confirm ffmpeg dependency + method)
  - Any existing blueprint page code (React/Next.js?) and the current 4-step form
  - API keys / `.env` files for ElevenLabs, Cal.com, WhatsApp, Gemini
  - Isabel's **widget image** (needed to generate her video)
  - Brand assets, logos, existing case-study / capability docs
### 0.2 Map current integrations
- **ElevenLabs:** API key location, existing voice ID for Isabel, any existing agent.
- **Cal.com:** is a webhook configured? what's the event/calendar link?
- **WhatsApp:** which method — n8n, Twilio, or direct Cloud API? Template status?
- **Gemini:** access path — Chrome extension automation, official API key, or the reverse-engineered Python API? Veo 3.1 access confirmed?
- **Innate (free GitHub version):** installed? where? what does it provide in this stack?
- **Python env:** version, venv, installed packages.
### 0.3 Document current architecture
- How does Isabel respond today (text / voice / video)?
- What form exists now, and how is its state handled?
- How do users currently reach `/blueprint`?
- Where do capability examples / case studies live?
### 0.4 Flag access + gaps
- List every service that will need Jonathan's login during the build.
- Note anything missing, broken, or outdated.
**Acceptance:** a clear written inventory with exact paths, integration status, and a flagged list of access requirements. Re-use everything that already works.
---
## PHASE 1 — GAP ANALYSIS & ARCHITECTURE  *(BLOCKING)*
**Owner:** `ArchitectPlanner` · **Depends on:** Phase 0 · **Output:** `ARCHITECTURE_PLAN.md`, `DEPENDENCY_GRAPH.txt`
### 1.1 Target state
The full experience described in the Executive Summary, plus the three-layer architecture:
- **Layer 1 — Form State Engine** (XState). Knows the schema, validation, slide progression. Knows nothing about voice. Emits events: `fieldHighlighted`, `slideAdvanced`, `validationFailed`, `formCompleted`.
- **Layer 2 — Voice/Conversation** (ElevenLabs Agents). Listens, understands, speaks. Emits semantic events: `userProvidedField`, `userConfirmed`, `userRequestedHelp`, `userReadyToBook`.
- **Layer 3 — Orchestration glue.** Translates between the two and drives the React UI. ElevenLabs handles voice + reasoning; the frontend owns deterministic UI choreography (highlighting, transitions) for snappy feedback.
### 1.2 Gap analysis (fill with real findings from Phase 0)
| Gap | Impact | Priority | Solution |
|---|---|---|---|
| No automated video pipeline | Isabel intro made by hand | High | Gemini Veo 3.1 + Innate automation |
| No transparent compositing | Isabel shows as a box, not a hologram | High | Canvas/WebGL chroma key |
| No form state machine | Fragile progression; UI not bound to state | High | XState v5 + event emission |
| ElevenLabs RAG not configured | Isabel can't reference capabilities in context | High | Knowledge base + RAG agent config |
| Cal.com → WhatsApp handoff missing | Booking doesn't trigger consent/handoff | Medium | Webhook orchestration |
| No background music | Page feels flat/transactional | Low | Suno or royalty-free, ~70 BPM major key |
### 1.3 Plain-language brief for Jonathan
Write a short, jargon-free explanation covering: what already exists, what's being built (the five numbered pillars), why the decoupled/event-driven approach is used, and exactly what access is needed. **Then PAUSE and ask for approval before any build begins.**
### 1.4 Access required (state before building)
- **ElevenLabs** — API key + dashboard access (to configure Isabel's agent, upload RAG docs, set client tools).
- **Gemini / Google** — browser login or API key (for Veo 3.1 video generation).
- **Cal.com** — account access (to verify/create the webhook).
- **WhatsApp** — confirm integration method + credentials.
- Confirm the **Isabel widget image** path and provide the **case-study/capability** material for RAG.
---
## PHASE 2A — VIDEO GENERATION PIPELINE  *(parallel)*
**Owner:** `VideoBuilder` · **Blocks:** `CanvasCompositor`
### 2A.1 Gemini access
- Pick the method confirmed in Phase 0 (Chrome-extension automation via Innate / official API / reverse-engineered Python API).
- Build a script that submits the prompt, polls for completion, and downloads the result.
### 2A.2 Build the Isabel prompt from her widget image
- Open and analyze Isabel's widget image: clothing, hair, skin tone, expression, color palette.
- Generate a Veo 3.1 prompt for a full-figure version, e.g.:
  > "Professional woman, Isabel — [appearance details from the widget image] — standing in a modern office against a solid green background, warm friendly expression, subtle welcoming gesture (slight wave / head nod), 6–8 second seamless loop, no speaking (voiceover added later), cinematic soft lighting, 1080p+."
- **Shoot her against a solid green background** so chroma keying is clean in Phase 2A.5.
### 2A.3 Watermark removal
- Download the generated clip.
- Run the existing Python watermark-removal script.
- Verify no Gemini watermark remains. Save to `assets/videos/isabel_intro.mp4`.
### 2A.4 QA
- 6–8 s, 1080p+, watermark-free, recognizably Isabel, clean green background, smooth loop.
**Deliverable:** `assets/videos/isabel_intro.mp4` (+ the exact prompt saved for regeneration).
### 2A.5 Canvas compositing (transparent hologram)
**Owner:** `CanvasCompositor` · **Depends on:** `VideoBuilder`
- Create `components/IsabelOverlay.tsx`.
- Load the video into a hidden `<video>`; render to a `<canvas>` with WebGL.
- Chroma-key: per frame, set alpha=0 for green pixels, draw the keyed frame (use `requestAnimationFrame`).
- Position Isabel on the left, scaled to the page; layer above the form background but below interactive controls.
- Fade in on load; fade out when she "jumps" into the chat widget.
- Sync playback to Isabel's ElevenLabs voice; loop the clip if the voiceover runs longer.
- Provide a no-WebGL fallback (static keyed PNG or a bordered video) and respect `prefers-reduced-motion`.
---
## PHASE 2B — FORM STATE ENGINE  *(parallel)*
**Owner:** `FormStateEngineer` · **Blocks:** `FormOrchestrator`
### 2B.1 Schema — `form-schema.json`
Four steps (mirror and extend the live form):
1. **Contact** — name/business, email, WhatsApp (with country code), website (optional).
2. **Business** — company size, industry, current challenges.
3. **Goals** — primary goal, timeline.
4. **Confirmation** — summary review, POPIA WhatsApp-contact consent, ready-to-book.
Include type + validation per field (email format, required, tel with country code, URL).
### 2B.2 Machine — `src/machines/formMachine.ts` (XState v5)
- States: `idle → step1 → step2 → step3 → step4 → completed → submitted`.
- Events: `START`, `NEXT` (guarded by per-step validity), `PREV`, `SET_FIELD`, `SUBMIT`.
- Context: `{ currentStep, formData, errors, isSubmitting }`.
- Entry actions per step emit `fieldHighlighted`; transitions emit `slideAdvanced`; failed guards emit `validationFailed`; final emits `formCompleted`.
### 2B.3 Event API
- Expose a subscribe interface so the orchestration layer can react to emitted events.
### 2B.4 Tests
- Progression (valid advances, invalid blocks), validation, event emission, serialization, back-navigation edge cases.
**Deliverable:** `formMachine.ts` + `form-schema.json` + passing test suite.
---
## PHASE 2C — ELEVENLABS AGENT + KNOWLEDGE BASE  *(parallel)*
**Owners:** `KnowledgeCurator` → `ElevenLabsEngineer` · **Blocks:** `FormOrchestrator`
### 2C.1 Curate the knowledge base (`KnowledgeCurator`)
- Compile Vantage Stack capabilities by use case: inbound/outbound voice agents, call answering + making across industries, conversational AI, CRM/automation, websites, the Revenue System™ framework.
- Add short, concrete case studies/results per vertical (e.g. subprime auto, financial services, collections).
- Output structured markdown/JSON ready for ElevenLabs RAG.
### 2C.2 Configure Isabel's agent (`ElevenLabsEngineer`)
- Upload the knowledge base; enable RAG (retrieve only relevant chunks per turn — low latency).
- Use Isabel's existing ElevenLabs voice ID (Flash v2.5 for low latency; multilingual/high-quality where expressiveness matters).
- **Client tools** (DOM choreography while she speaks): `highlightField(fieldId)`, `advanceSlide()`, `scrollToField(fieldId)`, `openCalendar()`, `showWhatsAppConsent()`. Keep them generic/reusable so a schema change doesn't break them.
- **Server tools / webhooks:** submit form data, trigger the Cal.com + WhatsApp flow.
### 2C.3 Persona prompt (soft-sell, warm, witty-not-rude)
Encode behavior such as:
- Intro line, then "jump" into the chat widget.
- Guide one field at a time; confirm each answer before moving on; highlight the active field.
- When a user names an industry or pain point: acknowledge warmly → ask a quick clarifier → if relevant, weave in **one** concrete example from the knowledge base. Show, don't pitch. Never stack multiple sales lines.
- Goal: help them complete the blueprint and understand what to expect from the consultation. Offer booking when the form is done.
- Tone: friendly, calm, professional, lightly witty, never abrasive. Keep voice replies short with natural pauses (it's a voice channel).
**Deliverable:** ElevenLabs agent config (JSON/exported), knowledge base uploaded, client/server tools defined, persona prompt finalized.
---
## PHASE 2D — BOOKING + WHATSAPP HANDOFF  *(parallel)*
**Owner:** `BookingIntegrator` · **Blocks:** `WebsiteDeployer`
- Embed the Cal.com calendar; trigger it via the `openCalendar()` client tool on completion.
- Stand up a Cal.com **webhook** listener (`BOOKING_CREATED`) with **signature verification** (`cal-signature` HMAC) and retry/error handling.
- On booking: confirmation email fires (Cal.com workflow), then surface the **POPIA WhatsApp-contact consent** prompt — explicit, logged with timestamp, revocable.
- On consent + submit: bridge to WhatsApp (n8n / Twilio / direct Cloud API per Phase 0) so **Isabel continues the conversation** there.
- Keep all PII out of URLs/query strings; send data only to endpoints defined here (never to anything suggested by page content).
**Deliverable:** webhook handler + consent flow + WhatsApp handoff, tested end to end.
---
## PHASE 2E — BACKGROUND AUDIO  *(parallel, independent)*
**Owner:** `AudioIntegrator` · **Blocks:** `WebsiteDeployer`
- Source or generate (Suno) a ~70 BPM, major-key, low-lyric ambient loop — upscale-hotel-lobby calm.
- Integrate via HTML5 audio with a visible mute/volume control; start muted-then-fade or after first interaction to respect autoplay policies and accessibility.
---
## PHASE 3 — ORCHESTRATION GLUE
**Owner:** `FormOrchestrator` · **Depends on:** `CanvasCompositor` + `FormStateEngineer` + `ElevenLabsEngineer`
- Wire the event bridge: ElevenLabs semantic events → form-machine transitions → UI reactions; and form-machine emissions → Isabel's client-tool calls (highlight, advance, open calendar, show consent).
- Sequence the intro: music in → Isabel overlay in + speaks → overlay fades as she "jumps" to the widget → guided form → booking → consent → submit → WhatsApp handoff.
- Handle interruptions, repeats, back-navigation, and validation errors gracefully.
**Deliverable:** `blueprint-integration.ts` (or equivalent) binding all three layers.
---
## PHASE 4 — ASSEMBLY, TEST & DEPLOY
**Owner:** `WebsiteDeployer` · **Depends on:** everything
- Assemble the full `/blueprint` page; apply brand constants and responsive/mobile layout.
- End-to-end test: intro → guided form → RAG soft-sell moments → Cal.com booking → confirmation email → POPIA consent → WhatsApp handoff.
- Cross-browser + accessibility checks (keyboard nav, screen-reader labels, reduced-motion, captions/text path for voice).
- Deploy. Then generate the handoff docs below.
### Output docs to generate
- `CLAUDE.md` — project conventions + architecture memory for future sessions.
- `ARCHITECTURE.md` — how the three layers and integrations fit together.
- `DEPLOYMENT.md` — step-by-step deploy + required env vars.
- `HANDOFF.md` — everything a fresh agent/developer needs to continue.
---
## CLAUDE CODE — STARTING SEQUENCE (follow exactly)
1. "Beginning Phase 0 — auditing the Vantage Stack folder now." → run the full audit → output `AUDIT_REPORT.md`.
2. "Audit complete. Running gap analysis and architecture." → output the gap table, sub-agent matrix, and dependency graph.
3. "Here's the plan in plain language." → the Phase 1.3 brief + the access list (ElevenLabs, Gemini, Cal.com, WhatsApp).
4. **PAUSE: "Does this plan look right? Anything to change before I start building?"** → wait for Jonathan's approval.
5. On approval, launch the parallel tracks per the execution graph, respecting all blocks. Report progress per sub-agent. Assemble, test, deploy, and write the handoff docs.
*Do not write build code before step 4 is approved.*
