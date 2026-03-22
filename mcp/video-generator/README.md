# video-generator (MCP)

Turns a markdown business report into:

- a 2–3 minute personalized strategist-style narration script
- ElevenLabs TTS audio (saved to `public/generated-audio/`)
- video metadata + a stored output record (saved to `data/video-outputs.json`)

**Update:** This MCP now supports **report JSON + client profile** and produces a **~4–5 minute** narration, saving audio to `public/reports/{clientId}/{reportId}.mp3` and updating a local `data/reports.json` “reports table”.

## Tools

- `write-video-script`
- `call-elevenlabs-api`
- `generate-video-metadata`
- `store-video-output`

## Environment

Add to `.env.local`:

```
ELEVENLABS_API_KEY=your_api_key_here
```

## Run locally

```bash
npm install
npm run mcp:video-generator
```

## Add to Cursor MCP config

Create an MCP server entry:

- **name**: `video-generator`
- **command**: run the npm script `mcp:video-generator`

## Agent 4 prompt (paste into Cursor)

You are the video automation engine for VantageStack. Your job is to take the generated report and create a personalized video explaining it to the client using Eleven Labs voice synthesis.

Your input is the report JSON and the client profile. Your output is a video URL stored in the reports table.

Create a script template that personalizes the report into spoken narrative. The script should follow this structure:

- greeting saying hello client name, this is your personalized VantageStack report
- thirty second summary of their website health and biggest opportunity
- sixty seconds on competitive gaps
- forty five seconds on revenue opportunity showing specific numbers
- forty five seconds on recommended next steps
- closing with call to action to book a consultation

Total script should be around four to five minutes. Replace all bracket variables like client-name, health-score, monthly-visitors, competitor-name, revenue-projection with actual values from the report. Use conversational language, not robotic.

Then POST this script to the Eleven Labs API endpoint /v1/text-to-speech with your API key, voice ID which you should use a professional but friendly voice like Adam or Rachel, model ID eleven_monolingual_v1, and response format as mp3. Receive the audio file back as a blob.

Upload this audio to storage path: /reports/client-id/report-id.mp3. Store the URL in the reports table in the video-url field. If the Eleven Labs call fails, retry up to two times with a five second delay.

After successful video generation, mark video-complete equals true in the reports table.

