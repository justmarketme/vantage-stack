function env(name: string): string {
  return (process.env[name] || "").trim();
}

export async function sendTelegramAlert(params: { text: string }) {
  const token = env("TELEGRAM_BOT_TOKEN");
  const chatId = env("TELEGRAM_CHAT_ID") || env("TELEGRAM_DEFAULT_CHAT_ID");
  if (!token || !chatId) return { ok: false, skipped: true, reason: "Missing TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID" };

  const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: params.text, disable_web_page_preview: true }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Telegram alert failed: ${res.status} ${text}`);
  return { ok: true, response: text };
}

