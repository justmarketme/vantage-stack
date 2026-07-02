// SEO orchestrator — static config (no DB/fs imports; safe to import anywhere).
//
// The in-app engine is a CRON-TRIGGERED cadence, not an always-on loop: each job
// advances pipeline state in Supabase, emits an event, and creates a handoff for
// Claude Cowork (which owns the browser/content/analytics work). "Never give up"
// = bounded retries at the dispatcher, not an infinite loop.

export const SEO_GOAL =
  "Rank Vantage Stack across Google + AI answers; automate content, case studies, landing pages, and social; deliver a weekly briefing.";
export const SEO_WHY =
  "Become the answer for business automation in South Africa. Every project becomes content. Channels reinforce each other.";

// Dashboard "agents" are event labels for the SEO Ops tab (not autonomous AI).
export const AGENTS = ["Builder", "Debugger", "Tester", "Researcher"] as const;
export type AgentName = (typeof AGENTS)[number];

export type SeoJob =
  | "keyword_research"
  | "outline_generation"
  | "draft_to_review"
  | "social_distribution"
  | "sunday_briefing";

export const JOBS: SeoJob[] = [
  "keyword_research",
  "outline_generation",
  "draft_to_review",
  "social_distribution",
  "sunday_briefing",
];

// Cadence. Times are SAST (UTC+2); `cron` is the UTC schedule used in vercel.json.
export const CADENCE: { job: SeoJob; when: string; cron: string }[] = [
  { job: "keyword_research", when: "Mon 09:00 SAST", cron: "0 7 * * 1" },
  { job: "outline_generation", when: "Tue 10:00 SAST", cron: "0 8 * * 2" },
  { job: "draft_to_review", when: "Thu 14:00 SAST", cron: "0 12 * * 4" },
  { job: "social_distribution", when: "Fri–Sun 17:00 SAST", cron: "0 15 * * 5,6,0" },
  { job: "sunday_briefing", when: "Sun 06:00 SAST", cron: "0 4 * * 0" },
];

// One high-intent seed per pillar per keyword_research run. Real GSC query-gap
// analysis is delegated to Cowork/Coupler (a handoff is created each run).
export const PILLAR_SEEDS: { pillar: string; keywords: string[] }[] = [
  { pillar: "Voice Agent Implementation", keywords: ["outbound AI voice agents South Africa", "AI receptionist South Africa", "voice agent appointment booking"] },
  { pillar: "System Automation", keywords: ["CRM automation small business", "automated sales follow-up", "invoice automation South Africa"] },
  { pillar: "WhatsApp & Teams Assistants", keywords: ["WhatsApp bot that pulls CRM data", "WhatsApp appointment booking bot"] },
  { pillar: "Personal AI Assistant Deployment", keywords: ["personal AI assistant for business", "AI assistant for email management"] },
  { pillar: "Paid Ads & Social Integration", keywords: ["Facebook ads management South Africa", "paid social ROI tracking"] },
];

export const ANALYTICS_NOTE =
  "Analytics wire up once a Coupler.io GSC/GA4 dataflow is built; first live numbers land in the Sunday briefing.";
