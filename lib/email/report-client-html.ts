import { marked } from "marked";

export function buildClientEmailHtml(params: {
  bodyPlain: string;
  videoUrl: string;
  reportMarkdown: string;
  consultationUrl: string;
  clientName: string;
}) {
  const reportHtml = params.reportMarkdown
    ? (marked.parse(params.reportMarkdown, { async: false }) as string)
    : "<p>—</p>";

  const videoSection = `
  <div style="margin:20px 0;padding:18px;border-radius:14px;background:linear-gradient(135deg,#1e3a5f,#0f172a);border:1px solid rgba(255,255,255,0.12);">
    <p style="margin:0 0 12px 0;font-size:15px;font-weight:700;color:#f8fafc;">Your personalized video</p>
    <video controls playsinline style="width:100%;max-width:560px;border-radius:12px;background:#000;">
      <source src="${escapeHtmlAttr(params.videoUrl)}" type="video/mp4" />
    </video>
    <p style="margin:12px 0 0 0;font-size:13px;">
      <a href="${escapeHtmlAttr(params.videoUrl)}" style="color:#60a5fa;">Open video in browser</a>
    </p>
  </div>`;

  const ctaSection = `
  <div style="margin:28px 0;text-align:center;">
    <a href="${escapeHtmlAttr(params.consultationUrl)}" style="display:inline-block;background:#3b82f6;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:999px;font-weight:700;font-size:15px;">Book a Consultation</a>
  </div>`;

  const inner = params.bodyPlain
    .replace(/\{\{VIDEO_BLOCK\}\}/g, videoSection)
    .replace(/\{\{REPORT_BLOCK\}\}/g, `<div class="report-md" style="color:#e5e7eb;font-size:15px;line-height:1.65;">${reportHtml}</div>`)
    .replace(/\{\{CTA_BLOCK\}\}/g, ctaSection)
    .replace(/\[EMBEDDED VIDEO PLAYER WITH THUMBNAIL\]/gi, videoSection)
    .replace(/\[FULL WRITTEN REPORT CONTENT\]/gi, `<div class="report-md" style="color:#e5e7eb;">${reportHtml}</div>`)
    .replace(/\[BUTTON: Book a Consultation\]/gi, ctaSection);

  const escapedName = escapeHtml(params.clientName);
  const bodyHtml = interleavePlainAndHtml(inner);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;background:#0b0b0c;font-family:Inter,system-ui,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0c;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" style="max-width:600px;background:#111827;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;">
<tr><td style="padding:22px 20px;border-bottom:1px solid rgba(255,255,255,0.08);">
<div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#9ca3af;">VantageStack</div>
<div style="font-size:18px;font-weight:700;color:#f9fafb;margin-top:8px;font-family:system-ui;">${escapedName}</div>
</td></tr>
<tr><td style="padding:20px;">${bodyHtml}</td></tr>
<tr><td style="padding:16px 20px;font-size:12px;color:#6b7280;border-top:1px solid rgba(255,255,255,0.08);">You received this because your team shared your VantageStack analysis.</td></tr>
</table></td></tr></table></body></html>`;
}

function interleavePlainAndHtml(s: string): string {
  const re = /(<(?:video|div)[\s\S]*?<\/(?:video|div)>)/gi;
  const parts = s.split(re);
  return parts
    .map((part) => {
      if (!part.trim()) return "";
      if (/^<\s*(video|div)/i.test(part)) return part;
      return plainToEmailParagraphs(part);
    })
    .join("");
}

function plainToEmailParagraphs(plain: string): string {
  return plain
    .split(/\n\n+/)
    .map((p) => {
      const t = p.trim();
      if (!t) return "";
      if (t.startsWith("- ") || (t.includes("\n") && t.split("\n").every((l) => !l.trim() || l.trim().startsWith("- ")))) {
        const items = t.split(/\n/).map((l) => l.trim()).filter((l) => l.startsWith("- "));
        if (!items.length) return `<p style="margin:14px 0;color:#e5e7eb;line-height:1.65;">${escapeHtml(t).replace(/\n/g, "<br/>")}</p>`;
        return `<ul style="margin:12px 0;padding-left:20px;color:#e5e7eb;">${items
          .map((l) => `<li style="margin:6px 0;">${escapeHtml(l.replace(/^-\s*/, ""))}</li>`)
          .join("")}</ul>`;
      }
      return `<p style="margin:14px 0;color:#e5e7eb;line-height:1.65;">${escapeHtml(t).replace(/\n/g, "<br/>")}</p>`;
    })
    .join("");
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeHtmlAttr(s: string) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
