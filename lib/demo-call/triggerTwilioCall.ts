import type { PreviewData, TwilioCallResult } from '@/types/demo-call'

export async function triggerTwilioCall(
  phoneNumber: string,
  previewData: PreviewData
): Promise<TwilioCallResult> {
  const webhookUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL

  if (!webhookUrl) {
    console.warn('[Twilio] NEXT_PUBLIC_N8N_WEBHOOK_URL not set')
    return { success: false, message: 'n8n webhook not configured' }
  }

  const twilioWebhookUrl = webhookUrl.replace(
    '/webhook/vs-call-agent-demo',
    '/webhook/vs-call-agent-outbound'
  )

  const response = await fetch(twilioWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phoneNumber,
      businessName: previewData.businessName ?? previewData.scrapedTitle ?? 'the business',
      location: previewData.location ?? '',
      services: previewData.services ?? [],
      pricing: previewData.pricing ?? '',
      corpusId: previewData.corpusId ?? '',
      url: previewData.url ?? '',
    }),
  })

  if (!response.ok) {
    throw new Error(`n8n returned ${response.status}: ${response.statusText}`)
  }

  return await response.json() as TwilioCallResult
}
