import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Twilio calls this URL when a demo call connects and gets back TwiML that
 * streams the call audio to the ElevenLabs ConvAI agent.
 *
 * It must stay outside the CRM session (Twilio has no cookie), but the TwiML
 * it returns embeds the ElevenLabs API key in the stream URL. Unauthenticated,
 * any anonymous request could read that key. So every request must carry a
 * valid X-Twilio-Signature, which only Twilio (holding TWILIO_AUTH_TOKEN) can
 * produce: https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */

function twimlResponse(body: string, status = 200) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    status,
    headers: { 'Content-Type': 'text/xml' },
  })
}

/** Twilio's scheme: base64(HMAC-SHA1(authToken, url + sorted POST key/value pairs)). */
function expectedSignature(authToken: string, url: string, params: [string, string][]) {
  const data = [...params]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .reduce((acc, [k, v]) => acc + k + v, url)
  return createHmac('sha1', authToken).update(data, 'utf8').digest('base64')
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

/**
 * The URL Twilio signed. Behind Vercel the request URL can differ from the one
 * Twilio was given, so check every URL this deployment could have been reached
 * at: the forwarded host it actually hit, plus the configured app URL that
 * /api/demo-call/outbound hands to Twilio.
 */
function candidateUrls(req: NextRequest): string[] {
  const path = req.nextUrl.pathname
  const search = req.nextUrl.search
  const urls = new Set<string>()
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host')
  const proto = (req.headers.get('x-forwarded-proto') || 'https').split(',')[0].trim()
  if (host) urls.add(`${proto}://${host}${path}${search}`)
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
  if (appUrl) urls.add(`${appUrl.replace(/\/$/, '')}${path}${search}`)
  urls.add(req.nextUrl.toString())
  return [...urls]
}

async function handler(req: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const signature = req.headers.get('x-twilio-signature') || ''

  if (!authToken) {
    console.error('[twiml] TWILIO_AUTH_TOKEN not set — cannot verify Twilio, refusing.')
    return twimlResponse('<Say>Agent not configured.</Say>', 500)
  }

  let params: [string, string][] = []
  if (req.method === 'POST') {
    const form = await req.formData().catch(() => null)
    if (form) params = [...form.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : ''])
  }

  const valid =
    signature !== '' &&
    candidateUrls(req).some((url) => safeEqual(expectedSignature(authToken, url, params), signature))
  if (!valid) {
    return twimlResponse('<Reject/>', 403)
  }

  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID
  const apiKey = process.env.ELEVEN_LABS_API_KEY || process.env.ELEVENLABS_API_KEY

  if (!agentId || !apiKey) {
    return twimlResponse('<Say>Agent not configured.</Say>')
  }

  // ElevenLabs Twilio Media Streams WebSocket endpoint. The key rides in the
  // query string (server-to-server, Twilio → ElevenLabs); the signature check
  // above is what keeps it from being handed to anyone else. Escaped because
  // it sits inside an XML attribute.
  const streamUrl = `wss://api.elevenlabs.io/v1/convai/twilio?agent_id=${encodeURIComponent(agentId)}&xi-api-key=${encodeURIComponent(apiKey)}`
    .replace(/&/g, '&amp;')

  return twimlResponse(`
  <Connect>
    <Stream url="${streamUrl}" />
  </Connect>
`)
}

export const POST = handler
// Twilio can also GET this URL in some configurations (signature then covers
// the full URL including its query string, with no body params).
export const GET = handler
