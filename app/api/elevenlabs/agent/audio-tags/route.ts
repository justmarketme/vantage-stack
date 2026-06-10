import { NextRequest, NextResponse } from 'next/server'

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID
const API_KEY = process.env.ELEVEN_LABS_API_KEY || process.env.ELEVENLABS_API_KEY

export async function POST(req: NextRequest) {
  const { audio_tags } = await req.json()
  if (!AGENT_ID || !API_KEY) return NextResponse.json({ error: 'Not configured' }, { status: 500 })

  const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${AGENT_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': API_KEY },
    body: JSON.stringify({ conversation_config: { tts: { audio_tags } } }),
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: text }, { status: res.status })
  }
  return NextResponse.json({ success: true })
}
