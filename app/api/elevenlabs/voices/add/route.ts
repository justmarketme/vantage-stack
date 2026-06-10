import { NextRequest, NextResponse } from 'next/server'

// Adds a shared/public ElevenLabs voice to the user's account library so it
// can be assigned to an agent. Returns the new voice_id in the user's library.
export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVEN_LABS_API_KEY || process.env.ELEVENLABS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ElevenLabs API key not configured' }, { status: 500 })

  const { voice_id, public_owner_id, name } = await req.json()
  if (!voice_id || !public_owner_id) {
    return NextResponse.json({ error: 'voice_id and public_owner_id are required' }, { status: 400 })
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/voices/add/${public_owner_id}/${voice_id}`,
    {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_name: name }),
    }
  )

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: text }, { status: res.status })
  }

  const data = await res.json()
  // ElevenLabs returns { voice_id: "<new-id-in-your-library>" }
  return NextResponse.json({ voice_id: data.voice_id ?? voice_id })
}
