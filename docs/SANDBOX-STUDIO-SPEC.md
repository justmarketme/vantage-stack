# Sandbox Studio — build spec (handoff, 5 Oct 2026)

Branch: `feat/sandbox-studio` (off `origin/main`). Do not deploy; Jono reviews first.
Production deploys are CLI-only (`npx vercel --prod`); the Vercel project has no Git integration.

## Part 1 — SECURITY FIX FIRST (verified live, 5 Oct)

`middleware.ts` matcher covers only `/admin`, `/crm`, `/api/crm`, `/api/admin`.
These routes are therefore public on vantagestack.co.za (anonymous GET returned 200):

| Route | Exposure |
|---|---|
| `/api/elevenlabs/agent` GET/PATCH | read **and rewrite** the live Isabel agent (prompt, voice) |
| `/api/elevenlabs/agent/expressive`, `/audio-tags` | mutate Isabel |
| `/api/elevenlabs/knowledge-base` (+ `/[id]` DELETE) | upload/delete Isabel's KB docs |
| `/api/elevenlabs/voices` (+ `/add`) | burns API quota; adds voices to the account |
| `/api/elevenlabs/signed-url`, `/chat` | free Isabel sessions on our minutes |
| `/api/demo-call/outbound` | **places Twilio calls to any number** (toll fraud) |
| `/api/demo-call/deploy`, `/voice` | Firecrawl/ElevenLabs spend |

Fix: add `"/api/elevenlabs/:path*"` and `"/api/demo-call/:path*"` to the matcher so the
existing session check applies (401 JSON for APIs). Exempt `/api/demo-call/twiml` (Twilio
webhook — must stay public; it only returns TwiML). Before gating, grep that no PUBLIC page
calls these routes (as of this writing only `components/agent-config/AgentConfigDrawer.tsx`,
`app/crm/demo-call/*`, `hooks/useVoiceCall.ts`, `lib/demo-call/*` do — all CRM).
Verify after deploy: anonymous `curl -s -o /dev/null -w "%{http_code}"` on each → 401; `/api/demo-call/twiml` POST → 200.

Also gate `/sandbox` behind the CRM login (add `/sandbox` to matcher; `roleMayAccessPage` already
allows it for any session). It is an internal tool and its new voice list depends on a gated API.

## Part 2 — Sandbox Studio UI (`/sandbox`)

Model the layout on the CRM "Configure Agent" drawer (`components/agent-config/AgentConfigDrawer.tsx`)
— three columns on desktop, stacked on mobile — but with ONE hard difference:
**nothing is ever saved to ElevenLabs.** Everything is a per-session override against the sandbox
agent (`lib/sandbox/config.ts` → `elevenLabsSandbox()`, no production fallback — keep that).
The drawer's Save/PATCH paths target Isabel (`NEXT_PUBLIC_ELEVENLABS_AGENT_ID`) and must not be reused.

Replace `components/sandbox/DemoSandbox.tsx` with `components/sandbox/SandboxStudio.tsx`:

- **Left — tabs**
  - *Persona*: the existing persona cards + prospect details (business, city, caller).
  - *Prompt*: editable system prompt + first message, pre-filled from `buildPrompt()`; once edited it
    stays custom until "Reset to persona". Show the exact text that will be sent.
  - *Settings*: read-only facts — sandbox agent id, max 300 s/call, 50 calls/day, End call enabled.
  - No Knowledge / Phone tabs: KB isn't session-overridable, and Phone places real calls.
- **Middle — Voice**: list from `/api/elevenlabs/voices`, **filtered to account + premade voices only**
  (drop items with `public_owner_id` — library voices can't be used as an override without adding
  them to the account). Preview via `preview_url`. "Agent default" option. Selection →
  `overrides.tts.voiceId`.
- **Right — Test**: Voice / Text toggle, live transcript (`onMessage`), text box using
  `sendUserMessage`, start/end, status + speaking indicator. Text mode → `overrides.conversation.textOnly: true`.

Small fixes while there: persona `firstMessage`/prompt should interpolate business name and city
(clinic prompt hard-codes "Cape Town"; first messages never say the business name).

SDK: `@elevenlabs/react` 0.14.3 (`useConversation`, `startSession({agentId, connectionType:'webrtc', overrides})`).

## ElevenLabs sandbox agent state (agent_0901m4600gwwez8t33pzvtxq976m)
Tools: none except system End call. Overrides enabled: System prompt, First message, Text only.
**Voice override is OFF** — Jono must enable Settings → Security → Overrides → Voice (sandbox agent
only, never "EMMA") or the voice picker silently does nothing. Allowlist: vantagestack.co.za, www.,
clinics., vantage-stack.vercel.app. Max duration 300 s, daily limit 50.

## Done =
`npm run build` passes; on a preview deploy, anonymous requests to the routes above return 401;
logged-in `/sandbox` starts a voice and a text session as the clinic receptionist with the chosen voice;
`/crm/demo-call` still works. Report with evidence; do not merge or deploy to production.
