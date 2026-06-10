import { NextRequest, NextResponse } from 'next/server'

function getCredentials() {
  const apiKey = process.env.ELEVEN_LABS_API_KEY || process.env.ELEVENLABS_API_KEY
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID
  return { apiKey, agentId }
}

export async function GET() {

  const { apiKey, agentId } = getCredentials()
  if (!apiKey || !agentId) return NextResponse.json({ error: 'ElevenLabs credentials not configured' }, { status: 500 })

  const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
    headers: { 'xi-api-key': apiKey },
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: text }, { status: res.status })
  }

  return NextResponse.json(await res.json())
}

export async function PATCH(req: NextRequest) {

  const { apiKey, agentId } = getCredentials()
  if (!apiKey || !agentId) return NextResponse.json({ error: 'ElevenLabs credentials not configured' }, { status: 500 })

  const body = await req.json()

  const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
    method: 'PATCH',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: text }, { status: res.status })
  }

  return NextResponse.json(await res.json())
}
