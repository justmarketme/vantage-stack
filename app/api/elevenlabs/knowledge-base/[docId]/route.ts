import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  const { docId } = await params
  const apiKey = process.env.ELEVEN_LABS_API_KEY || process.env.ELEVENLABS_API_KEY
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID

  if (!apiKey || !agentId) return NextResponse.json({ error: 'ElevenLabs credentials not configured' }, { status: 500 })

  // Fetch current agent to preserve the full prompt state
  const agentRes = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
    headers: { 'xi-api-key': apiKey },
  })

  if (agentRes.ok) {
    const agent = await agentRes.json()
    const currentPrompt = agent.conversation_config?.agent?.prompt ?? {}
    const existing: { type: string; name: string; id: string }[] = currentPrompt.knowledge_base ?? []

    await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
      method: 'PATCH',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_config: {
          agent: {
            prompt: {
              // Preserve all existing prompt fields, only update knowledge_base
              ...currentPrompt,
              knowledge_base: existing.filter((d) => d.id !== docId),
            },
          },
        },
      }),
    })
  }

  // Delete the document itself from ElevenLabs KB
  const delRes = await fetch(`https://api.elevenlabs.io/v1/convai/knowledge-base/${docId}`, {
    method: 'DELETE',
    headers: { 'xi-api-key': apiKey },
  })

  if (!delRes.ok && delRes.status !== 404) {
    const text = await delRes.text()
    return NextResponse.json({ error: text }, { status: delRes.status })
  }

  return NextResponse.json({ ok: true })
}
