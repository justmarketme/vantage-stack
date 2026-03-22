function env(name: string) {
  return (process.env[name] || "").trim();
}

function requiredEnv(name: string) {
  const v = env(name);
  if (!v) throw new Error(`${name} is required`);
  return v;
}

export async function sendWeeklyEmail(params: { to: string; subject: string; html: string }) {
  const apiKey = requiredEnv("RESEND_API_KEY");
  const from = requiredEnv("RESEND_FROM_EMAIL");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });

  const txt = await res.text();
  if (!res.ok) throw new Error(`Resend API failed: ${res.status} ${txt}`);
  const json = JSON.parse(txt) as any;
  return { message_id: String(json?.id ?? ""), raw: json };
}

export async function sendTelegramSummary(message: string) {
  const token = env("TELEGRAM_BOT_TOKEN");
  const chatId = env("TELEGRAM_CHAT_ID");
  if (!token || !chatId) return { skipped: true };

  const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message, disable_web_page_preview: true }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Telegram sendMessage failed: ${res.status} ${text}`);
  return { ok: true };
}

