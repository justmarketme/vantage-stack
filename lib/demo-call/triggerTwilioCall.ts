import type { PreviewData } from '@/types/demo-call'

export interface TwilioCallResult {
  success: boolean
  callSid?: string
  status?: string
  message?: string
}

// Client-side helper: delegates to the server-side outbound route which calls
// Twilio directly. Business context is passed for logging purposes.
export async function triggerTwilioCall(
  phoneNumber: string,
  previewData: PreviewData
): Promise<TwilioCallResult> {
  const res = await fetch('/api/demo-call/outbound', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phoneNumber,
      businessName: previewData.businessName ?? previewData.scrapedTitle ?? 'the business',
    }),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? `Call failed (${res.status})`)
  }

  return res.json()
}
