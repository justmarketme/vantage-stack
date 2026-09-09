// Blog configuration — no fs imports here, so this module is safe to import
// from both server and client components.

export const SITE_URL = "https://vantagestack.co.za";

// Review phase. While true: the whole blog is robots:noindex AND draft posts
// stay VIEWABLE (for review) but out of the public "approved" gate. Flip to
// false at go-live — then only status:approved posts list/index, and noindex
// is lifted.
export const BLOG_BEHIND_REVIEW = true;

// The site's service pillars: canonical value (matches post frontmatter) + the
// short label used in filters/tags.
export const PILLARS: { value: string; label: string }[] = [
  { value: "Voice Agent Implementation", label: "Voice Agents" },
  { value: "System Automation", label: "System Automation" },
  { value: "WhatsApp & Teams Assistants", label: "WhatsApp & Teams" },
  { value: "Personal AI Assistant Deployment", label: "Personal AI" },
  { value: "Paid Ads & Social Integration", label: "Paid Ads & Social" },
];

export function pillarLabel(value: string): string {
  return PILLARS.find((p) => p.value === value)?.label ?? value;
}

// Landing route -> pillar, for the reciprocal "Related reading" block.
export const ROUTE_PILLARS: Record<string, string> = {
  "/ai-calling": "Voice Agent Implementation",
  "/system-automations": "System Automation",
  "/workflow-automation": "System Automation",
  "/whatsapp-assistant": "WhatsApp & Teams Assistants",
  "/personal-ai-assistant": "Personal AI Assistant Deployment",
  "/paid-ads": "Paid Ads & Social Integration",
  "/social-media-management": "Paid Ads & Social Integration",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return iso ?? "";
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}
