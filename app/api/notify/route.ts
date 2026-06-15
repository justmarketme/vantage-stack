import { NextRequest, NextResponse } from 'next/server'

/**
 * Notification endpoint for the Jessica inbound receptionist (and other agents).
 *
 * Jessica calls this when she takes a message — e.g. a caller asked to speak to
 * the team but the warm transfer was declined or unanswered. It fans the lead
 * out to the team over SMS today; a Teams channel can be added here later
 * without changing the caller (just extend `channels`).
 *
 * Auth: callers must send `Authorization: Bearer <NOTIFY_WEBHOOK_SECRET>`.
 */

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || '+27600132533'
const NOTIFY_WEBHOOK_SECRET = process.env.NOTIFY_WEBHOOK_SECRET

// Team members who should receive call messages. Override via env if it changes.
const SMS_RECIPIENTS = (process.env.NOTIFY_SMS_RECIPIENTS || '+27725548057,+27736867990')
  .split(',')
  .map((n) => n.trim())
  .filter(Boolean)

async function sendSms(to: string, body: string): Promise<{ to: string; ok: boolean; detail: string }> {
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: TWILIO_FROM_NUMBER, Body: body }).toString(),
    }
  )
  const text = await res.text()
  if (!res.ok) {
    console.error(`[notify] SMS to ${to} failed:`, text)
    return { to, ok: false, detail: text.slice(0, 200) }
  }
  return { to, ok: true, detail: 'sent' }
}

export async function POST(req: NextRequest) {
  // Auth
  const header = req.headers.get('authorization') || ''
  if (!NOTIFY_WEBHOOK_SECRET || header !== `Bearer ${NOTIFY_WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return NextResponse.json({ error: 'Twilio credentials not configured' }, { status: 500 })
  }

  let payload: {
    callerName?: string
    callerNumber?: string
    reason?: string
    callbackTime?: string
    message?: string
  }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Build a readable message from the structured fields, or use a raw message.
  const body =
    payload.message ??
    [
      '📞 New message from Jessica (reception)',
      payload.callerName ? `Name: ${payload.callerName}` : null,
      payload.callerNumber ? `Number: ${payload.callerNumber}` : null,
      payload.reason ? `Reason: ${payload.reason}` : null,
      payload.callbackTime ? `Best callback: ${payload.callbackTime}` : null,
    ]
      .filter(Boolean)
      .join('\n')

  if (!body.trim()) {
    return NextResponse.json({ error: 'Empty message' }, { status: 400 })
  }

  const results = await Promise.all(SMS_RECIPIENTS.map((to) => sendSms(to, body)))
  const allOk = results.every((r) => r.ok)

  return NextResponse.json(
    { success: allOk, channel: 'sms', recipients: results },
    { status: allOk ? 200 : 502 }
  )
}
