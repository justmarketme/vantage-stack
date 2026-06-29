# ARCHITECTURE_PLAN.md — Phase 1 Gap Analysis & Architecture
**Project:** Vantage Stack — Blueprint + Isabel Walkthrough
**Date:** 2026-06-26
**Owner:** ArchitectPlanner · **Depends on:** AUDIT_REPORT.md
**Status:** AWAITING JONATHAN'S APPROVAL — no build code until approved.

---

## 1.1 Target state

User lands on the blueprint experience → ambient music fades in → Isabel appears as a transparent "hologram" overlay, introduces herself, then "jumps" into the chat widget → she guides the (quick) form one field at a time, highlighting the active field, confirming answers, and weaving in **one** relevant capability/case-study when an industry or pain point comes up → progress bar tracks completion → on completion she offers booking → Cal.com pops up → POPIA WhatsApp-consent (explicit, logged, revocable) → submit → Isabel continues on WhatsApp.

### Three-layer decoupled architecture (unchanged from plan — it's the right shape)
- **Layer 1 — Form State Engine (XState v5, NEW).** Owns schema, validation, slide progression. Knows nothing about voice. Emits `fieldHighlighted`, `slideAdvanced`, `validationFailed`, `formCompleted`.
- **Layer 2 — Voice/Conversation (ElevenLabs ConvAI, EXISTS — extend).** Listens/understands/speaks. Emits semantic events via **client tools**: `userProvidedField`, `userConfirmed`, `userRequestedHelp`, `userReadyToBook`. Reuses the live agent + RAG KB.
- **Layer 3 — Orchestration glue (NEW, thin).** Translates between the two and drives the React UI. Frontend owns deterministic choreography (highlight, advance, transitions) for snappy feedback; ElevenLabs owns reasoning/speech.

**Why decoupled:** any one layer can be swapped — different video generator, different form schema, different LLM — without breaking the others. The existing ConvAI agent already separates "brain" (dashboard) from "app", so this fits the codebase.

---

### Experience scoping (clarified by Jonathan, 2026-06-26)

The guided experience is **page-scoped**, not global:

- **Homepage / normal site:** Isabel stays in her existing floating chat widget (text + voice), behaving as today. When a visitor wants to do the blueprint, Isabel **routes them to `/blueprint`** (new `navigateToBlueprint()` client tool; she already shares the link in her persona) and offers to guide them.
- **`/blueprint` page only:** the full orchestrated walkthrough — form state machine + voice choreography + (v2) the transparent video "hologram" Isabel. The `IsabelOverlay` video mounts on this page, **not** in the root layout.
- Net effect: the v2 video work is naturally scoped to one route, and the homepage widget needs only one addition (a navigate-to-blueprint tool).

## 1.2 Gap analysis (REVISED with Phase 0 findings)

| # | Gap | Plan's claim | **Verified reality** | Priority | Solution |
|---|---|---|---|---|---|
| 1 | Form state machine | missing | ✅ confirmed missing (plain `useState`, no xstate) | High | Add `xstate` + `@xstate/react`; build `formMachine.ts` from the **quick** form schema + tests |
| 2 | Voice/conversation layer | missing | ❌ **already LIVE** (`IsabelWidget.tsx`, ConvAI voice+text) | — (reuse) | Add **client tools** to the existing agent; embed a blueprint-scoped instance in the flow |
| 3 | RAG knowledge base | "not configured" | ❌ **already LIVE & attached** (`usage_mode: auto`) | Med | **Content** gap only: add per-vertical case studies to the KB |
| 4 | Cal.com handoff | missing | ⚠️ booking client LIVE (push); **no inbound webhook** | Med | Trigger `openCalendar()` on completion; optional inbound webhook w/ HMAC verify |
| 5 | WhatsApp handoff | missing | ❌ **already LIVE** (Twilio bot) | — (reuse) | Just bridge "post-submit → existing WhatsApp thread" + consent gate |
| 6 | Isabel intro video | missing | ✅ confirmed missing (static JPG only) | High | Veo 3.1 from avatar, green bg → existing watermark script |
| 7 | Transparent compositing | missing | ✅ confirmed missing | High | `IsabelOverlay.tsx` — WebGL chroma key + fallbacks |
| 8 | Background music | missing | ✅ confirmed missing | Low | Source/generate ~70 BPM major-key loop + mute control |
| 9 | POPIA consent on /blueprint | implied | ⚠️ playbook only, no structured record | Med | Explicit logged revocable consent tied to submit |
| 10 | Gemini/Veo access | assumed available | ⛔ `GEMINI_API_KEY` unset, **Veo unconfirmed**, Innate absent | **BLOCKER** | Jonathan to confirm Veo access path before Track A |
| 11 | Isabel prompt drift | not noted | ⚠️ 4 divergent personas; `restore-*` reverts live | Med | Consolidate to one source-of-truth before agent edits |

