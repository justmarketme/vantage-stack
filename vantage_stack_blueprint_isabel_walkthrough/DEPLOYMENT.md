# DEPLOYMENT — Isabel-Guided Blueprint

## App deploy (Vercel)
The app deploys to Vercel on push to `main` (project `prj_y1JnywARKccCSRxR86LBBBSsT8zO`). Secrets live in **Vercel env vars**, never in the repo (`.env.local` is gitignored).

```bash
npm install
npm run build        # must pass before deploy (Next.js production build)
npm test             # unit/integration/e2e
git push origin main # → Vercel production deploy
```

### Required env vars (already in Vercel / .env.local)
`DATABASE_URL`, `SUPABASE_*`, `ADMIN_SESSION_SECRET`, `ELEVEN_LABS_API_KEY`, `NEXT_PUBLIC_ELEVENLABS_AGENT_ID`, `TWILIO_*`, `WHATSAPP_*`, `CALCOM_API_KEY`, `CALCOM_EVENT_TYPE_ID`, `NEXT_PUBLIC_APP_URL`. No new app env vars were added for this feature.

## ElevenLabs agent config (the "brain" — pushed separately, not via git)
The persona, KB, voice, tools, and end-call behaviour live on the shared ConvAI agent (`NEXT_PUBLIC_ELEVENLABS_AGENT_ID`). They are pushed by these scripts (idempotent; run with `node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/<name>.ts`). **All have already been pushed to the live agent.**

| Script | What it sets |
|---|---|
| `scripts/set-isabel-prompt.ts` | Persona + first message (canonical, from `lib/isabel/persona.ts`) |
| `scripts/set-isabel-voice.ts` | Voice = **Cay** (SA), `eleven_multilingual_v2`, stability 0.35 (expression up), speed 1.0. Swap with `VS_VOICE_ID=<id>` (Ava `x8syuETaTA9JYwAbE2JM`, Thandi `BcpjRWrYhDBHmOnetmBl`) |
| `scripts/set-isabel-tools.ts` | Declares the 7 form-driving client tools + attaches `tool_ids` (preserves existing) |
| `scripts/set-isabel-endcall.ts` | Enables `end_call` system tool + `silence_end_call_timeout = 40s` |
| `scripts/upload-isabel-case-studies.ts` | KB: `content/case-studies.md` |
| `scripts/upload-isabel-website.ts` | KB: live Home + Blueprint pages |
| `scripts/restore-isabel-prompt.ts` | Re-applies the canonical persona (no longer downgrades) |

> Single source of truth for the persona is `lib/isabel/persona.ts`. To change Isabel's wording, edit it then run `set-isabel-prompt.ts`.

## Assets (committed, public)
- `public/videos/isabel_intro.mp4` — green-screen Isabel, watermark removed (1.49 MB)
- `public/audio/blueprint-ambient.mp3` — ambient loop (4.58 MB)

## ⚠️ Pre-go-live follow-ups
1. **Audio licence:** `blueprint-ambient.mp3` was generated on Suno's **free plan = non-commercial**. Before commercial go-live, upgrade that Suno song to Pro/Premier or swap a royalty-free loop (one-line `src` change in `BlueprintAmbientAudio`).
2. **Regenerate Isabel video** any time via Gemini Veo (browser) using the prompt in `HANDOFF.md`, then `ffmpeg delogo` (the project ships a watermark script under the local asset folders).
3. The two large local asset folders are **gitignored** (not part of the app).
