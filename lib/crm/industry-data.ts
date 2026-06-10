/**
 * South African industry data: competitor suggestions and benchmarks.
 * Used in the intake form (chips) and blueprint generator (auto-fill when no competitors listed).
 */

export type BenchmarkSource = "wordstream_2026" | "hubspot_2025" | "internal_estimate";

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
  source: BenchmarkSource;
};

export type SubNicheBenchmark = {
  avgCpl: number;
  conversionRate: string;
  topChannels: string[];
  avgDealSize: string;
  source: BenchmarkSource;
};

export type IndustryEntry = {
  label: string;
  competitors: string[];
  benchmarks: IndustryBenchmarks;
  subNiches: string[];
  subNicheCompetitors: Record<string, string[]>;
  subNicheBenchmarks?: Record<string, SubNicheBenchmark>;
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
      source: "internal_estimate",
    },
    subNiches: ["Fashion & Apparel", "Electronics & Tech", "Beauty & Personal Care", "Home & Garden", "Food & Grocery", "Handmade & Artisan", "Digital Products"],
    subNicheCompetitors: {
      "Fashion & Apparel": ["Superbalist", "Zando", "Spree", "Bash", "Shein SA"],
      "Electronics & Tech": ["Takealot Electronics", "HiFi Corp Online", "Incredible Connection Online", "Wootware", "Evetech"],
      "Beauty & Personal Care": ["Faithful to Nature", "Clicks Online", "Dischem Online", "LookFantastic SA", "Skin Accumax"],
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
      source: "internal_estimate",
    },
    subNiches: ["Legal", "Accounting & Tax", "Business Consulting", "IT Services & Support", "HR & Recruitment", "Engineering & Architecture", "Financial Advisory"],
    subNicheCompetitors: {
      "Legal": ["Webber Wentzel", "ENSafrica", "Cliffe Dekker Hofmeyr", "Bowmans", "LawAdvisor listings"],
      "Accounting & Tax": ["SNG Grant Thornton", "BDO South Africa", "Nexia SAB&T", "TaxTim", "Outsourced CFO"],
      "IT Services & Support": ["BCX", "Dimension Data", "Liquid Intelligent Technologies", "DataGroup", "Obsidian Systems"],
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
      source: "internal_estimate",
    },
    subNiches: ["General Practice / GP", "Dental", "Physiotherapy & Allied Health", "Mental Health", "Medical Aesthetics & Wellness", "Veterinary", "Specialist Medical", "Supplements & Health Products"],
    subNicheCompetitors: {
      "Medical Aesthetics & Wellness": ["Skin Renewal", "Laser Clinics SA", "Aesthetics SA", "The Aesthetics Studio", "Skin Bar"],
      "Supplements & Health Products": ["Faithful to Nature", "Wellness Warehouse", "Herbex", "Dischem Online", "Clicks Online"],
      "General Practice / GP": ["My Meds", "Medipost", "MedBrief", "Hello Doctor", "Mediclinic Occupational Health"],
      "Dental": ["Tooth Fairy Dental", "Smilezone", "Dental Expressions", "Abilident", "SADA members"],
      "Mental Health": ["Akeso Clinics", "SADAG", "Lifeline SA", "Headspace SA", "BetterHelp SA"],
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
      source: "internal_estimate",
    },
    subNiches: ["Residential Sales", "Commercial Property", "Property Management", "Short-Term Rentals", "Property Development", "Valuation & Appraisal"],
    subNicheCompetitors: {
      "Residential Sales": ["Pam Golding Properties", "Seeff", "Engel & Völkers", "RE/MAX South Africa", "Rawson Properties"],
      "Short-Term Rentals": ["Lekkeslaap", "SafariNow", "Airbnb SA hosts", "BKSA", "Urban Oasis"],
      "Property Management": ["JHI Properties", "Mafadi Property Management", "Aida", "API Property Group", "Chas Everitt"],
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
      source: "internal_estimate",
    },
    subNiches: ["Residential Building & Renovation", "Commercial Construction", "Specialty Trades (Electrical/Plumbing/HVAC)", "Interior Design & Fit-Out", "Landscaping", "Civil & Infrastructure"],
    subNicheCompetitors: {
      "Residential Building & Renovation": ["WBHO", "Tiber Construction", "Trencon", "Group Five", "NHBRC registered builders"],
      "Specialty Trades (Electrical/Plumbing/HVAC)": ["Master Electricians SA members", "Bidvest Facilities Management", "Servest", "G4S Facilities", "National Plumbers Guild members"],
      "Interior Design & Fit-Out": ["Okha", "Inhouse Brand Architects", "Aupiais House", "Cory Contaxis", "SAIDI members"],
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
      source: "internal_estimate",
    },
    subNiches: ["K-12 Tutoring & Private Schools", "Online Courses & EdTech", "Corporate Training", "Test Prep", "Skills Bootcamps", "Higher Education"],
    subNicheCompetitors: {
      "K-12 Tutoring & Private Schools": ["Educate Online", "Optimi", "Teach Me 2", "Extra Lessons", "Curro Holdings"],
      "Skills Bootcamps": ["HyperionDev", "CodeSpace", "WeThinkCode_", "CapaCiTi", "Umuzi"],
      "Corporate Training": ["Enterprises UP", "Litha Learning", "Talent Architects", "Nashua Learning", "Terblanche & Associates"],
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
      source: "internal_estimate",
    },
    subNiches: ["Hotel & Accommodation", "Restaurant & Café", "Catering & Events", "Bar & Nightlife", "Tours & Travel", "Wellness & Spa"],
    subNicheCompetitors: {
      "Hotel & Accommodation": ["Tsogo Sun", "City Lodge Hotels", "African Pride Hotels", "The Vineyard Hotel", "Protea Hotels by Marriott"],
      "Restaurant & Café": ["Nando's SA", "Ocean Basket", "Mugg & Bean", "Vida e Caffè", "Fournos"],
      "Wellness & Spa": ["Mangwanani African Spa", "The Silo Spa", "Camelot Spa", "Bodhi Khaya", "La Colombe Spa"],
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
      source: "internal_estimate",
    },
    subNiches: ["SaaS & Software", "App Development", "IT Support & Managed Services", "Cybersecurity", "FinTech", "MarTech"],
    subNicheCompetitors: {
      "SaaS & Software": ["Sage South Africa", "Syspro", "Kerridge Commercial Systems", "MicroStrategy SA", "Acumatica"],
      "Cybersecurity": ["Liquid Cyber Security", "Datacentrix", "Performanta", "Check Point SA", "Dark Fibre Africa"],
      "FinTech": ["Yoco", "Peach Payments", "PayFast", "Ozow", "SnapScan"],
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
      source: "internal_estimate",
    },
    subNiches: ["Insurance (General)", "Life & Health Insurance", "Investment Advisory", "Accounting & Bookkeeping", "Lending & Credit", "Crypto & Digital Assets"],
    subNicheCompetitors: {
      "Insurance (General)": ["Outsurance", "Discovery Insure", "Momentum Short-Term Insurance", "Santam", "Hollard"],
      "Investment Advisory": ["Allan Gray", "Coronation Fund Managers", "Ninety One", "PSG Wealth", "Sanlam Investments"],
      "Lending & Credit": ["African Bank", "Capitec Business", "WeCapital", "Retail Capital", "Lulalend"],
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
      source: "internal_estimate",
    },
    subNiches: ["Fashion & Apparel", "Electronics", "Specialty Retail", "Furniture & Home", "Grocery", "Beauty & Cosmetics"],
    subNicheCompetitors: {
      "Fashion & Apparel": ["Zara SA", "H&M South Africa", "Woolworths Fashion", "Truworths", "Mr Price"],
      "Beauty & Cosmetics": ["Sorbet", "Clicks Beauty", "Dis-Chem Beauty", "Edgars Beauty", "Foschini Beauty"],
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
      source: "internal_estimate",
    },
    subNiches: ["Restaurant (Eat-In)", "Takeaway & Delivery", "Bakery & Confectionery", "Catering & Food Service", "Beverage Production", "Food Distribution"],
    subNicheCompetitors: {
      "Takeaway & Delivery": ["Uber Eats SA", "Bolt Food", "Checkers Sixty60", "Pick n Pay ASAP!", "Mr Delivery"],
      "Bakery & Confectionery": ["Woolworths Food", "Checkers Bakery", "Fournos", "Bread & Butter Patisserie", "Sasfin Bakery"],
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
      source: "internal_estimate",
    },
    subNiches: ["Digital Marketing Agency", "Creative & Design", "Social Media Management", "PR & Communications", "Influencer & Affiliate"],
    subNicheCompetitors: {
      "Digital Marketing Agency": ["Ogilvy South Africa", "Joe Public United", "TBWA Hunt Lascaris", "Rogerwilco", "Acceleration"],
      "Social Media Management": ["Retroviral", "Stretch Digital", "Limelight", "Ornico", "Carma"],
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
      source: "internal_estimate",
    },
    subNiches: [],
    subNicheCompetitors: {},
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
