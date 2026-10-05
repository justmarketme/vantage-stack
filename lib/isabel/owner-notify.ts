import { publicAppOrigin } from "../auth/mail";

/**
 * Tell the humans about every inbound WhatsApp on the Vantage Stack number.
 *
 * The number is a Twilio WhatsApp API sender, so it can't also live in the
 * WhatsApp Business app on a phone — this is how the team sees the traffic.
 * One call to EMMA (POST /api/notify, x-emma-secret) does both:
 *   - pushes to Jono via EMMA's Teams / Telegram rungs
 *   - emails hello@ from the Microsoft 365 mailbox (Graph) — not Resend
 * The full history stays readable in the CRM at /crm/whatsapp.
 *
 * Best-effort: runs in after(), never throws, never delays Isabel's reply.
 */

const DEFAULT_EMAIL = "hello@vantagestack.co.za";
const DEFAULT_EMMA_URL = "https://emmadoesit.cloud/api/notify";

export async function notifyInboundWhatsApp(p: {
  from: string; // "whatsapp:+27..."
  profileName: string | null;
  message: string;
  reply: string;
}): Promise<void> {
  const emmaUrl = (process.env.EMMA_NOTIFY_URL || DEFAULT_EMMA_URL).trim();
  const emmaSecret = (process.env.EMMA_SHARED_SECRET || "").trim();
  if (!emmaSecret) {
    console.warn("[wa-notify] skipped — EMMA_SHARED_SECRET not set");
    return;
  }

  const number = p.from.replace(/^whatsapp:/, "");
  const who = p.profileName ? `${p.profileName} (${number})` : number;
  const inbox = `${publicAppOrigin()}/crm/whatsapp?phone=${encodeURIComponent(p.from)}`;

  const message = `💬 Vantage Stack WhatsApp from ${who}:\n"${p.message}"\n\nIsabel replied: "${p.reply.slice(0, 400)}"\n\nThread: ${inbox}`;
  const emailBody = [
    `${who} messaged the Vantage Stack WhatsApp (+27 60 013 2533):`,
    "",
    p.message,
    "",
    "Isabel replied:",
    p.reply,
    "",
    `Full thread in the CRM: ${inbox}`,
    `Message them from your own WhatsApp: https://wa.me/${number.replace(/\D/g, "")}`,
  ].join("\n");

  try {
    const r = await fetch(emmaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-emma-secret": emmaSecret },
      body: JSON.stringify({
        message,
        source: "vantagestack_whatsapp",
        title: `WhatsApp · ${who}`,
        email: {
          to: (process.env.WHATSAPP_NOTIFY_EMAIL || DEFAULT_EMAIL).trim(),
          subject: `WhatsApp from ${who}`,
          body: emailBody,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const d = (await r.json().catch(() => ({}))) as { delivered?: boolean; email?: { ok: boolean; detail?: string } };
    if (!r.ok || !d.delivered) console.error("[wa-notify] EMMA push not delivered", r.status);
    if (d.email && !d.email.ok) console.error("[wa-notify] email failed:", d.email.detail);
  } catch (e) {
    console.error("[wa-notify] EMMA unreachable:", e);
  }
}
