'use client'

import { useState, useCallback, useRef } from 'react'
import { UltravoxSession, UltravoxSessionStatus } from 'ultravox-client'

export type CallState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'ending'

const ULTRAVOX_API_KEY = process.env.NEXT_PUBLIC_ULTRAVOX_API_KEY as string
const ELEVENLABS_VOICE_ID = process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_ID || 'N2lVS1w4EtoT3dr4eOWO'

interface VoiceCallOptions {
  businessName?: string
  location?: string
  services?: string[]
  pricing?: string
  corpusId?: string
}

async function createUltravoxCall(systemPrompt: string, corpusId?: string): Promise<string> {
  const body: Record<string, unknown> = {
    systemPrompt,
    model: 'fixie-ai/ultravox',
    voice: 'Callum',
    voiceOverrides: {
      elevenLabs: {
        voiceId: ELEVENLABS_VOICE_ID,
        model: 'eleven_turbo_v2_5',
        stability: 0.55,
        similarityBoost: 0.75,
      },
    },
    temperature: 0.7,
    firstSpeaker: 'FIRST_SPEAKER_AGENT',
  }

  if (corpusId) {
    body.selectedTools = [
      {
        toolName: 'queryCorpus',
        parameterOverrides: { corpus_id: corpusId, max_results: 5 },
      },
    ]
  }

  const res = await fetch('https://api.ultravox.ai/api/calls', {
    method: 'POST',
    headers: { 'X-API-Key': ULTRAVOX_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Ultravox ${res.status}: ${text}`)
  }

  const data = await res.json()
  return data.joinUrl as string
}

export function useVoiceCall(opts: VoiceCallOptions) {
  const [callState, setCallState] = useState<CallState>('idle')
  const sessionRef = useRef<UltravoxSession | null>(null)

  const startCall = useCallback(async () => {
    if (callState !== 'idle' || !ULTRAVOX_API_KEY) return
    setCallState('connecting')

    const name = opts.businessName || 'the business'
    const serviceList = opts.services?.length ? opts.services.join(', ') : 'their services'
    const systemPrompt = [
      `You are a friendly, professional AI voice sales agent for ${name}${opts.location ? ` in ${opts.location}` : ''}.`,
      `Services offered: ${serviceList}.`,
      opts.pricing ? `Pricing: ${opts.pricing}.` : '',
      opts.corpusId ? `You have access to a knowledge base about ${name}. Use the queryCorpus tool to answer specific questions accurately.` : '',
      `You are doing a live demo call to show the business owner what their AI agent can do.`,
      `Greet the caller warmly and ask how you can help. Keep responses short and conversational — this is a voice call.`,
      `Offer to: answer service questions, give pricing estimates, book appointments, and handle FAQs.`,
    ].filter(Boolean).join(' ')

    try {
      const joinUrl = await createUltravoxCall(systemPrompt, opts.corpusId)
      const session = new UltravoxSession()
      sessionRef.current = session

      session.addEventListener('status', () => {
        switch (session.status) {
          case UltravoxSessionStatus.IDLE:
          case UltravoxSessionStatus.DISCONNECTED:
            setCallState('idle'); break
          case UltravoxSessionStatus.CONNECTING:
            setCallState('connecting'); break
          case UltravoxSessionStatus.LISTENING:
            setCallState('listening'); break
          case UltravoxSessionStatus.THINKING:
            setCallState('thinking'); break
          case UltravoxSessionStatus.SPEAKING:
            setCallState('speaking'); break
          case UltravoxSessionStatus.DISCONNECTING:
            setCallState('ending'); break
        }
      })

      await session.joinCall(joinUrl)
    } catch (err) {
      console.error('[Ultravox]', err)
      setCallState('idle')
    }
  }, [callState, opts])

  const endCall = useCallback(async () => {
    setCallState('ending')
    try { await sessionRef.current?.leaveCall() } catch { /* ignore */ }
    sessionRef.current = null
    setCallState('idle')
  }, [])

  return { callState, startCall, endCall }
}
