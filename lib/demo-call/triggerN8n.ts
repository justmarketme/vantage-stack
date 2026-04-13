import type { PreviewData, DeployResult } from '@/types/demo-call'

export async function triggerN8n(data: PreviewData): Promise<DeployResult> {
  const webhookUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL

  if (!webhookUrl) {
    console.warn('[n8n] NEXT_PUBLIC_N8N_WEBHOOK_URL not set — running in local-only mode')
    return { success: true, mode: data.mode, message: 'n8n not configured' }
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (!response.ok) throw new Error(`n8n returned ${response.status}: ${response.statusText}`)

  return await response.json() as DeployResult
}
