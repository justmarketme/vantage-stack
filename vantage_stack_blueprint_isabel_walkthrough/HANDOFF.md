# HANDOFF — Isabel-Guided Blueprint Experience

Everything a fresh developer/agent needs to continue. Built 2026-06-26.

## What this is
`/blueprint` is now an interactive, Isabel-guided intake: Isabel (ElevenLabs ConvAI, South African voice "Cay") greets and leads the conversation, can drive the on-screen form by voice, weaves in real case studies, books a Cal.com call, captures POPIA WhatsApp consent, and ends the voice call gracefully when the user wants to stop. A transparent "hologram" Isabel video sits on the left (desktop); a soft ambient track plays under it and ducks when she speaks.

## Status — what's DONE & live
- **Form engine** (Layer 1): XState v5, schema-driven for quick + detailed forms. Unit-tested.
- **Guided deck**: `/blueprint` renders the machine one step at a time. `?form=detailed` = longer schema.
- **Voice glue** (Layer 3): Isabel's 7 client tools → `blueprint:tool` events → machine (set/advance/prev/submit) + field highlight + Cal.com + consent. Verified by event dispatch.
- **ElevenLabs agent (live):** canonical NEPQ persona, natural lead-in opener, polite laughter, **Cay** voice with expression up (stability 0.35), KB = site knowledge + case studies + live pages, 7 form-driving client tools, `end_call` + 40s silence backstop, stop/mute awareness (offers to continue by text).
- **Booking + POPIA consent:** required `whatsappConsent` checkbox on the final step; booking tool opens Cal.com prefilled; WhatsApp continuation via the existing Isabel bot (STOP = opt-out).
- **Video** (`public/videos/isabel_intro.mp4`) + **audio** (`public/audio/blueprint-ambient.mp3`) — generated, processed, lazy-loaded for performance.
- **Homepage → /blueprint** routing via `%%GOTO_BLUEPRINT%%`.

## Key files
| Concern | File |
|---|---|
| Form schema (both) | `lib/blueprint/form-schema.ts` |
| Form machine | `lib/blueprint/form-machine.ts` (+ `tests/unit/blueprint-form-machine.test.ts`) |
| Guided deck | `components/blueprint/GuidedBlueprint.tsx` |
| Voice tools / glue | `lib/blueprint/voice-tools.ts` |
| Isabel widget | `components/IsabelWidget.tsx` |
| Overlay (chroma-key) | `components/blueprint/IsabelOverlay.tsx` |
| Ambient audio | `components/blueprint/BlueprintAmbientAudio.tsx` |
| Persona (source of truth) | `lib/isabel/persona.ts` |
| Page | `app/blueprint/page.tsx` |

## Known limitations / next steps
1. **Live-voice verification:** the LLM actually *calling* the form-driving tools can only be confirmed in a real mic session — every mechanism link is verified, but do a manual voice run on the deployed site.
2. **Audio licence** (Suno free = non-commercial) — upgrade or swap before commercial go-live. Flagged in `BlueprintAmbientAudio.tsx` + DEPLOYMENT.md.
3. **POPIA audit:** consent is captured at submit (timestamped client record). A dedicated consent-audit table + gating `intake.ts`'s WhatsApp send on consent is a recommended hardening.
4. **Intro choreography** (overlay speaks → fades → "jumps" to chat) is not sequenced — Isabel is present as a looping hologram + the chat widget. A scripted intro is a future polish.
5. **Mobile:** the large overlay is hidden below xl by design (Isabel via the chat widget on mobile). Verified responsive (390 / 1024 / 1280 / 1440).

## Regenerating Isabel's video (Gemini Veo, browser)
Prompt used (green screen, no speech, loop): *"Full-figure cinematic shot of Isabel, a strikingly attractive elegant professional South African woman, early 30s, radiant olive skin, dark hair in a sleek low bun, navy blazer over a black top with a small SA flag pin, against a solid bright chroma-key green screen, warm welcoming smile + gentle open-hand welcome, NOT speaking, soft beauty lighting, loops seamlessly."* → download → `ffmpeg -i raw.mp4 -vf "delogo=x=1108:y=552:w=120:h=140" -c:v libx264 -crf 18 -an public/videos/isabel_intro.mp4`.

## Planning artifacts (this folder)
`VANTAGE_STACK_BUILD_PLAN.md` (original plan), `AUDIT_REPORT.md` (Phase 0), `ARCHITECTURE_PLAN.md` + `DEPENDENCY_GRAPH.txt` (Phase 1), `ARCHITECTURE.md` / `DEPLOYMENT.md` / `HANDOFF.md` (this set).
