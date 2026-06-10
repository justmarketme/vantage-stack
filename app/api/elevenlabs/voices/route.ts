import { NextResponse } from 'next/server'

export async function GET() {
  const apiKey = process.env.ELEVEN_LABS_API_KEY || process.env.ELEVENLABS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ElevenLabs API key not configured' }, { status: 500 })

  const headers = { 'xi-api-key': apiKey }

  // Fetch user's own voices + premade ElevenLabs voices
  const ownRes = await fetch('https://api.elevenlabs.io/v1/voices?show_legacy=true', { headers })
  if (!ownRes.ok) {
    const text = await ownRes.text()
    return NextResponse.json({ error: text }, { status: ownRes.status })
  }
  const ownData = await ownRes.json()
  const ownVoices: unknown[] = ownData.voices ?? []

  // Fetch shared/public voice library (paginated — fetch up to 3 pages = 300 voices)
  const sharedVoices: unknown[] = []
  const pageSize = 100
  for (let page = 0; page < 3; page++) {
    const sharedRes = await fetch(
      `https://api.elevenlabs.io/v1/shared-voices?page_size=${pageSize}&page=${page}&sort=trending`,
      { headers }
    )
    if (!sharedRes.ok) break
    const sharedData = await sharedRes.json()
    const batch: unknown[] = sharedData.voices ?? []
    sharedVoices.push(...batch)
    if (batch.length < pageSize) break // no more pages
  }

  // Merge: own voices first, then public (deduplicated by voice_id)
  const seen = new Set<string>()
  const merged = [...ownVoices, ...sharedVoices].filter((v) => {
    const id = (v as { voice_id: string }).voice_id
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })

  return NextResponse.json({ voices: merged })
}
