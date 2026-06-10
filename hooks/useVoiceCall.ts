'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useConversation } from '@elevenlabs/react'

export type CallState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'ending'

interface VoiceCallOptions {
  businessName?: string
  location?: string
  services?: string[]
  pricing?: string
  corpusId?: string
}

export function useVoiceCall(opts: VoiceCallOptions) {
  const [callState, setCallState] = useState<CallState>('idle')
  const micStreamRef = useRef<MediaStream | null>(null)

  const conversation = useConversation({
    onError: () => { setCallState('idle') },
    onDisconnect: () => {
      setCallState('idle')
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop())
        micStreamRef.current = null
      }
    },
  })

  // Map ElevenLabs speaking state → callState
  useEffect(() => {
    if (conversation.status !== 'connected') return
    setCallState(conversation.isSpeaking ? 'speaking' : 'listening')
  }, [conversation.isSpeaking, conversation.status])

  const startCall = useCallback(async () => {
    if (callState !== 'idle') return
    setCallState('connecting')

    const name = opts.businessName || 'this business'
    const serviceList = opts.services?.length ? opts.services.join(', ') : 'their services'
    const systemPrompt = [
      `You are a friendly, professional AI voice agent for ${name}${opts.location ? ` in ${opts.location}` : ''}.`,
      `Services: ${serviceList}.`,
      opts.pricing ? `Pricing: ${opts.pricing}.` : '',
      `Keep responses short and conversational — this is a voice call.`,
      `Greet the caller warmly and ask how you can help.`,
    ].filter(Boolean).join(' ')

    try {
      // Get a signed URL with a business-specific prompt override
      const res = await fetch('/api/demo-call/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt,
          firstMessage: `Hi! I'm the AI assistant for ${name}. How can I help you today?`,
        }),
      })
      if (!res.ok) throw new Error(`Could not start call: ${res.status}`)
      const { signedUrl } = await res.json()

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = stream

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (conversation as any).startSession({ signedUrl })
    } catch (err) {
      console.error('[VoiceCall]', err)
      setCallState('idle')
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop())
        micStreamRef.current = null
      }
    }
  }, [callState, opts, conversation])

  const endCall = useCallback(async () => {
    setCallState('ending')
    try { await conversation.endSession() } catch { /* ignore */ }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop())
      micStreamRef.current = null
    }
    setCallState('idle')
  }, [conversation])

  return { callState, startCall, endCall }
}
