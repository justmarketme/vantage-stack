/** Optional discovery / brand overrides (from call notes or manual CRM entry). */
export type DiscoverySnapshot = {
  brand_voice?: string;
  primary_colors?: string[];
  secondary_colors?: string[];
  typography?: string;
  design_preferences?: string;
  feature_priorities?: string;
  content_availability?: string;
  headline?: string;
  subheading?: string;
  primary_cta?: string;
  secondary_cta?: string;
  pages_needed?: string[];
  lead_form_fields?: string;
  booking?: boolean;
  ecommerce?: boolean;
  blog?: boolean;
  dark_mode?: boolean;
  analytics_notes?: string;
  integrations?: string;
  success_metric?: string;
};

export type AggregatedClientContext = {
  clientId: string;
  clientName: string;
  company: string;
  email: string;
  websiteUrl: string;
  industry: string;
  revenueRange: string;
  companyStage: "Startup" | "SMB" | "Enterprise" | "Unknown";
  challenges: string[];
  competitors: string[];
  toolsUsed: string[];
  monthlyBudget: string;
  monthlyBudgetNumeric: number | null;
  successGoals: string;
  currentMarketing: string;
  notesJoined: string;
  healthScore: number | null;
  discovery: DiscoverySnapshot;
  competitorAnalysisExtra: string;
  // Enriched fields
  subNiche?: string | null;
  brandContext?: {
    primaryColor: string | null;
    darkColor: string | null;
    lightColor: string | null;
    accentColor: string | null;
    brandVoice: string | null;
    logoUrl: string | null;
  } | null;
  websiteEnrichment?: {
    pageSpeedMobile?: number | null;
    pageSpeedDesktop?: number | null;
    techStack?: string[] | null;
    seoSignals?: Record<string, unknown> | null;
    ogTitle?: string | null;
    description?: string | null;
  } | null;
  socialInsights?: {
    instagram?: { followers?: number | null; engagementRate?: number | null; contentThemes?: string[] | null } | null;
    tiktok?: { followers?: number | null } | null;
    facebook?: { likes?: number | null } | null;
  } | null;
  conversionRate?: string | null;
  speedToContact?: string | null;
  urgencyTimeline?: string | null;
  previousVendorExp?: string[] | null;
  primarySocialHandle?: string | null;
  websiteExists?: string | null;
  primaryIntent?: string | null;
  currentWebsiteStatus?: string | null;
  googleMapsStatus?: string | null;
  websiteGoal?: string[] | null;
  serveArea?: string | null;
  biggestTimeWaste?: string[] | null;
  teamSize?: string | null;
  hoursLostPerWeek?: string | null;
  packagePreference?: string | null;
  clientAcquisition?: string | null;
};
