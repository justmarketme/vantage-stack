# avatar-generator (MCP)

Personalized **avatar explainer** pipeline for VantageStack: script → ElevenLabs (video or TTS fallback) → Supabase Storage → `report_drafts` row → CRM notification.

## Tools

| Tool | Purpose |
|------|--------|
| `generate-script` | Build 4–5 min spoken script (Amara persona) from Agent 3 `report_json`. |
| `call-elevenlabs-api` | Call ElevenLabs avatar/video endpoint **or** TTS fallback when `ELEVENLABS_AVATAR_VIDEO_URL` is unset. |
| `upload-to-supabase` | Upload file to Supabase Storage (`reports/{client_id}/avatar_video_{timestamp}.mp4`). |
| `create-draft-record` | Insert row into `report_drafts` (Postgres / CRM DB). |
| `notify-crm` | Log `crm_activity` + optional webhook. |

## Environment

See `.env.example` section **Avatar generator (Agent)**.

Required for full MP4 pipeline when ElevenLabs documents your avatar-video URL:

- `ELEVENLABS_AVATAR_VIDEO_URL` — `POST` target; JSON body includes `script`, `voice_id`, `avatar_id`, `video_format`, `background`.

Storage + DB:

- `DATABASE_URL` (or `SUPABASE_DB_URL`) — for `report_drafts` + `crm_activity`
- `SUPABASE_URL` — project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Storage upload (server-side)
- `SUPABASE_REPORTS_BUCKET` — default `reports`

Optional:

- `CRM_AVATAR_NOTIFICATION_WEBHOOK_URL` — POST JSON when draft is ready
- `ELEVENLABS_AVATAR_VOICE_ID` — female professional voice (SA if available)

## Run

```bash
npm run mcp:avatar-generator
```

Add to Cursor MCP config as server name `avatar-generator`.
