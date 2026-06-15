import { NextRequest, NextResponse } from 'next/server'

/**
 * Client-facing WhatsApp acknowledgement for the Jessica inbound receptionist.
 *
 * Jessica calls this (via a webhook tool) once she has the caller's name and
 * WhatsApp number, to send them a friendly confirmation that we have their
 * details and will be in touch.
 *
 * Sends an approved WhatsApp Content template (business-initiated messages to a
 * number that hasn't messaged us first must use a template — the 24h free-form
 * window does not apply to a phone call). The sender whatsapp:+27600132533 is a
 * registered, ONLINE WhatsApp Business sender.
 *
 * Auth: callers must send `Authorization: Bearer <NOTIFY_WEBHOOK_SECRET>`.
 */

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN
const WHATSAPP_FROM = process.env.WHATSAPP_FROM || 'whatsapp:+27600132533'
const WHATSAPP_ACK_CONTENT_SID = process.env.WHATSAPP_ACK_CONTENT_SID
const NOTIFY_WEBHOOK_SECRET = process.env.NOTIFY_WEBHOOK_SECRET

function toWhatsApp(num: string): string {
  const trimmed = num.trim()
  return trimmed.startsWith('whatsapp:') ? trimmed : `whatsapp:${trimmed}`
}

export async function POST(req: NextRequest) {
  const header = req.headers.get('authorization') || ''
  if (!NOTIFY_WEBHOOK_SECRET || header !== `Bearer ${NOTIFY_WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !WHATSAPP_ACK_CONTENT_SID) {
    return NextResponse.json(
      { error: 'WhatsApp not fully configured (missing Twilio creds or template SID)' },
      { status: 500 }
    )
  }

  let payload: { name?: string; whatsappNumber?: string }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const to = payload.whatsappNumber?.trim()
  const name = (payload.name?.trim() || 'there').split(' ')[0]
  if (!to) {
    return NextResponse.json({ error: 'whatsappNumber is required' }, { status: 400 })
  }

  try {
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: WHATSAPP_FROM,
          To: toWhatsApp(to),
          ContentSid: WHATSAPP_ACK_CONTENT_SID,
          ContentVariables: JSON.stringify({ '1': name }),
        }).toString(),
      }
    )
    const data = await res.json()
    if (!res.ok) {
      // e.g. 63016 (template not yet approved) — report but don't crash the call.
      console.error('[whatsapp] send failed:', JSON.stringify(data))
      return NextResponse.json(
        { success: false, error: data?.message ?? 'send failed', code: data?.code },
        { status: 502 }
      )
    }
    console.log(`[whatsapp] ack sent → ${to} | sid: ${data.sid} | status: ${data.status}`)
    return NextResponse.json({ success: true, sid: data.sid, status: data.status })
  } catch (e) {
    console.error('[whatsapp] error:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'failed' },
      { status: 500 }
    )
  }
}
