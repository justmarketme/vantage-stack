import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVEN_LABS_API_KEY || process.env.ELEVENLABS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ElevenLabs API key not configured' }, { status: 500 })

  const { agentId, message, history = [] } = await req.json()
  if (!agentId || !message) return NextResponse.json({ error: 'agentId and message required' }, { status: 400 })

  // Build conversation history for context
  const conversationHistory = (history as { role: string; text: string }[]).map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.text,
  }))

  // Use ElevenLabs ConvAI text endpoint
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}/simulate-turn`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: message,
      conversation_history: conversationHistory,
    }),
  })

  if (!res.ok) {
    // Fallback: just echo that the feature needs the right endpoint
    const text = await res.text()
    return NextResponse.json({ error: text }, { status: res.status })
  }

  const data = await res.json()
  // ElevenLabs returns the agent's text response
  const reply = data.output ?? data.response ?? data.text ?? data.message ?? JSON.stringify(data)
  return NextResponse.json({ reply })
}
