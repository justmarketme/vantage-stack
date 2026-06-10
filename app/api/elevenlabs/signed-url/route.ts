import { NextResponse } from 'next/server'

export async function GET() {
  const apiKey = process.env.ELEVEN_LABS_API_KEY || process.env.ELEVENLABS_API_KEY
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID

  if (!apiKey || !agentId) {
    return NextResponse.json({ error: 'ElevenLabs credentials not configured' }, { status: 500 })
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
    { headers: { 'xi-api-key': apiKey } }
  )

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: text }, { status: res.status })
  }

  const data = await res.json()
  return NextResponse.json({ signedUrl: data.signed_url })
}
