import { sendTransactionalEmail, publicAppOrigin } from "../auth/mail";

/**
 * Tell the humans about every inbound WhatsApp on the Vantage Stack number.
 *
 * The number is a Twilio WhatsApp API sender, so it can't also live in the
 * WhatsApp Business app on a phone — this is how the team sees the traffic:
 *   - email to hello@ (WHATSAPP_NOTIFY_EMAIL)
 *   - a push to EMMA, which fans out to Jono's Teams/Telegram/WhatsApp
 * The full history stays readable in the CRM at /crm/whatsapp.
 *
 * Best-effort: runs in after(), never throws, never delays Isabel's reply.
 */

const DEFAULT_EMAIL = "hello@vantagestack.co.za";
const DEFAULT_EMMA_URL = "https://emmadoesit.cloud/api/notify";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export async function notifyInboundWhatsApp(p: {
  from: string; // "whatsapp:+27..."
  profileName: string | null;
  message: string;
  reply: string;
}): Promise<void> {
  const number = p.from.replace(/^whatsapp:/, "");
  const who = p.profileName ? `${p.profileName} (${number})` : number;
  const inbox = `${publicAppOrigin()}/crm/whatsapp?phone=${encodeURIComponent(p.from)}`;
  const chat = `https://wa.me/${number.replace(/\D/g, "")}`;

  const email = (process.env.WHATSAPP_NOTIFY_EMAIL || DEFAULT_EMAIL).trim();
  const emmaUrl = (process.env.EMMA_NOTIFY_URL || DEFAULT_EMMA_URL).trim();
  const emmaSecret = (process.env.EMMA_SHARED_SECRET || "").trim();

  const tasks: Promise<unknown>[] = [];

  if (email) {
    tasks.push(
      sendTransactionalEmail({
        to: email,
        subject: `WhatsApp from ${who}`,
        html: `
          <p><strong>${esc(who)}</strong> messaged the Vantage Stack WhatsApp:</p>
          <blockquote style="border-left:3px solid #25D366;margin:0;padding:8px 12px;background:#f6f6f6">${esc(p.message).replace(/\n/g, "<br>")}</blockquote>
          <p style="color:#666">Isabel replied:</p>
          <blockquote style="border-left:3px solid #ccc;margin:0;padding:8px 12px;color:#444">${esc(p.reply).replace(/\n/g, "<br>")}</blockquote>
          <p><a href="${inbox}">Open the thread in the CRM</a> · <a href="${chat}">Chat on WhatsApp</a></p>`,
      }).then((r) => {
        if (!r.ok) console.error("[wa-notify] email failed:", r.error);
      }),
    );
  }

  if (emmaUrl && emmaSecret) {
    const text = `💬 Vantage Stack WhatsApp from ${who}:\n"${p.message}"\n\nIsabel replied: "${p.reply.slice(0, 400)}"\n\nThread: ${inbox}`;
    tasks.push(
      fetch(emmaUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-emma-secret": emmaSecret },
        body: JSON.stringify({ message: text, source: "vantagestack_whatsapp", title: `WhatsApp · ${who}` }),
        signal: AbortSignal.timeout(10_000),
      })
        .then((r) => {
          if (!r.ok) console.error("[wa-notify] EMMA responded", r.status);
        }),
    );
  } else {
    console.warn("[wa-notify] EMMA push skipped — EMMA_SHARED_SECRET not set");
  }

  const results = await Promise.allSettled(tasks);
  for (const r of results) if (r.status === "rejected") console.error("[wa-notify]", r.reason);
}
