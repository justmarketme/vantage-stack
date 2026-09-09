# ARCHITECTURE — Isabel-Guided Blueprint Experience

How the guided `/blueprint` experience fits together. Three decoupled layers communicate via events; any one can be swapped without breaking the others.

```
┌───────────────────────────────────────────────────────────────────────┐
│  /blueprint  (app/blueprint/page.tsx — the guided experience)         │
│                                                                       │
│   IsabelOverlay ──(left, xl+)     GuidedBlueprint ──(the deck)        │
│   chroma-key video                renders the machine, one step       │
│                                   at a time, schema-selectable        │
│   BlueprintAmbientAudio ──(mute, ducks under Isabel's voice)          │
└───────────────────────────────────────────────────────────────────────┘
            ▲                              ▲                  │
            │ isabel:speaking              │ blueprint:tool   │ SET_FIELD/NEXT/SUBMIT
            │ (duck audio)                 │ (CustomEvents)    ▼
┌───────────┴───────────┐      ┌───────────┴──────────┐  ┌──────────────────────┐
│ Layer 2: Voice         │      │ Layer 3: Glue         │  │ Layer 1: Form machine │
│ ElevenLabs ConvAI      │─────▶│ voice-tools.ts +      │─▶│ form-machine.ts        │
│ (IsabelWidget, global) │ tool │ GuidedBlueprint event │  │ (XState v5) +          │
│ clientTools in session │ call │ listener              │  │ form-schema.ts         │
└────────────────────────┘      └───────────────────────┘  └──────────────────────┘
        │ persona + KB live in the ElevenLabs dashboard (pushed by scripts/)
        └─ %%GOTO_BLUEPRINT%% / %%BOOK%% directives parsed in IsabelWidget
```

## Layer 1 — Form State Engine (deterministic, voice-agnostic)
- `lib/blueprint/form-schema.ts` — the single declarative descriptor of BOTH forms (`quickFormSchema`, `detailedFormSchema`): every field, kind, option, branch rule (`visibleWhen`), validator, and `buildPayload`. `FORM_SCHEMAS = { quick, detailed }`.
- `lib/blueprint/form-machine.ts` — `createFormMachine(schema)` (XState v5). States `idle → filling → submitting → submitted`; events `START/SET_FIELD/TOGGLE_MULTI/NEXT/PREV/SUBMIT`. Emits `fieldHighlighted / slideAdvanced / validationFailed / formCompleted`. The schema is closed over (not in context) so `context` stays JSON-serializable. Zod (`BlueprintSubmitSchema`) validates the payload before the injected `submit` (defaults to `POST /api/blueprint/submit`).
- Tests: `tests/unit/blueprint-form-machine.test.ts` (progression, branch validation, multi caps, submit success/failure, serialization, both schemas).

## Layer 2 — Voice / Conversation (ElevenLabs ConvAI)
- `components/IsabelWidget.tsx` — the global floating widget (text + voice via `@elevenlabs/react useConversation`), mounted in `app/layout.tsx`. Registers the form-driving client tools in `startSession({ clientTools })`. Parses `%%GOTO_BLUEPRINT%%` (→ navigate) and `%%BOOK%%` (→ Cal.com) directives. Broadcasts `isabel:speaking` so the audio can duck.
- The agent "brain" (persona, KB, voice, tools, end_call) lives in the **ElevenLabs dashboard**, pushed by `scripts/` (see DEPLOYMENT.md). Single source of truth for the persona: `lib/isabel/persona.ts`.

## Layer 3 — Glue (voice ↔ state ↔ UI)
- `lib/blueprint/voice-tools.ts` — the 7 client-tool handlers; each dispatches a `blueprint:tool` CustomEvent (decoupled). Also exports `BLUEPRINT_TOOL_DEFINITIONS` (used to declare the tools on the agent).
- `components/blueprint/GuidedBlueprint.tsx` — mounts the machine (`useActor`), renders the current step, and listens for `blueprint:tool` events → drives the machine (set/advance/prev/submit), highlights the active field, opens Cal.com, surfaces the POPIA consent.

## Supporting components
- `components/blueprint/IsabelOverlay.tsx` — WebGL chroma-key of `public/videos/isabel_intro.mp4`. Lazy (preload none + idle-deferred), efficient (`requestVideoFrameCallback`), pauses when hidden, xl-only.
- `components/blueprint/BlueprintAmbientAudio.tsx` — lazy ambient loop (`public/audio/blueprint-ambient.mp3`), very soft, ducks under Isabel's voice via the `isabel:speaking` event, mute control.

## Data flow on submit
`GuidedBlueprint` SUBMIT → machine Zod-validates `schema.buildPayload(data)` (incl. `whatsappConsent`) → `POST /api/blueprint/submit` → `lib/crm/intake.ts performClientIntake()` → upsert `clients` + blueprint generation + (consent-gated) WhatsApp follow-up via the existing Isabel WhatsApp bot.
