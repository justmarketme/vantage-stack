/**
 * Brand context extraction — derives color palette, brand voice, logo URL,
 * and other brand signals from social insights and website enrichment data.
 *
 * node-vibrant is an optional dependency. If it's not installed the color
 * fields degrade gracefully to null rather than throwing.
 */

export interface BrandContext {
  primaryColor: string | null;   // hex e.g. "#f97316"
  darkColor: string | null;
  lightColor: string | null;
  accentColor: string | null;
  logoUrl: string | null;
  brandName: string | null;
  brandVoice: string | null;     // "professional" | "friendly" | "luxury" | "technical" | null
}

// ── Brand voice detection ────────────────────────────────────────────────────

const VOICE_SIGNALS: Array<{ voice: string; keywords: string[] }> = [
  { voice: "luxury",      keywords: ["luxury", "premium", "exclusive", "elite", "bespoke", "couture", "prestige"] },
  { voice: "technical",   keywords: ["technical", "engineer", "system", "certified", "compliance", "infrastructure", "protocol", "algorithm"] },
  { voice: "friendly",    keywords: ["fun", "easy", "quick", "awesome", "hey", "love", "cool", "yay", "excited", "happy"] },
];

function detectBrandVoice(texts: string[]): string | null {
  if (!texts.length) return null;
  const combined = texts.join(" ").toLowerCase();
  const scores: Record<string, number> = {};

  for (const { voice, keywords } of VOICE_SIGNALS) {
    let score = 0;
    for (const kw of keywords) {
      // Count occurrences
      const re = new RegExp(`\\b${kw}\\b`, "gi");
      const matches = combined.match(re);
      score += matches ? matches.length : 0;
    }
    if (score > 0) scores[voice] = score;
  }

  if (!Object.keys(scores).length) return "professional";
  const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return top[1] > 0 ? top[0] : "professional";
}

// ── Color extraction via node-vibrant (optional) ─────────────────────────────

function toHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
}

async function extractColorsFromUrl(imageUrl: string): Promise<{
  primaryColor: string | null;
  darkColor: string | null;
  lightColor: string | null;
  accentColor: string | null;
}> {
  try {
    // Dynamic import so the module is optional — if missing, we degrade gracefully
    type VibrantType = { from: (src: string) => { getPalette: () => Promise<Record<string, { getRgb: () => [number, number, number] } | null>> } };
    const mod = await import("node-vibrant") as { default?: VibrantType } & VibrantType;
    const Vibrant: VibrantType = mod.default ?? (mod as VibrantType);
    const palette = await Vibrant.from(imageUrl).getPalette();

    const vibrant = palette["Vibrant"];
    const darkVibrant = palette["DarkVibrant"];
    const lightVibrant = palette["LightVibrant"];
    const muted = palette["Muted"];

    return {
      primaryColor: vibrant ? toHex(...vibrant.getRgb()) : null,
      darkColor:    darkVibrant ? toHex(...darkVibrant.getRgb()) : null,
      lightColor:   lightVibrant ? toHex(...lightVibrant.getRgb()) : null,
      accentColor:  muted ? toHex(...muted.getRgb()) : null,
    };
  } catch {
    // node-vibrant not installed or image fetch failed
    return { primaryColor: null, darkColor: null, lightColor: null, accentColor: null };
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function extractBrandContext(
  socialInsights: Record<string, unknown> | null,
  websiteEnrichment: Record<string, unknown> | null,
  clientName: string | null,
): Promise<BrandContext> {
  // Gather post texts for brand voice analysis
  const postTexts: string[] = [];
  const insights = socialInsights?.insights as Array<Record<string, unknown>> | null | undefined;
  if (Array.isArray(insights)) {
    for (const ins of insights) {
      if (ins.recentCaption && typeof ins.recentCaption === "string") {
        postTexts.push(ins.recentCaption);
      }
      const topHashtags = ins.topHashtags as string[] | undefined;
      if (Array.isArray(topHashtags)) postTexts.push(...topHashtags);
    }
  }

  const brandVoice = detectBrandVoice(postTexts);

  // Logo / brand image URL
  const faviconUrl = websiteEnrichment?.faviconUrl as string | null | undefined;
  const ogImage = websiteEnrichment?.ogImage as string | null | undefined;
  const logoUrl = faviconUrl ?? ogImage ?? null;

  // Profile image URL from social insights (used for color extraction)
  let profileImageUrl: string | null = null;
  if (Array.isArray(insights) && insights.length > 0) {
    const firstInsight = insights[0];
    profileImageUrl =
      (firstInsight.profilePicUrl as string | null) ??
      (firstInsight.profileImageUrl as string | null) ??
      null;
  }

  // Color extraction — uses node-vibrant if available; gracefully null otherwise
  const imageForColors = profileImageUrl ?? logoUrl;
  const colors = imageForColors
    ? await extractColorsFromUrl(imageForColors)
    : { primaryColor: null, darkColor: null, lightColor: null, accentColor: null };

  return {
    ...colors,
    logoUrl,
    brandName: clientName ?? null,
    brandVoice,
  };
}
