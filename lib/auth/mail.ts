type SendOpts = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

/**
 * Sends transactional email via Resend when RESEND_API_KEY is set; otherwise logs (dev).
 * `from`: RESEND_FROM, else RESEND_FROM_EMAIL (same as delivery / weekly-scheduler), else Resend onboarding default.
 */
export async function sendTransactionalEmail(opts: SendOpts): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const key = (process.env.RESEND_API_KEY || "").trim();
  const from = (
    process.env.RESEND_FROM ||
    process.env.RESEND_FROM_EMAIL ||
    "VantageStack <onboarding@resend.dev>"
  ).trim();

  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[mail:skipped]", opts.to, opts.subject, opts.text?.slice(0, 200) ?? opts.html.slice(0, 200));
    }
    return { ok: true, skipped: true };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text ?? stripHtml(opts.html),
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: t || res.statusText };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function publicAppOrigin(): string {
  const u = (process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || "").trim();
  if (u.startsWith("http")) return u.replace(/\/$/, "");
  if (u) return `https://${u.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}
