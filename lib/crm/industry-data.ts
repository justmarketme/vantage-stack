/**
 * South African industry data: competitor suggestions and benchmarks.
 * Used in the intake form (chips) and blueprint generator (auto-fill when no competitors listed).
 */

export type IndustryBenchmarks = {
  avgConversionRate: string;
  avgCostPerLead: string;
  monthlySearchVolume: string;
  topChannels: string[];
  avgLeadsPerMonth: string;
  avgRevenuePerLead: string;
  avgWebsiteLoadTime: string;
  contentGaps: string[];
  missedRevenueEstimate: string;
};

export type IndustryEntry = {
  label: string;
  competitors: string[];
  benchmarks: IndustryBenchmarks;
};

export const INDUSTRY_DATA: Record<string, IndustryEntry> = {
  "E-commerce": {
    label: "E-commerce",
    competitors: ["Takealot", "Superbalist", "Bash", "Faithful to Nature", "Zando", "Yuppiechef"],
    benchmarks: {
      avgConversionRate: "2.8%",
      avgCostPerLead: "R95",
      monthlySearchVolume: "85,000+",
      topChannels: ["Google Shopping", "Meta Ads", "Email Marketing", "SEO"],
      avgLeadsPerMonth: "200–800",
      avgRevenuePerLead: "R650",
      avgWebsiteLoadTime: "2.1s",
      contentGaps: ["Product schema markup", "Review schema", "Google Shopping feed", "Cart abandonment emails"],
      missedRevenueEstimate: "R130,000–R520,000/year",
    },
  },
  "Professional services": {
    label: "Professional Services",
    competitors: ["ENSafrica", "Deloitte SA", "PwC South Africa", "Grant Thornton SA", "BDO South Africa"],
    benchmarks: {
      avgConversionRate: "4.1%",
      avgCostPerLead: "R420",
      monthlySearchVolume: "22,000+",
      topChannels: ["LinkedIn", "Google Ads", "SEO", "Referral programme"],
      avgLeadsPerMonth: "30–90",
      avgRevenuePerLead: "R18,500",
      avgWebsiteLoadTime: "2.8s",
      contentGaps: ["Thought leadership blog", "Case studies", "LinkedIn content", "Lead magnets"],
      missedRevenueEstimate: "R555,000–R1,665,000/year",
    },
  },
  Healthcare: {
    label: "Healthcare",
    competitors: ["Netcare", "Mediclinic", "Life Healthcare", "Clicks Clinics", "Dis-Chem Health"],
    benchmarks: {
      avgConversionRate: "5.2%",
      avgCostPerLead: "R280",
      monthlySearchVolume: "48,000+",
      topChannels: ["Google Ads", "SEO", "Google Business Profile", "Facebook"],
      avgLeadsPerMonth: "60–200",
      avgRevenuePerLead: "R4,200",
      avgWebsiteLoadTime: "2.3s",
      contentGaps: ["Google Business Profile optimisation", "Patient reviews strategy", "Health content SEO", "Online booking integration"],
      missedRevenueEstimate: "R252,000–R840,000/year",
    },
  },
  "Real estate": {
    label: "Real Estate",
    competitors: ["Pam Golding Properties", "RE/MAX SA", "Seeff", "Harcourts SA", "Lew Geffen Sotheby's"],
    benchmarks: {
      avgConversionRate: "3.5%",
      avgCostPerLead: "R380",
      monthlySearchVolume: "65,000+",
      topChannels: ["Google Ads", "Meta Ads", "Property portals", "SEO"],
      avgLeadsPerMonth: "50–180",
      avgRevenuePerLead: "R35,000",
      avgWebsiteLoadTime: "2.6s",
      contentGaps: ["Virtual tour integration", "Area landing pages", "Valuation lead magnet", "Video property tours"],
      missedRevenueEstimate: "R1,750,000–R6,300,000/year",
    },
  },
  Construction: {
    label: "Construction",
    competitors: ["Murray & Roberts", "WBHO Construction", "Aveng", "Stefanutti Stocks", "Group Five"],
    benchmarks: {
      avgConversionRate: "2.9%",
      avgCostPerLead: "R550",
      monthlySearchVolume: "18,000+",
      topChannels: ["Google Ads", "LinkedIn", "SEO", "Referrals"],
      avgLeadsPerMonth: "15–60",
      avgRevenuePerLead: "R85,000",
      avgWebsiteLoadTime: "3.1s",
      contentGaps: ["Project portfolio / case studies", "Accreditation badges", "Google Business Profile", "LinkedIn company page"],
      missedRevenueEstimate: "R1,275,000–R5,100,000/year",
    },
  },
  Education: {
    label: "Education",
    competitors: ["GetSmarter", "Varsity College", "IIE MSA", "Boston City Campus", "Educor"],
    benchmarks: {
      avgConversionRate: "6.1%",
      avgCostPerLead: "R210",
      monthlySearchVolume: "55,000+",
      topChannels: ["Google Ads", "Facebook Ads", "SEO", "YouTube"],
      avgLeadsPerMonth: "80–350",
      avgRevenuePerLead: "R9,500",
      avgWebsiteLoadTime: "2.2s",
      contentGaps: ["Course schema markup", "Alumni success stories", "Free resource lead magnets", "YouTube channel strategy"],
      missedRevenueEstimate: "R760,000–R3,325,000/year",
    },
  },
  Hospitality: {
    label: "Hospitality",
    competitors: ["Sun International", "Tsogo Sun", "Protea Hotels (Marriott)", "City Lodge Hotels", "African Pride Hotels"],
    benchmarks: {
      avgConversionRate: "4.8%",
      avgCostPerLead: "R160",
      monthlySearchVolume: "72,000+",
      topChannels: ["Google Ads", "Meta Ads", "Google Business Profile", "TripAdvisor"],
      avgLeadsPerMonth: "120–500",
      avgRevenuePerLead: "R2,800",
      avgWebsiteLoadTime: "2.0s",
      contentGaps: ["Online booking integration", "Review management", "Google Business photos", "Instagram content strategy"],
      missedRevenueEstimate: "R336,000–R1,400,000/year",
    },
  },
  Technology: {
    label: "Technology",
    competitors: ["BCX", "Dimension Data (NTT)", "EOH", "Altron", "T-Systems South Africa"],
    benchmarks: {
      avgConversionRate: "3.2%",
      avgCostPerLead: "R380",
      monthlySearchVolume: "32,000+",
      topChannels: ["Google Ads", "LinkedIn", "SEO", "Content marketing"],
      avgLeadsPerMonth: "40–140",
      avgRevenuePerLead: "R22,000",
      avgWebsiteLoadTime: "2.4s",
      contentGaps: ["Technical blog / thought leadership", "Case studies with ROI", "LinkedIn ads", "Gated whitepapers"],
      missedRevenueEstimate: "R880,000–R3,080,000/year",
    },
  },
  "Financial services": {
    label: "Financial Services",
    competitors: ["FNB Digital", "Capitec", "Discovery Bank", "Investec", "Standard Bank Digital"],
    benchmarks: {
      avgConversionRate: "3.8%",
      avgCostPerLead: "R490",
      monthlySearchVolume: "95,000+",
      topChannels: ["Google Ads", "LinkedIn", "SEO", "WhatsApp marketing"],
      avgLeadsPerMonth: "50–200",
      avgRevenuePerLead: "R28,000",
      avgWebsiteLoadTime: "2.5s",
      contentGaps: ["Trust signals / compliance badges", "Calculator lead magnets", "Educational content SEO", "WhatsApp Business API"],
      missedRevenueEstimate: "R1,400,000–R5,600,000/year",
    },
  },
  Retail: {
    label: "Retail",
    competitors: ["Woolworths SA", "Mr Price", "The Foschini Group", "Truworths", "Edgars"],
    benchmarks: {
      avgConversionRate: "3.1%",
      avgCostPerLead: "R120",
      monthlySearchVolume: "110,000+",
      topChannels: ["Google Shopping", "Meta Ads", "Email", "SMS marketing"],
      avgLeadsPerMonth: "300–1200",
      avgRevenuePerLead: "R480",
      avgWebsiteLoadTime: "1.9s",
      contentGaps: ["Loyalty programme integration", "Product review schema", "Abandoned cart recovery", "WhatsApp catalogue"],
      missedRevenueEstimate: "R144,000–R576,000/year",
    },
  },
  "Food & Beverage": {
    label: "Food & Beverage",
    competitors: ["Nando's SA", "Spur Corporation", "Steers", "Wimpy SA", "Ocean Basket"],
    benchmarks: {
      avgConversionRate: "5.5%",
      avgCostPerLead: "R85",
      monthlySearchVolume: "45,000+",
      topChannels: ["Google Business Profile", "Instagram", "Meta Ads", "Uber Eats listings"],
      avgLeadsPerMonth: "150–600",
      avgRevenuePerLead: "R320",
      avgWebsiteLoadTime: "2.0s",
      contentGaps: ["Online ordering integration", "Google Business photos", "Instagram reels strategy", "Loyalty app / WhatsApp"],
      missedRevenueEstimate: "R48,000–R192,000/year",
    },
  },
  Marketing: {
    label: "Marketing Agency",
    competitors: ["Ogilvy South Africa", "Joe Public United", "Grid Worldwide", "TBWA\\Hunt\\Lascaris", "Net#work BBDO"],
    benchmarks: {
      avgConversionRate: "4.4%",
      avgCostPerLead: "R350",
      monthlySearchVolume: "14,000+",
      topChannels: ["LinkedIn", "Google Ads", "SEO", "Referral network"],
      avgLeadsPerMonth: "20–70",
      avgRevenuePerLead: "R45,000",
      avgWebsiteLoadTime: "2.3s",
      contentGaps: ["Case study portfolio", "Awards & credentials page", "LinkedIn thought leadership", "Free audit lead magnet"],
      missedRevenueEstimate: "R900,000–R3,150,000/year",
    },
  },
  Other: {
    label: "General Business",
    competitors: [],
    benchmarks: {
      avgConversionRate: "3.5%",
      avgCostPerLead: "R300",
      monthlySearchVolume: "20,000+",
      topChannels: ["Google Ads", "Meta Ads", "SEO", "Email marketing"],
      avgLeadsPerMonth: "30–100",
      avgRevenuePerLead: "R8,000",
      avgWebsiteLoadTime: "2.5s",
      contentGaps: ["Clear value proposition on homepage", "Lead capture form", "Google Analytics setup", "Google Business Profile"],
      missedRevenueEstimate: "R240,000–R800,000/year",
    },
  },
};

/**
 * Fuzzy-match an industry string to the closest entry in INDUSTRY_DATA.
 * Falls back to "Other" if nothing matches.
 */
export function getIndustryData(industry: string | null | undefined): IndustryEntry {
  if (!industry) return INDUSTRY_DATA["Other"]!;
  const key = Object.keys(INDUSTRY_DATA).find(
    (k) => k.toLowerCase() === industry.toLowerCase() || industry.toLowerCase().includes(k.toLowerCase()),
  );
  return INDUSTRY_DATA[key ?? "Other"] ?? INDUSTRY_DATA["Other"]!;
}

/**
 * Returns competitor suggestions for the intake form chips.
 * Returns an empty array for "Other" so no misleading suggestions are shown.
 */
export function getCompetitorSuggestions(industry: string | null | undefined): string[] {
  return getIndustryData(industry).competitors;
}
