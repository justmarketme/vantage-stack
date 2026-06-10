import { NextRequest, NextResponse } from 'next/server'

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || '+27600132533'

export async function POST(req: NextRequest) {
  const { phoneNumber, businessName } = await req.json()

  if (!phoneNumber) {
    return NextResponse.json({ error: 'phoneNumber is required' }, { status: 400 })
  }

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.error(
      '[outbound-call] Missing Twilio credentials. Add to .env.local:\n' +
      '  TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n' +
      '  TWILIO_AUTH_TOKEN=your_auth_token\n' +
      '  TWILIO_FROM_NUMBER=+27600132533  (optional, defaults to +27600132533)'
    )
    return NextResponse.json(
      { error: 'Twilio credentials not configured — check server logs for setup instructions.' },
      { status: 500 }
    )
  }

  // The TwiML URL must be publicly reachable by Twilio.
  // On Vercel this is automatic; locally use ngrok and set NEXT_PUBLIC_APP_URL.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)

  if (!appUrl) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_APP_URL not set. Twilio needs a public URL to fetch TwiML. Set it to your deployed domain or an ngrok tunnel.' },
      { status: 500 }
    )
  }

  const twimlUrl = `${appUrl}/api/demo-call/twiml`

  try {
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: phoneNumber,
          From: TWILIO_FROM_NUMBER,
          Url: twimlUrl,
          Method: 'POST',
        }).toString(),
      }
    )

    if (!res.ok) {
      const text = await res.text()
      console.error('[outbound-call] Twilio error:', text)
      return NextResponse.json({ error: `Twilio error: ${text}` }, { status: res.status })
    }

    const data = await res.json()
    console.log(`[outbound-call] Initiated → SID: ${data.sid} | To: ${phoneNumber} | Business: ${businessName ?? 'unknown'}`)
    return NextResponse.json({ success: true, callSid: data.sid, status: data.status })

  } catch (e) {
    console.error('[outbound-call] Failed:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Call failed' },
      { status: 500 }
    )
  }
}
