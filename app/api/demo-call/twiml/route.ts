import { NextResponse } from 'next/server'

// Twilio calls this URL when an outbound call connects.
// Returns TwiML that streams the call audio to the ElevenLabs ConvAI agent.
export async function POST() {
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID
  const apiKey = process.env.ELEVEN_LABS_API_KEY || process.env.ELEVENLABS_API_KEY

  if (!agentId || !apiKey) {
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Agent not configured.</Say></Response>`,
      { headers: { 'Content-Type': 'text/xml' } }
    )
  }

  // ElevenLabs Twilio Media Streams WebSocket endpoint.
  // The API key is passed as a query param — this is server-to-server (Twilio → ElevenLabs)
  // so the key is never exposed to end users.
  const streamUrl = `wss://api.elevenlabs.io/v1/convai/twilio?agent_id=${agentId}&xi-api-key=${apiKey}`

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}" />
  </Connect>
</Response>`

  return new NextResponse(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  })
}

// Twilio can also GET this URL in some configurations
export { POST as GET }
