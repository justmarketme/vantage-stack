import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const ELEVENLABS_API_KEY = process.env.ELEVEN_LABS_API_KEY || process.env.ELEVENLABS_API_KEY
    const ELEVENLABS_AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID

    if (!ELEVENLABS_API_KEY || !ELEVENLABS_AGENT_ID) {
      return NextResponse.json({ error: 'ElevenLabs credentials not configured' }, { status: 500 })
    }

    const { systemPrompt, firstMessage } = await req.json()

    const res = await fetch('https://api.elevenlabs.io/v1/convai/conversation/get_signed_url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': ELEVENLABS_API_KEY },
      body: JSON.stringify({
        agent_id: ELEVENLABS_AGENT_ID,
        conversation_config_override: {
          agent: {
            prompt: { prompt: systemPrompt },
            first_message: firstMessage || "Hi! I'm your AI assistant. How can I help you today?",
          },
        },
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: text }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json({ signedUrl: data.signed_url })
  } catch (err) {
    console.error('[voice]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
