import { NextRequest, NextResponse } from 'next/server'

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY

// Scrape a URL for its OG image and title
async function firecrawlScrape(url: string): Promise<{ screenshotUrl?: string; title?: string }> {
  if (!FIRECRAWL_API_KEY) return {}
  try {
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
  } catch {
    return {}
  }
}

// Crawl a URL and return combined page content (capped at 50 KB)
async function firecrawlCrawl(url: string): Promise<string> {
  if (!FIRECRAWL_API_KEY) return ''
  try {
    const startRes = await fetch('https://api.firecrawl.dev/v1/crawl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FIRECRAWL_API_KEY}` },
      body: JSON.stringify({ url, limit: 10, scrapeOptions: { formats: ['markdown'] } }),
      signal: AbortSignal.timeout(10000),
    })
    if (!startRes.ok) return ''
    const { id: crawlId } = await startRes.json()

    // Poll for results (max 40 s)
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 5000))
      const resultsRes = await fetch(`https://api.firecrawl.dev/v1/crawl/${crawlId}`, {
        headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}` },
        signal: AbortSignal.timeout(10000),
      })
      if (!resultsRes.ok) break
      const results = await resultsRes.json()
      if (results.status === 'completed') {
        const pages: { markdown?: string }[] = results.data ?? []
        return pages.map(p => p.markdown ?? '').join('\n\n---\n\n').slice(0, 50000)
      }
    }
  } catch { /* ignore — caller handles empty string */ }
  return ''
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { mode, url, businessName, location, pricing, services } = body

    if (mode === 'url' && url) {
      const [scrapeResult, crawledContent] = await Promise.all([
        firecrawlScrape(url),
        firecrawlCrawl(url),
      ])

      return NextResponse.json({
        success: true,
        mode: 'url',
        screenshotUrl: scrapeResult.screenshotUrl,
        scrapedTitle: scrapeResult.title,
        scrapedContent: crawledContent || undefined,
      })

    } else {
      // Manual mode — no external calls needed
      const serviceList = Array.isArray(services) ? services.join('\n- ') : services
      const content = [
        businessName ? `Business: ${businessName}` : '',
        location ? `Location: ${location}` : '',
        pricing ? `Pricing: ${pricing}` : '',
        serviceList ? `Services:\n- ${serviceList}` : '',
      ].filter(Boolean).join('\n\n')

      return NextResponse.json({ success: true, mode: 'manual', scrapedContent: content || undefined })
    }

  } catch (err) {
    console.error('[deploy]', err)
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
