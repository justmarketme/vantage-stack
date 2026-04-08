import { NextResponse } from "next/server";
import { withCrmHandler } from "../../../../../../lib/crm/http";

export async function POST(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const body = await req.json().catch(() => ({}));
  const { channel = "email", blueprint = "" } = body as { channel?: string; blueprint?: string };

  if (!blueprint.trim()) {
    return NextResponse.json({ ok: false, error: "Blueprint content is required" }, { status: 400 });
  }

  return withCrmHandler(async (db) => {
    // Get client info
    const [client] = await db`
      select id::text, name::text, email::text, phone::text, company::text
      from public.clients
      where id = ${clientId}::uuid
      limit 1
    `;

    if (!client) {
      return NextResponse.json({ ok: false, error: "Client not found" }, { status: 404 });
    }

    const clientRow = client as { id: string; name: string; email: string; phone: string; company: string };

    if (channel === "email") {
      if (!clientRow.email) {
        return NextResponse.json({ ok: false, error: "Client has no email address" }, { status: 400 });
      }

      const apiKey = process.env.RESEND_API_KEY;
      const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@leadvelocity.co.za";

      if (!apiKey) {
        return NextResponse.json({ ok: false, error: "Email service not configured (RESEND_API_KEY missing)" }, { status: 500 });
      }

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
          <div style="background: #0B0B0C; padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: #3B82F6; margin: 0; font-size: 24px;">VantageStack</h1>
            <p style="color: #9ca3af; margin: 8px 0 0; font-size: 14px;">Digital Strategy Blueprint</p>
          </div>
          <div style="background: #fff; padding: 32px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb;">
            <p style="color: #374151; margin-bottom: 24px;">Hi ${clientRow.name},</p>
            <p style="color: #374151; margin-bottom: 24px;">
              Thank you for completing the VantageStack intake questionnaire. We've prepared your personalised Digital Strategy Blueprint based on your business information and our research.
            </p>
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px; margin: 24px 0;">
              <pre style="white-space: pre-wrap; font-family: Arial, sans-serif; font-size: 13px; color: #374151; margin: 0; line-height: 1.6;">${blueprint.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
            </div>
            <p style="color: #374151; margin-top: 24px;">
              We look forward to discussing this blueprint with you and taking your business to the next level.
            </p>
            <p style="color: #374151; margin-bottom: 0;">
              Best regards,<br>
              <strong>VantageStack Team</strong>
            </p>
          </div>
        </div>
      `;

      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: clientRow.email,
          subject: `Your VantageStack Digital Blueprint — ${clientRow.company || clientRow.name}`,
          html: emailHtml,
        }),
      });

      if (!emailRes.ok) {
        const errText = await emailRes.text().catch(() => "Unknown error");
        return NextResponse.json({ ok: false, error: `Email send failed: ${errText}` }, { status: 500 });
      }
    } else if (channel === "whatsapp") {
      if (!clientRow.phone) {
        return NextResponse.json({ ok: false, error: "Client has no phone number for WhatsApp" }, { status: 400 });
      }

      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const from = process.env.TWILIO_WHATSAPP_FROM ?? "whatsapp:+14155238886";

      if (!accountSid || !authToken) {
        return NextResponse.json({ ok: false, error: "WhatsApp service not configured (Twilio credentials missing)" }, { status: 500 });
      }

      const message = `Hi ${clientRow.name}! 👋 Your VantageStack Digital Blueprint is ready.\n\n${blueprint.slice(0, 1500)}${blueprint.length > 1500 ? "\n\n[Blueprint continues... Full document sent to your email]" : ""}`;

      const toNumber = clientRow.phone.replace(/\s/g, "");
      const to = toNumber.startsWith("whatsapp:") ? toNumber : `whatsapp:${toNumber.startsWith("+") ? toNumber : `+${toNumber}`}`;

      const twilioRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ From: from, To: to, Body: message }).toString(),
        }
      );

      if (!twilioRes.ok) {
        const errText = await twilioRes.text().catch(() => "Unknown error");
        return NextResponse.json({ ok: false, error: `WhatsApp send failed: ${errText}` }, { status: 500 });
      }
    }

    // Log the activity
    await db`
      insert into public.crm_activity (action_type, client_id, user_actor, details)
      values (
        'blueprint_sent',
        ${clientId}::uuid,
        'admin',
        ${JSON.stringify({ channel, sent_at: new Date().toISOString() })}::jsonb
      )
    `.catch(() => null);

    return NextResponse.json({ ok: true, channel, message: "Blueprint sent successfully" });
  });
}