**Net effect:** the build is ~40% smaller than the plan implies. The heavy lifts are the **video pipeline + overlay + state machine + glue**. Everything conversational/booking/handoff is extend-not-build.

---

## 1.3 Sub-agent roster (revised responsibilities)

| Sub-Agent | Responsibility | Status change vs plan |
|---|---|---|
| `SystemAuditor` | ✅ done (AUDIT_REPORT.md) | complete |
| `ArchitectPlanner` | ✅ done (this doc) | complete |
| `VideoBuilder` | Veo 3.1 gen + watermark removal | **BLOCKED on Veo access (Gap 10)** |
| `CanvasCompositor` | `IsabelOverlay.tsx` WebGL chroma key | unchanged; blocked by VideoBuilder |
| `FormStateEngineer` | XState machine + schema + tests (quick form) | unchanged |
| `ElevenLabsEngineer` | **Add client tools** to existing agent; consolidate persona | scope reduced (agent exists) |
| `KnowledgeCurator` | Write per-vertical case studies → extend existing KB | scope reduced (KB exists) |
| `BookingIntegrator` | Completion→Cal.com + POPIA consent + bridge to existing WhatsApp | scope reduced (booking+WA exist) |
| `AudioIntegrator` | Source/generate + mute control | unchanged |
| `FormOrchestrator` | Event glue (voice↔state↔UI) | unchanged |
| `WebsiteDeployer` | Assemble, e2e test, deploy, docs | unchanged |

---

## 1.4 Access required BEFORE building (state once, sign in once)

1. **Gemini / Google — Veo 3.1** ⛔ *hard blocker for the video track.* Confirm the access path: official API key, browser automation, or the reverse-engineered path. Set `GEMINI_API_KEY`. Without this, Track A cannot start (and the overlay has no source video).
2. **ElevenLabs dashboard** — to add client tools to the live agent and extend the KB. (API key already in env.)
3. **Cal.com** — confirm the Discovery Call event type id; decide whether we add an inbound webhook (needs a signing secret) or keep push-only.
4. **WhatsApp/Twilio** — already live; confirm whether the post-booking handoff message is inside the 24h service window (free-form) or needs an approved template.
5. **Case-study material** — provide (or approve AI-drafted) 3–5 concrete results per vertical for the RAG soft-sell beats.
6. **Background music** — approve sourcing (royalty-free) or generating (Suno) the loop.

---

## Decisions needed from Jonathan (these change the build)

- **D1 — Target form:** build the walkthrough on the **public QUICK form** (recommended — it's what users actually see) or the detached `/blueprint` detailed route?
- **D2 — Video scope:** is the Veo/chroma-key "hologram" Isabel a **must-have v1**, or ship the guided-form + voice + booking first and add the video as v2? (The video is the single slowest, most access-gated, highest-risk piece.)
- **D3 — Persona consolidation:** OK to consolidate the four Isabel prompt scripts to one source-of-truth and neutralise `restore-isabel-prompt.ts` before any agent edits?
- **D4 — Untracked asset folders:** keep `Vantage stack elements/` + `general/` gitignored and reference the watermark tool by path (recommended), or relocate the tool into the app?

---

## Acceptance — Phase 1 complete
Target state defined ✅ · gap analysis reconciled against reality ✅ · three-layer architecture + dependency graph ✅ · access list + decisions surfaced ✅. **PAUSE for approval.**
