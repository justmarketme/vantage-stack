import type { PreviewData, DeployResult } from '@/types/demo-call'

export async function triggerN8n(data: PreviewData): Promise<DeployResult> {
  // Calls our own Next.js API route — no n8n needed
  const response = await fetch('/api/demo-call/deploy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    throw new Error(`Deploy API returned ${response.status}: ${response.statusText}`)
  }

  return await response.json() as DeployResult
}
