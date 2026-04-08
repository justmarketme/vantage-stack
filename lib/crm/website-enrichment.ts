/**
 * Website enrichment — pulls live data about a client's online presence using free APIs.
 * All individual fetchers are fault-tolerant: they return null on error, never throw.
 */

export type PageSpeedScores = {
  score: number;        // 0–100
  lcp: number;          // ms
  cls: number;          // unitless
  tbt: number;          // ms
};

export type WhoisData = {
  domainName: string;
  registrar: string;
  createdDate: string;   // ISO string or raw text
  expiresDate: string;
  updatedDate: string;
  ageYears: number | null;
  status: string;
};

export type WebsiteEnrichmentData = {
  url: string;
  scrapedAt: string;
  pageSpeed: {
    mobile: PageSpeedScores | null;
    desktop: PageSpeedScores | null;
    opportunities: string[];
  } | null;
  seoSignals: {
    hasTitle: boolean;
    titleText: string;
    hasMetaDescription: boolean;
    metaDescription: string;
    h1s: string[];
    hasSchema: boolean;
    hasOgTags: boolean;
    hasCanonical: boolean;
    isHttps: boolean;
    hasRobotsTxt: boolean;
    hasSitemap: boolean;
    techStack: string[];
  } | null;
  openPageRank: {
    score: number;
    rank: string;
  } | null;
  metaAds: {
    activeAds: number;
    categories: string[];
  } | null;
  whois: WhoisData | null;
};

// ─────────────────────────────────────────────
// Google PageSpeed Insights
// ─────────────────────────────────────────────

async function fetchPageSpeedStrategy(
  url: string,
  strategy: "mobile" | "desktop",
  apiKey: string,
): Promise<PageSpeedScores | null> {
  try {
    const params = new URLSearchParams({
      url,
      strategy,
      category: "performance",
      ...(apiKey ? { key: apiKey } : {}),
    });
    const res = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`,
      { signal: AbortSignal.timeout(30_000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const cats = data?.lighthouseResult?.categories;
    const audits = data?.lighthouseResult?.audits;
    if (!cats || !audits) return null;

    return {
      score: Math.round((cats.performance?.score ?? 0) * 100),
      lcp: Math.round((audits["largest-contentful-paint"]?.numericValue ?? 0)),
      cls: parseFloat((audits["cumulative-layout-shift"]?.numericValue ?? 0).toFixed(3)),
      tbt: Math.round((audits["total-blocking-time"]?.numericValue ?? 0)),
    };
  } catch {
    return null;
  }
}

async function fetchPageSpeed(url: string): Promise<WebsiteEnrichmentData["pageSpeed"]> {
  const apiKey = process.env.PAGESPEED_API_KEY ?? "";
  const [mobile, desktop] = await Promise.all([
    fetchPageSpeedStrategy(url, "mobile", apiKey),
    fetchPageSpeedStrategy(url, "desktop", apiKey),
  ]);

  // Extract top opportunities from desktop (usually more data)
  const opportunities: string[] = [];
  try {
    const params = new URLSearchParams({
      url,
      strategy: "mobile",
      category: "performance",
      ...(apiKey ? { key: apiKey } : {}),
    });
    const res = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`,
      { signal: AbortSignal.timeout(30_000) },
    );
    if (res.ok) {
      const data = await res.json();
      const audits = data?.lighthouseResult?.audits ?? {};
      const opportunityIds = [
        "render-blocking-resources",
        "unused-css-rules",
        "unused-javascript",
        "uses-optimized-images",
        "uses-responsive-images",
        "efficient-animated-content",
        "uses-long-cache-ttl",
        "uses-text-compression",
      ];
      for (const id of opportunityIds) {
        const a = audits[id];
        if (a && a.score !== null && a.score < 0.9 && a.title) {
          opportunities.push(a.title);
          if (opportunities.length >= 4) break;
        }
      }
    }
  } catch {
    // ignore
  }

  if (!mobile && !desktop) return null;
  return { mobile, desktop, opportunities };
}

// ─────────────────────────────────────────────
// Homepage scrape
// ─────────────────────────────────────────────

