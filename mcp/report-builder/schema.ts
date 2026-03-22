export type ResearchJson = {
  site?: {
    url?: string;
    industry?: string;
    location?: string;
    notes?: string;
  };
  metrics?: {
    traffic?: {
      monthlyVisits?: number;
      sources?: Record<string, number>;
    };
    speed?: {
      mobileScore?: number;
      desktopScore?: number;
      lcpMs?: number;
      inpMs?: number;
      cls?: number;
    };
    backlinks?: {
      referringDomains?: number;
      totalBacklinks?: number;
      authorityScore?: number;
    };
  };
  seo?: {
    topKeywords?: Array<{ keyword: string; position?: number; volume?: number; intent?: string }>;
    missingKeywords?: Array<{ keyword: string; volume?: number; intent?: string; difficulty?: number }>;
    technicalFindings?: Array<{ issue: string; impact?: "low" | "medium" | "high"; evidence?: string }>;
    contentFindings?: Array<{ issue: string; impact?: "low" | "medium" | "high"; evidence?: string }>;
  };
  conversion?: {
    findings?: Array<{ issue: string; impact?: "low" | "medium" | "high"; evidence?: string; recommendation?: string }>;
  };
  competitors?: Array<{
    name: string;
    url?: string;
    metrics?: {
      trafficMonthlyVisits?: number;
      speedScore?: number;
      referringDomains?: number;
      authorityScore?: number;
    };
    advantages?: string[];
    keywords?: Array<{ keyword: string; position?: number; volume?: number }>;
  }>;
  ads?: {
    cpcByKeyword?: Array<{ keyword: string; cpcUsd: number; volume?: number }>;
    benchmarks?: {
      ctr?: number;
      conversionRate?: number;
      avgOrderValue?: number;
      leadValue?: number;
    };
  };
};

export type HealthScoreBreakdown = {
  trafficScore: number;
  speedScore: number;
  backlinksScore: number;
  total: number;
  notes: string[];
};

export type Gap = {
  category: "traffic" | "speed" | "backlinks" | "keywords" | "conversion" | "content" | "technical";
  title: string;
  whyItMatters: string;
  evidence?: string;
  competitorReference?: string;
  severity: "low" | "medium" | "high";
};

export type RevenueOpportunity = {
  assumptions: {
    monthlyVisits: number;
    ctr: number;
    conversionRate: number;
    avgValue: number;
    cpcUsd: number;
    trafficCaptureShare: number;
  };
  estimates: {
    clicks: number;
    spendUsd: number;
    conversions: number;
    revenueUsd: number;
    roas: number;
    profitUsd?: number;
  };
  notes: string[];
};

export type Upsell = {
  offer: string;
  outcome: string;
  whyNow: string;
  scope: string[];
  proofAngle?: string;
  investmentRange?: string;
};

