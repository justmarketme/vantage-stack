import { NextRequest, NextResponse } from 'next/server'

const ULTRAVOX_API_KEY = process.env.ULTRAVOX_API_KEY!
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY!

// ── Firecrawl ─────────────────────────────────────────────────────────────────

async function firecrawlScrape(url: string): Promise<{ screenshotUrl?: string; title?: string }> {
  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FIRECRAWL_API_KEY}` },
    body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) return {}
  const data = await res.json()
  return {
    screenshotUrl: data.data?.metadata?.ogImage,
    title: data.data?.metadata?.title,
  }
}

async function firecrawlCrawl(url: string): Promise<string> {
  // Start crawl
  const startRes = await fetch('https://api.firecrawl.dev/v1/crawl', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FIRECRAWL_API_KEY}` },
    body: JSON.stringify({ url, limit: 10, scrapeOptions: { formats: ['markdown'] } }),
    signal: AbortSignal.timeout(10000),
  })
  if (!startRes.ok) return ''
  const { id: crawlId } = await startRes.json()

  // Wait 30s then fetch results
  await new Promise(r => setTimeout(r, 30000))

  const resultsRes = await fetch(`https://api.firecrawl.dev/v1/crawl/${crawlId}`, {
    headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}` },
    signal: AbortSignal.timeout(10000),
  })
  if (!resultsRes.ok) return ''
  const results = await resultsRes.json()
  const pages: { markdown?: string }[] = results.data ?? []
  return pages.map(p => p.markdown ?? '').join('\n\n---\n\n').slice(0, 50000)
}

// ── Ultravox Corpus ───────────────────────────────────────────────────────────

async function createCorpus(name: string): Promise<string> {
  const res = await fetch('https://api.ultravox.ai/api/corpora', {
    method: 'POST',
    headers: { 'X-API-Key': ULTRAVOX_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Corpus create failed: ${res.status}`)
  const data = await res.json()
  return data.corpusId as string
}

async function uploadToCorpus(corpusId: string, content: string, filename: string): Promise<void> {
  // Get upload URL
  const urlRes = await fetch(`https://api.ultravox.ai/api/corpora/${corpusId}/sources`, {
    method: 'POST',
    headers: { 'X-API-Key': ULTRAVOX_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceType: 'text', filename }),
    signal: AbortSignal.timeout(10000),
  })
  if (!urlRes.ok) return
  const { uploadUrl } = await urlRes.json()

  // Upload content
  await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain' },
    body: content,
    signal: AbortSignal.timeout(15000),
  })
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { mode, url, businessName, location, pricing, services } = body

    if (mode === 'url' && url) {
      // URL mode: scrape fast for screenshot, crawl for corpus
      const [scrapeResult, crawlContent] = await Promise.all([
        firecrawlScrape(url).catch((): { screenshotUrl?: string; title?: string } => ({})),
        firecrawlCrawl(url).catch(() => ''),
      ])

      let corpusId: string | undefined
      if (crawlContent && ULTRAVOX_API_KEY) {
        try {
          corpusId = await createCorpus(`vs-demo-${new URL(url).hostname}-${Date.now()}`)
          await uploadToCorpus(corpusId, crawlContent, 'website-content.txt')
        } catch (e) {
          console.error('[Corpus]', e)
          corpusId = undefined
        }
      }

      return NextResponse.json({
        success: true,
        mode: 'url',
        screenshotUrl: scrapeResult.screenshotUrl,
        scrapedTitle: scrapeResult.title,
        corpusId,
      })

    } else {
      // Manual mode: build text doc for corpus
      const serviceList = Array.isArray(services) ? services.join('\n- ') : services
      const content = [
        `Business: ${businessName || 'Unknown'}`,
        location ? `Location: ${location}` : '',
        pricing ? `Pricing: ${pricing}` : '',
        serviceList ? `Services:\n- ${serviceList}` : '',
      ].filter(Boolean).join('\n\n')

      let corpusId: string | undefined
      if (content && ULTRAVOX_API_KEY) {
        try {
          corpusId = await createCorpus(`vs-demo-manual-${Date.now()}`)
          await uploadToCorpus(corpusId, content, 'business-info.txt')
        } catch (e) {
          console.error('[Corpus]', e)
          corpusId = undefined
        }
      }

      return NextResponse.json({ success: true, mode: 'manual', corpusId })
    }

  } catch (err) {
    console.error('[deploy]', err)
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