const TECH_SIGNATURES: Array<{ name: string; pattern: RegExp }> = [
  { name: "Google Analytics 4", pattern: /gtag\(|googletagmanager\.com\/gtag/i },
  { name: "Google Tag Manager", pattern: /googletagmanager\.com\/ns\.html|gtm\.js/i },
  { name: "Meta Pixel", pattern: /connect\.facebook\.net|fbq\(/i },
  { name: "Hotjar", pattern: /hotjar\.com|hjSetting/i },
  { name: "HubSpot", pattern: /hs-scripts\.com|hubspot\.com/i },
  { name: "Intercom", pattern: /intercomcdn\.com|window\.Intercom/i },
  { name: "Zendesk", pattern: /zopim\.com|zendesk\.com/i },
  { name: "Shopify", pattern: /cdn\.shopify\.com|shopify\.com/i },
  { name: "WordPress", pattern: /wp-content|wp-includes/i },
  { name: "Wix", pattern: /wixstatic\.com|wix\.com/i },
  { name: "Squarespace", pattern: /squarespace\.com|sqsp\./i },
  { name: "Webflow", pattern: /webflow\.com|webflow\.js/i },
  { name: "Klaviyo", pattern: /klaviyo\.com/i },
  { name: "Mailchimp", pattern: /mailchimp\.com/i },
  { name: "Stripe", pattern: /js\.stripe\.com/i },
  { name: "Crisp Chat", pattern: /crisp\.chat/i },
  { name: "Tidio", pattern: /tidio\.co/i },
];

function extractMeta(html: string, name: string): string {
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${name}["']`, "i"),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return "";
}

function extractOgProperty(html: string, property: string): string {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']og:${property}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:${property}["']`, "i"),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return "";
}

async function scrapeHomepage(url: string): Promise<WebsiteEnrichmentData["seoSignals"]> {
  try {
    const isHttps = url.startsWith("https://");

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; VantageStackBot/1.0; +https://vantagestack.co.za)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Title
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const titleText = titleMatch?.[1]?.trim() ?? "";

    // Meta description
    const metaDescription = extractMeta(html, "description");

    // H1s
    const h1Matches = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)];
    const h1s = h1Matches
      .map((m) => m[1].replace(/<[^>]+>/g, "").trim())
      .filter(Boolean)
      .slice(0, 3);

    // Schema markup
    const hasSchema = /<script[^>]+type=["']application\/ld\+json["']/i.test(html);

    // OG tags
    const hasOgTags = Boolean(extractOgProperty(html, "title") || extractOgProperty(html, "description"));

    // Canonical
    const hasCanonical = /<link[^>]+rel=["']canonical["']/i.test(html);

    // Tech stack detection
    const techStack = TECH_SIGNATURES
      .filter(({ pattern }) => pattern.test(html))
      .map(({ name }) => name);

    // robots.txt
    const baseUrl = new URL(url).origin;
    const hasRobotsTxt = await fetch(`${baseUrl}/robots.txt`, {
      signal: AbortSignal.timeout(5_000),
    })
      .then((r) => r.ok)
      .catch(() => false);

    // sitemap.xml
    const hasSitemap = await fetch(`${baseUrl}/sitemap.xml`, {
      signal: AbortSignal.timeout(5_000),
    })
      .then((r) => r.ok)
      .catch(() => false);

    return {
      hasTitle: Boolean(titleText),
      titleText,
      hasMetaDescription: Boolean(metaDescription),
      metaDescription,
      h1s,
      hasSchema,
      hasOgTags,
      hasCanonical,
      isHttps,
      hasRobotsTxt,
      hasSitemap,
      techStack,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// Open PageRank
// ─────────────────────────────────────────────

async function fetchOpenPageRank(url: string): Promise<WebsiteEnrichmentData["openPageRank"]> {
  const apiKey = process.env.OPENPAGERANK_API_KEY ?? "";
  if (!apiKey) return null;

  try {
    let domain = url;
    try {
      domain = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      // use raw
    }

    const res = await fetch(
      `https://openpagerank.com/api/v1.0/getPageRank?domains[]=${encodeURIComponent(domain)}`,
      {
        headers: { "API-OPR": apiKey },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const entry = data?.response?.[0];
    if (!entry) return null;

    const score = parseFloat(entry.page_rank_decimal ?? "0");
    let rank = "Unknown";
    if (score >= 7) rank = "Strong authority";
    else if (score >= 5) rank = "Good authority";
    else if (score >= 3) rank = "Moderate authority";
    else if (score >= 1) rank = "Low authority";
    else rank = "Very low / new domain";

    return { score, rank };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// Facebook Ad Library
// ─────────────────────────────────────────────

async function fetchFacebookAds(
  companyName: string,
): Promise<WebsiteEnrichmentData["metaAds"]> {
  const accessToken = process.env.META_AD_LIBRARY_ACCESS_TOKEN ?? "";
  if (!accessToken) return null;

  try {
    const params = new URLSearchParams({
      access_token: accessToken,
      search_terms: companyName,
      ad_type: "ALL",
      ad_reached_countries: '["ZA"]',
      fields: "id,ad_delivery_start_time,publisher_platforms",
      limit: "50",
    });

    const res = await fetch(
      `https://graph.facebook.com/v19.0/ads_archive?${params}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return null;

    const data = await res.json();
    const ads: any[] = data?.data ?? [];
    if (!ads.length) return { activeAds: 0, categories: [] };

    const platformSet = new Set<string>();
    for (const ad of ads) {
      const platforms: string[] = ad.publisher_platforms ?? [];
      for (const p of platforms) platformSet.add(p);
    }

    return {
      activeAds: ads.length,
      categories: [...platformSet],
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// WHOIS
// ─────────────────────────────────────────────

async function fetchWhois(url: string): Promise<WhoisData | null> {
  const baseUrl = (process.env.WHOIS_BASE_URL ?? "").replace(/\/$/, "");
  const apiKey = process.env.WHOIS_API_KEY ?? "";
  if (!baseUrl) return null;

  try {
    let domain = url;
    try {
      domain = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      // use raw
    }

    const params = new URLSearchParams({ domain, ...(apiKey ? { apiKey } : {}) });
    const res = await fetch(`${baseUrl}?${params}`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = await res.json();

    // Normalise common WHOIS API response shapes
    const raw =
      data?.WhoisRecord ??
      data?.whois_record ??
      data?.result ??
      data?.data ??
      data ??
      {};

    const created: string =
      raw.createdDate ?? raw.created_date ?? raw.creation_date ?? raw.registryData?.createdDate ?? "";
    const expires: string =
      raw.expiresDate ?? raw.expires_date ?? raw.expiry_date ?? raw.registryData?.expiresDate ?? "";
    const updated: string =
      raw.updatedDate ?? raw.updated_date ?? raw.last_updated ?? raw.registryData?.updatedDate ?? "";
    const registrar: string =
      raw.registrarName ?? raw.registrar ?? raw.registrar_name ?? raw.registryData?.registrarName ?? "";
    const status: string = Array.isArray(raw.status)
      ? raw.status[0]
      : raw.status ?? raw.domainStatus ?? "";

    let ageYears: number | null = null;
    if (created) {
      const createdMs = Date.parse(created);
      if (Number.isFinite(createdMs)) {
        ageYears = Math.floor((Date.now() - createdMs) / (1000 * 60 * 60 * 24 * 365));
      }
    }

    return {
      domainName: domain,
      registrar,
      createdDate: created,
      expiresDate: expires,
      updatedDate: updated,
      ageYears,
      status,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────

export async function runWebsiteEnrichment(
  websiteUrl: string,
  companyName: string,
): Promise<WebsiteEnrichmentData> {
  const [pageSpeed, seoSignals, openPageRank, metaAds, whois] = await Promise.all([
    fetchPageSpeed(websiteUrl),
    scrapeHomepage(websiteUrl),
    fetchOpenPageRank(websiteUrl),
    fetchFacebookAds(companyName),
    fetchWhois(websiteUrl),
  ]);

  return {
    url: websiteUrl,
    scrapedAt: new Date().toISOString(),
    pageSpeed,
    seoSignals,
    openPageRank,
    metaAds,
    whois,
  };
}
