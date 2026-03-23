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
};
