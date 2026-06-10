import { NextRequest, NextResponse } from 'next/server'

function getCredentials() {
  const apiKey = process.env.ELEVEN_LABS_API_KEY || process.env.ELEVENLABS_API_KEY
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID
  return { apiKey, agentId }
}

async function getAgent(apiKey: string, agentId: string) {
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
    headers: { 'xi-api-key': apiKey },
  })
  if (!res.ok) return null
  return res.json()
}

export async function GET() {
  const { apiKey, agentId } = getCredentials()
  if (!apiKey || !agentId) return NextResponse.json({ error: 'ElevenLabs credentials not configured' }, { status: 500 })

  const agent = await getAgent(apiKey, agentId)
  if (!agent) return NextResponse.json({ error: 'Could not fetch agent' }, { status: 500 })

  const knowledgeBase = agent.conversation_config?.agent?.prompt?.knowledge_base ?? []
  return NextResponse.json({ knowledge_base: knowledgeBase })
}

export async function POST(req: NextRequest) {
  const { apiKey, agentId } = getCredentials()
  if (!apiKey || !agentId) return NextResponse.json({ error: 'ElevenLabs credentials not configured' }, { status: 500 })

  const contentType = req.headers.get('content-type') ?? ''
  let kbRes: Response

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    kbRes = await fetch('https://api.elevenlabs.io/v1/convai/knowledge-base/file', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: form,
    })
  } else {
    const { type, text, url: rawUrl, name } = await req.json()
    // Ensure URL has a protocol — ElevenLabs rejects bare domains
    const url = rawUrl && !/^https?:\/\//i.test(rawUrl) ? `https://${rawUrl}` : rawUrl
    const endpoint = type === 'url'
      ? 'https://api.elevenlabs.io/v1/convai/knowledge-base/url'
      : 'https://api.elevenlabs.io/v1/convai/knowledge-base/text'

    kbRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(type === 'url' ? { url, name: name || url } : { text, name: name || 'Document' }),
    })
  }

  if (!kbRes.ok) {
    const text = await kbRes.text()
    return NextResponse.json({ error: text }, { status: kbRes.status })
  }

  const kbDoc = await kbRes.json()
  const docId: string = kbDoc.id

  // Fetch the current agent to get the full prompt state so we don't wipe it
  const agent = await getAgent(apiKey, agentId)
  if (!agent) return NextResponse.json(kbDoc) // return doc even if attach fails

  const currentPrompt = agent.conversation_config?.agent?.prompt ?? {}
  const existing: { type: string; name: string; id: string }[] = currentPrompt.knowledge_base ?? []

  if (!existing.find((d: { id: string }) => d.id === docId)) {
    const patchRes = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
      method: 'PATCH',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_config: {
          agent: {
            prompt: {
              // Preserve all existing prompt fields, only update knowledge_base
              ...currentPrompt,
              knowledge_base: [
                ...existing,
                { type: kbDoc.type ?? 'text', name: kbDoc.name, id: docId },
              ],
            },
          },
        },
      }),
    })

    if (!patchRes.ok) {
      const errText = await patchRes.text()
      console.error('Failed to attach KB doc to agent:', errText)
      // Still return the doc so the client knows it was uploaded
      return NextResponse.json({ ...kbDoc, warning: 'Uploaded but could not attach to agent' })
    }
  }

  return NextResponse.json({ id: docId, name: kbDoc.name, type: kbDoc.type ?? 'text' })
}
