export type Track = "premium" | "standard";

export type ConfidenceFlag = "green" | "yellow" | "red";

export type ProspectStage =
  | "new"
  | "contacted"
  | "responded"
  | "call_booked"
  | "proposal"
  | "closed_won"
  | "closed_lost";

export type EngagementStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "posted"
  | "responded"
  | "expired";

export interface Prospect {
  id: string;
  source_platform: string;
  source_url: string;
  source_text: string;
  discovered_at: string;
  name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_whatsapp: string | null;
  business_name: string | null;
  cipc_registration: string | null;
  website_url: string | null;
  social_profiles: Record<string, string>;
  company_size_estimate: string | null;
  industry_vertical: string | null;
  pain_point: string;
  intent_signals: string[];
  track: Track;
  confidence_flag: ConfidenceFlag;
  stage: ProspectStage;
  routed_landing_page: string | null;
  research_findings: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ProspectEngagement {
  id: string;
  prospect_id: string;
  run_id: string | null;
  channel: string;
  direction: "outbound" | "inbound";
  message_text: string;
  cta_type: string | null;
  cta_url: string | null;
  status: EngagementStatus;
  approved_by: string | null;
  approved_at: string | null;
  posted_at: string | null;
  response_text: string | null;
  responded_at: string | null;
  thread_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ProspectingRun {
  id: string;
  trigger: "cron" | "manual";
  started_at: string;
  finished_at: string | null;
  channels_scanned: string[];
  signals_found: number;
  leads_created: number;
  drafts_created: number;
  hot_leads_flagged: number;
  status: "running" | "completed" | "failed";
  summary: Record<string, unknown>;
  error: Record<string, unknown> | null;
}

export interface ProspectingChannel {
  id: string;
  platform: string;
  channel_name: string;
  channel_url: string;
  track: Track;
  enabled: boolean;
  scan_priority: number;
  last_scanned_at: string | null;
  conversion_rate: number;
  metadata: Record<string, unknown>;
}

export interface IntentSignal {
  keyword: string;
  category: string;
  weight: number;
}

export const INTENT_SIGNALS: IntentSignal[] = [
  { keyword: "missed a call", category: "missed_calls", weight: 0.9 },
  { keyword: "can't keep up with enquiries", category: "lead_overflow", weight: 0.9 },
  { keyword: "need a website", category: "no_website", weight: 0.85 },
  { keyword: "my website does nothing", category: "dead_website", weight: 0.85 },
  { keyword: "google business", category: "gbp_setup", weight: 0.8 },
  { keyword: "drowning in whatsapp", category: "whatsapp_overload", weight: 0.85 },
  { keyword: "slow follow-up", category: "slow_followup", weight: 0.8 },
  { keyword: "admin overload", category: "admin_pain", weight: 0.75 },
  { keyword: "manual lead", category: "manual_processes", weight: 0.7 },
  { keyword: "customer service chaos", category: "service_chaos", weight: 0.75 },
  { keyword: "no one answers", category: "missed_calls", weight: 0.85 },
  { keyword: "losing customers", category: "churn", weight: 0.8 },
  { keyword: "need automation", category: "automation_need", weight: 0.8 },
  { keyword: "anyone know someone", category: "referral_seeking", weight: 0.7 },
  { keyword: "looking for a developer", category: "dev_seeking", weight: 0.65 },
  { keyword: "ai for my business", category: "ai_interest", weight: 0.75 },
  { keyword: "chatbot", category: "chatbot_interest", weight: 0.7 },
  { keyword: "voice agent", category: "voice_interest", weight: 0.75 },
  { keyword: "crm", category: "crm_need", weight: 0.65 },
  { keyword: "lead generation", category: "leadgen_need", weight: 0.7 },
];

export const PAIN_POINT_TO_LANDING_PAGE: Record<string, string> = {
  missed_calls: "/services/voice-agents",
  lead_overflow: "/services/lead-generation",
  no_website: "/services/web-design",
  dead_website: "/services/web-design",
  gbp_setup: "/services/google-business",
  whatsapp_overload: "/services/whatsapp-automation",
  slow_followup: "/services/automation",
  admin_pain: "/services/automation",
  manual_processes: "/services/automation",
  service_chaos: "/services/ai-workflows",
  churn: "/services/lead-generation",
  automation_need: "/services/automation",
  referral_seeking: "/",
  dev_seeking: "/services/custom-software",
  ai_interest: "/services/ai-workflows",
  chatbot_interest: "/services/whatsapp-automation",
  voice_interest: "/services/voice-agents",
  crm_need: "/services/automation",
  leadgen_need: "/services/lead-generation",
};

export const STANDARD_TRACK_LANDING = "/promotions";

export const PRICING = {
  starter: { name: "Starter System", setup: 19500, monthly: 3500 },
  growth: { name: "Growth System", setup: 32500, monthly: 0 },
  revenue: { name: "Revenue System™", setup: 49500, monthly: 0 },
  gbp: { name: "Google Business Profile Setup", setup: 800, monthly: 0 },
} as const;

export const PROMO_DISCOUNT = 0.45;

export const DEFAULT_CHANNELS: Omit<ProspectingChannel, "id">[] = [
  // Track A — Premium
  { platform: "linkedin", channel_name: "SA Business Owners", channel_url: "https://linkedin.com/groups/sa-business-owners", track: "premium", enabled: true, scan_priority: 1, last_scanned_at: null, conversion_rate: 0, metadata: {} },
  { platform: "linkedin", channel_name: "JHB/PTA Chamber Groups", channel_url: "https://linkedin.com/groups/jhb-pta-chamber", track: "premium", enabled: true, scan_priority: 2, last_scanned_at: null, conversion_rate: 0, metadata: {} },
  { platform: "google_maps", channel_name: "Competitor Reviews", channel_url: "https://maps.google.com", track: "premium", enabled: true, scan_priority: 3, last_scanned_at: null, conversion_rate: 0, metadata: {} },
  { platform: "youtube", channel_name: "Business Scaling Comments", channel_url: "https://youtube.com", track: "premium", enabled: true, scan_priority: 4, last_scanned_at: null, conversion_rate: 0, metadata: {} },
  // Track B — Standard (promo)
  { platform: "facebook", channel_name: "Business Owners Gauteng", channel_url: "https://facebook.com/groups/business-owners-gauteng", track: "standard", enabled: true, scan_priority: 1, last_scanned_at: null, conversion_rate: 0, metadata: {} },
  { platform: "facebook", channel_name: "Young Entrepreneurs SA", channel_url: "https://facebook.com/groups/young-entrepreneurs-sa", track: "standard", enabled: true, scan_priority: 2, last_scanned_at: null, conversion_rate: 0, metadata: {} },
  { platform: "facebook", channel_name: "SME Small Business SA", channel_url: "https://facebook.com/groups/sme-small-business-sa", track: "standard", enabled: true, scan_priority: 3, last_scanned_at: null, conversion_rate: 0, metadata: {} },
  { platform: "reddit", channel_name: "r/southafrica", channel_url: "https://reddit.com/r/southafrica", track: "standard", enabled: true, scan_priority: 4, last_scanned_at: null, conversion_rate: 0, metadata: {} },
  { platform: "tiktok", channel_name: "SA Business Content", channel_url: "https://tiktok.com", track: "standard", enabled: true, scan_priority: 5, last_scanned_at: null, conversion_rate: 0, metadata: {} },
  { platform: "instagram", channel_name: "SA Entrepreneur Content", channel_url: "https://instagram.com", track: "standard", enabled: true, scan_priority: 5, last_scanned_at: null, conversion_rate: 0, metadata: {} },
];
