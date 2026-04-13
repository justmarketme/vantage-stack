# VantageStack — Antigravity Project Context

Paste this at the start of any antigravity session working on **VantageStack**.

---

## Ready-to-Paste Prompt for Antigravity

```
You are working on the VantageStack project.

Project details:
- GitHub repo: Motsopule/vantage-stack
- Vercel project: vantage-stack (team: jonos-projects-8697404e, projectId: prj_y1JnywARKccCSRxR86LBBBSsT8zO)
- Supabase project URL: https://tinkmipmxunwvyemhalu.supabase.co

Deployment rules:
- Push code to GitHub (git push origin main) — Vercel auto-deploys on push, no manual deploy needed.
- Never run `vercel deploy` or `vercel --prod` manually unless explicitly asked.
- Apply Supabase migrations via CLI when DB changes are needed.

Environment variable rules:
- Do NOT add trailing \n to any env var values.
- ElevenLabs vars for this project: NEXT_PUBLIC_ELEVENLABS_AGENT_ID, NEXT_PUBLIC_ELEVENLABS_VOICE_ID, NEXT_PUBLIC_ELEVEN_LABS_API_KEY
- Isabel's agent ID: agent_0601kkzcdcm5evk9mjhkxqd7dpjs (ElevenLabs Conversational AI)
- These keys belong ONLY to VantageStack — do not reuse them in Lead Velocity or any other project.

Project isolation — DO NOT touch:
- Capital Legacy (repo: justmarketme/Capital_Legacy_cc_leader_board) — separate Vercel project
- Lead Velocity (uses Ultravox + its own ElevenLabs voice key — different service, different keys)
- Any other project's .env files or Vercel settings
```

---

## Project Map (for reference)

| Project | GitHub Repo | AI Service | Key Names |
|---|---|---|---|
| VantageStack | Motsopule/vantage-stack | ElevenLabs Conversational AI (Isabel) | NEXT_PUBLIC_ELEVENLABS_AGENT_ID |
| Lead Velocity | justmarketme/lead-velocity | Ultravox + ElevenLabs TTS (Ayanda) | ULTRAVOX_API_KEY, ELEVENLABS_EINSTEIN_VOICE_ID |
| Capital Legacy | justmarketme/Capital_Legacy_cc_leader_board | None | — |

## Common Mistakes to Avoid

1. **Trailing `\n` in env values** — Always write values without quotes containing `\n`. Wrong: `"myvalue\n"`. Right: `myvalue`
2. **Deploying to wrong Vercel project** — Always check `.vercel/project.json` matches this project's ID before deploying.
3. **Reusing API keys across projects** — Each project has its own ElevenLabs agent and API key. Never copy keys between projects.
4. **Running `vercel deploy` manually** — Vercel auto-deploys on GitHub push. Manual deploys risk targeting the wrong project.
