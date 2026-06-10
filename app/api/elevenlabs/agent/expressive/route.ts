import { NextRequest, NextResponse } from 'next/server'

function getCredentials() {
  const apiKey = process.env.ELEVEN_LABS_API_KEY || process.env.ELEVENLABS_API_KEY
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID
  return { apiKey, agentId }
}

export async function POST(req: NextRequest) {
  const { apiKey, agentId } = getCredentials()
  if (!apiKey || !agentId) {
    return NextResponse.json({ error: 'ElevenLabs credentials not configured' }, { status: 500 })
  }

  const { expressive_mode, stability, speed, similarity_boost } = await req.json()

  const tts: Record<string, unknown> = {}
  if (expressive_mode !== undefined) tts.expressive_mode = expressive_mode
  if (stability !== undefined) tts.stability = stability
  if (speed !== undefined) tts.speed = speed
  if (similarity_boost !== undefined) tts.similarity_boost = similarity_boost

  const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
    method: 'PATCH',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversation_config: { tts } }),
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: text }, { status: res.status })
  }

  return NextResponse.json(await res.json())
}
