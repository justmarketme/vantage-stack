import {
  isInboundSource,
  LEAD_SOURCES,
  type LeadSource,
  type SocialPlatform,
} from "../../../lib/consultant/types";

/** Friendly labels for "How did this lead reach us?" (Decision 8, POPIA s.69). */
export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  public_scrape: "Found online",
  landing_page: "Website form",
  social_inbound: "Social media message",
  inbound_call: "They phoned us",
  referral: "Referral (word of mouth)",
  event: "Event",
  consultant_portal: "Added by me",
  other: "Other",
};

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
  other: "Other",
};

/** Narrow the wire `Lead.source` (string | null) to a known LeadSource. */
export function asLeadSource(s: string | null | undefined): LeadSource | null {
  return s && (LEAD_SOURCES as readonly string[]).includes(s) ? (s as LeadSource) : null;
}

/** One-line POPIA hint shown under the source picker. */
export function sourceHint(s: LeadSource): string {
  return isInboundSource(s)
    ? "Emma can follow up straight away."
    : "Get their OK on the call before Emma messages them.";
}
