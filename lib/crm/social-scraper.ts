/**
 * Social media scraping via Apify.
 * Scrapers run per-platform and return normalised audience insights
 * that feed into the blueprint generator and CRM intelligence panel.
 */

export interface SocialInsight {
  platform: "instagram" | "tiktok" | "facebook" | "x" | "youtube";
  handle: string;
  profileUrl: string;
  followers: number | null;
  following: number | null;
  posts: number | null;
  avgLikes: number | null;
  avgComments: number | null;
  engagementRate: number | null; // percentage
  topHashtags: string[];
  contentThemes: string[];
  audienceSentiment: string | null;
  postingFrequency: string | null; // e.g. "3x per week"
  recentCaption: string | null;
  scrapedAt: string;
  raw?: unknown;
}

export interface SocialScraperResult {
  ok: boolean;
  insights: SocialInsight[];
  errors: Array<{ platform: string; error: string }>;
}

function apifyToken(): string {
  return (process.env.APIFY_TOKEN || "").trim();
}

function normaliseHandle(input: string, platform: string): string {
  const cleaned = input.trim().replace(/^@/, "");
  // If it's already a full URL return it as-is; otherwise build the URL
  if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) return cleaned;
  switch (platform) {
    case "instagram": return `https://www.instagram.com/${cleaned}/`;
    case "tiktok":    return `https://www.tiktok.com/@${cleaned}`;
    case "facebook":  return `https://www.facebook.com/${cleaned}`;
    case "x":         return `https://x.com/${cleaned}`;
    case "youtube":   return `https://www.youtube.com/@${cleaned}`;
    default:          return cleaned;
  }
}

function extractHandle(input: string): string {
  const cleaned = input.trim().replace(/^@/, "");
  try {
    const url = new URL(cleaned.startsWith("http") ? cleaned : `https://${cleaned}`);
    const parts = url.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1]?.replace(/^@/, "") ?? cleaned;
  } catch {
    return cleaned;
  }
}

/**
 * Try to extract a platform-specific URL from a primary_social_handle fallback.
 * Handles "@mybusiness", "https://instagram.com/mybusiness", etc.
 */
function fallbackUrlFromPrimaryHandle(primaryHandle: string | null | undefined, platform: string): string | null {
  if (!primaryHandle) return null;
  const h = primaryHandle.trim();
  // If it's a URL for this specific platform, use it directly
  const platformDomains: Record<string, string[]> = {
    instagram: ["instagram.com"],
    tiktok: ["tiktok.com"],
    facebook: ["facebook.com", "fb.com"],
    x: ["x.com", "twitter.com"],
    youtube: ["youtube.com", "youtu.be"],
  };
  const domains = platformDomains[platform] ?? [];
  if (h.startsWith("http")) {
    try {
      const u = new URL(h);
      if (domains.some((d) => u.hostname.includes(d))) return h;
    } catch {
      // fall through
    }
    // It's a URL but for a different platform — skip
    return null;
  }
  // It's a bare handle like "@mybusiness" — construct the platform URL
  return normaliseHandle(h, platform);
}

async function runApifyActor(
  actorId: string,
  input: Record<string, unknown>,
  retries = 1,
): Promise<unknown> {
  const token = apifyToken();
  if (!token) throw new Error("APIFY_TOKEN not configured");

  // Start the run
  const startRes = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/runs?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );
  if (!startRes.ok) {
    const txt = await startRes.text().catch(() => "");
    throw new Error(`Apify start failed (${startRes.status}): ${txt}`);
  }
  const startData = await startRes.json() as { data: { id: string } };
  const runId = startData.data.id;

  // Poll until finished (max 90s)
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    const statusRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`
    );
    const statusData = await statusRes.json() as { data: { status: string; defaultDatasetId: string } };
    const { status, defaultDatasetId } = statusData.data;
    if (status === "SUCCEEDED") {
      const dsRes = await fetch(
        `https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${token}&limit=10`
      );
      return dsRes.json();
    }
    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, 5000));
        return runApifyActor(actorId, input, retries - 1);
      }
      throw new Error(`Apify run ${status}`);
    }
  }
  throw new Error("Apify run timed out after 90s");
}

function calcEngagement(likes: number, comments: number, followers: number): number | null {
  if (!followers) return null;
  return Math.round(((likes + comments) / followers) * 10000) / 100; // 2dp %
}

function estimateFrequency(posts: Array<{ timestamp?: string; takenAt?: string; createTime?: number }>): string | null {
  const dates = posts
    .map((p) => {
      const t = p.timestamp ?? p.takenAt ?? (p.createTime ? String(p.createTime * 1000) : undefined);
      return t ? new Date(Number(t) || t).getTime() : null;
    })
    .filter(Boolean)
    .sort((a, b) => b! - a!) as number[];
  if (dates.length < 2) return null;
  const spanDays = (dates[0] - dates[dates.length - 1]) / 86_400_000;
  if (!spanDays) return null;
  const perWeek = (dates.length / spanDays) * 7;
  if (perWeek >= 6) return "Daily";
  if (perWeek >= 3) return `${Math.round(perWeek)}x per week`;
  if (perWeek >= 1) return `${Math.round(perWeek)}x per week`;
  return "Less than weekly";
}

function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\wÀ-ɏ]+/g) ?? [];
  return [...new Set(matches)].slice(0, 10);
}

// ── Content theme + sentiment helpers ───────────────────────────────────────

const SERVICE_KEYWORDS = [
  "plumbing", "electrical", "cleaning", "landscaping", "roofing", "painting",
  "renovation", "construction", "hvac", "design", "photography", "marketing",
  "accounting", "legal", "consulting", "training", "coaching", "therapy",
  "dental", "medical", "fitness", "catering", "delivery", "repair", "security",
  "pest", "solar", "insurance", "real estate", "property", "finance",
];

function extractContentThemes(texts: string[]): string[] {
  const combined = texts.join(" ").toLowerCase();

  // Top hashtags (already extracted, but include top ones as themes)
  const hashtagMatches = combined.match(/#[\w]+/g) ?? [];
  const hashtagCounts: Record<string, number> = {};
  for (const tag of hashtagMatches) {
    hashtagCounts[tag] = (hashtagCounts[tag] ?? 0) + 1;
  }
  const topHashtagThemes = Object.entries(hashtagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([tag]) => tag.replace("#", ""));

  // Service/product keyword matches
  const keywordThemes = SERVICE_KEYWORDS.filter((kw) => combined.includes(kw));

  const all = [...new Set([...topHashtagThemes, ...keywordThemes])];
  return all.slice(0, 8);
}

const POSITIVE_WORDS = ["great", "love", "amazing", "excellent", "best", "recommend", "fantastic", "helpful", "professional", "quick"];
const NEGATIVE_WORDS = ["bad", "worst", "terrible", "slow", "rude", "disappointed", "awful", "unprofessional", "scam", "avoid"];

function calcSentiment(texts: string[]): string | null {
  if (!texts.length) return null;
  const combined = texts.join(" ").toLowerCase();
  const words = combined.split(/\W+/);
  let pos = 0;
  let neg = 0;
  for (const w of words) {
    if (POSITIVE_WORDS.includes(w)) pos++;
    if (NEGATIVE_WORDS.includes(w)) neg++;
  }
  if (pos + neg < 2) return null;
  if (pos > neg) return "positive";
  if (neg > pos) return "negative";
  return "neutral";
}

// ── Platform scrapers ────────────────────────────────────────────────────────

async function scrapeInstagram(url: string): Promise<SocialInsight> {
  const handle = extractHandle(url);
  const profileUrl = normaliseHandle(handle, "instagram");

  const raw = await runApifyActor("apify/instagram-scraper", {
    directUrls: [profileUrl],
    resultsType: "posts",
    resultsLimit: 12,
  }) as Array<Record<string, unknown>>;

  const profile = raw?.[0] as Record<string, unknown> | undefined;
  const followers = (profile?.followersCount as number) ?? null;
  const posts = raw.length;

  const likes = raw.map((p) => (p.likesCount as number) ?? 0);
  const comments = raw.map((p) => (p.commentsCount as number) ?? 0);
  const avgLikes = likes.length ? Math.round(likes.reduce((a, b) => a + b, 0) / likes.length) : null;
  const avgComments = comments.length ? Math.round(comments.reduce((a, b) => a + b, 0) / comments.length) : null;

  const captions = raw.map((p) => (p.caption as string) ?? "").filter(Boolean);
  const allText = captions.join(" ");
  const topHashtags = extractHashtags(allText);
  const recentCaption = captions[0]?.slice(0, 200) ?? null;

  return {
    platform: "instagram",
    handle,
    profileUrl,
    followers,
    following: (profile?.followingCount as number) ?? null,
    posts: (profile?.postsCount as number) ?? posts,
    avgLikes,
    avgComments,
    engagementRate: avgLikes !== null && avgComments !== null && followers
      ? calcEngagement(avgLikes, avgComments, followers)
      : null,
    topHashtags,
    contentThemes: extractContentThemes(captions),
    audienceSentiment: calcSentiment(captions),
    postingFrequency: estimateFrequency(raw as never),
    recentCaption,
    scrapedAt: new Date().toISOString(),
    raw,
  };
}

async function scrapeTiktok(url: string): Promise<SocialInsight> {
  const handle = extractHandle(url);
  const profileUrl = normaliseHandle(handle, "tiktok");

  const raw = await runApifyActor("clockworks/tiktok-profile-scraper", {
    profiles: [handle],
    resultsPerPage: 12,
  }) as Array<Record<string, unknown>>;

  const profile = raw?.[0] as Record<string, unknown> | undefined;
  const videos = (profile?.videos as Array<Record<string, unknown>>) ?? [];
  const followers = (profile?.followerCount as number) ?? null;

  const likes = videos.map((v) => (v.diggCount as number) ?? 0);
  const comments = videos.map((v) => (v.commentCount as number) ?? 0);
  const avgLikes = likes.length ? Math.round(likes.reduce((a, b) => a + b, 0) / likes.length) : null;
  const avgComments = comments.length ? Math.round(comments.reduce((a, b) => a + b, 0) / comments.length) : null;

  const captions = videos.map((v) => (v.text as string) ?? "").filter(Boolean);
  const allText = captions.join(" ");
  const topHashtags = extractHashtags(allText);

  return {
    platform: "tiktok",
    handle,
    profileUrl,
    followers,
    following: (profile?.followingCount as number) ?? null,
    posts: videos.length,
    avgLikes,
    avgComments,
    engagementRate: avgLikes !== null && avgComments !== null && followers
      ? calcEngagement(avgLikes, avgComments, followers)
      : null,
    topHashtags,
    contentThemes: extractContentThemes(captions),
    audienceSentiment: calcSentiment(captions),
    postingFrequency: estimateFrequency(videos as never),
    recentCaption: captions[0]?.slice(0, 200) ?? null,
    scrapedAt: new Date().toISOString(),
    raw,
  };
}

async function scrapeFacebook(url: string): Promise<SocialInsight> {
  const handle = extractHandle(url);
  const profileUrl = normaliseHandle(handle, "facebook");

  const raw = await runApifyActor("apify/facebook-pages-scraper", {
    startUrls: [{ url: profileUrl }],
    maxPosts: 10,
  }) as Array<Record<string, unknown>>;

  const page = raw?.[0] as Record<string, unknown> | undefined;
  const posts = ((page?.posts as Array<Record<string, unknown>>) ?? []);
  const followers = (page?.likes as number) ?? (page?.followers as number) ?? null;

  const likes = posts.map((p) => (p.likes as number) ?? 0);
  const comments = posts.map((p) => (p.comments as number) ?? 0);
  const avgLikes = likes.length ? Math.round(likes.reduce((a, b) => a + b, 0) / likes.length) : null;
  const avgComments = comments.length ? Math.round(comments.reduce((a, b) => a + b, 0) / comments.length) : null;

  const captions = posts.map((p) => (p.text as string) ?? "").filter(Boolean);
  const topHashtags = extractHashtags(captions.join(" "));

  return {
    platform: "facebook",
    handle,
    profileUrl,
    followers,
    following: null,
    posts: posts.length,
    avgLikes,
    avgComments,
    engagementRate: avgLikes !== null && avgComments !== null && followers
      ? calcEngagement(avgLikes, avgComments, followers)
      : null,
    topHashtags,
    contentThemes: extractContentThemes(captions),
    audienceSentiment: calcSentiment(captions),
    postingFrequency: estimateFrequency(posts as never),
    recentCaption: captions[0]?.slice(0, 200) ?? null,
    scrapedAt: new Date().toISOString(),
    raw,
  };
}

async function scrapeX(url: string): Promise<SocialInsight> {
  const handle = extractHandle(url);
  const profileUrl = normaliseHandle(handle, "x");

  // apidojo/tweet-scraper replaces the deprecated quacker/twitter-scraper
  const raw = await runApifyActor("apidojo/tweet-scraper", {
    startUrls: [{ url: `https://twitter.com/${handle}` }],
    maxTweets: 20,
  }) as Array<Record<string, unknown>>;

  const profile = raw?.[0] as Record<string, unknown> | undefined;
  const authorData = (profile?.author as Record<string, unknown>) ?? (profile?.user as Record<string, unknown>) ?? {};
  const followers = (authorData?.followers as number) ?? (authorData?.followers_count as number) ?? null;
  const tweets = raw;

  const likes = tweets.map((t) => (t.favorite_count as number) ?? (t.likeCount as number) ?? 0);
  const comments = tweets.map((t) => (t.replyCount as number) ?? (t.reply_count as number) ?? 0);
  const avgLikes = likes.length ? Math.round(likes.reduce((a, b) => a + b, 0) / likes.length) : null;
  const avgComments = comments.length ? Math.round(comments.reduce((a, b) => a + b, 0) / comments.length) : null;

  const captions = tweets.map((t) => (t.full_text as string) ?? (t.text as string) ?? "").filter(Boolean);
  const topHashtags = extractHashtags(captions.join(" "));

  return {
    platform: "x",
    handle,
    profileUrl,
    followers,
    following: null,
    posts: tweets.length,
    avgLikes,
    avgComments,
    engagementRate: avgLikes !== null && avgComments !== null && followers
      ? calcEngagement(avgLikes, avgComments, followers)
      : null,
    topHashtags,
    contentThemes: extractContentThemes(captions),
    audienceSentiment: calcSentiment(captions),
    postingFrequency: estimateFrequency(tweets as never),
    recentCaption: captions[0]?.slice(0, 200) ?? null,
    scrapedAt: new Date().toISOString(),
    raw,
  };
}

async function scrapeYoutube(url: string): Promise<SocialInsight> {
  const handle = extractHandle(url);
  const profileUrl = normaliseHandle(handle, "youtube");
  const apiKey = (process.env.YOUTUBE_DATA_API_KEY ?? "").trim();

  if (!apiKey) {
    throw new Error("YOUTUBE_DATA_API_KEY not configured");
  }

  // Step 1: resolve channel ID from handle/name
  let channelId: string | null = null;
  try {
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(handle)}&type=channel&maxResults=1&key=${apiKey}`,
      { signal: AbortSignal.timeout(15_000) }
    );
    if (searchRes.ok) {
      const searchData = await searchRes.json() as { items?: Array<{ id?: { channelId?: string } }> };
      channelId = searchData.items?.[0]?.id?.channelId ?? null;
    }
  } catch {
    // channel lookup failed; videos will be empty
  }

  // Step 2: fetch recent videos
  type YTVideoItem = {
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      description?: string;
      publishedAt?: string;
      channelTitle?: string;
    };
    statistics?: {
      likeCount?: string;
      commentCount?: string;
      viewCount?: string;
    };
  };

  let videos: YTVideoItem[] = [];
  let followers: number | null = null;

  if (channelId) {
    try {
      const vidRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=10&type=video&order=date&key=${apiKey}`,
        { signal: AbortSignal.timeout(15_000) }
      );
      if (vidRes.ok) {
        const vidData = await vidRes.json() as { items?: YTVideoItem[] };
        videos = vidData.items ?? [];
      }

      // Fetch channel stats for subscriber count
      const chanRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${apiKey}`,
        { signal: AbortSignal.timeout(15_000) }
      );
      if (chanRes.ok) {
        const chanData = await chanRes.json() as {
          items?: Array<{ statistics?: { subscriberCount?: string } }>;
        };
        const subCount = chanData.items?.[0]?.statistics?.subscriberCount;
        if (subCount) followers = parseInt(subCount, 10);
      }
    } catch {
      // ignore
    }
  }

  const titles = videos.map((v) => v.snippet?.title ?? "").filter(Boolean);
  const descriptions = videos.map((v) => v.snippet?.description ?? "").filter(Boolean);
  const allText = [...titles, ...descriptions].join(" ");

  const likes = videos.map((v) => parseInt(v.statistics?.likeCount ?? "0", 10));
  const comments = videos.map((v) => parseInt(v.statistics?.commentCount ?? "0", 10));
  const avgLikes = likes.length ? Math.round(likes.reduce((a, b) => a + b, 0) / likes.length) : null;
  const avgComments = comments.length ? Math.round(comments.reduce((a, b) => a + b, 0) / comments.length) : null;

  const topHashtags = extractHashtags(allText);
  const postTimestamps = videos.map((v) => ({ timestamp: v.snippet?.publishedAt }));

  return {
    platform: "youtube",
    handle,
    profileUrl,
    followers,
    following: null,
    posts: videos.length,
    avgLikes,
    avgComments,
    engagementRate: avgLikes !== null && avgComments !== null && followers
      ? calcEngagement(avgLikes, avgComments, followers)
      : null,
    topHashtags,
    contentThemes: extractContentThemes([...titles, ...descriptions]),
    audienceSentiment: calcSentiment([...titles, ...descriptions]),
    postingFrequency: estimateFrequency(postTimestamps as never),
    recentCaption: titles[0]?.slice(0, 200) ?? null,
    scrapedAt: new Date().toISOString(),
    raw: videos,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface SocialLinks {
  instagram?: string | null;
  tiktok?: string | null;
  facebook?: string | null;
  x?: string | null;
  youtube?: string | null;
  primary_social_handle?: string | null;
}

export async function scrapeSocialProfiles(links: SocialLinks): Promise<SocialScraperResult> {
  const jobs: Array<{ platform: string; fn: () => Promise<SocialInsight> }> = [];

  // Resolve URLs, using primary_social_handle as fallback for missing platforms
  const instagramUrl = links.instagram ?? fallbackUrlFromPrimaryHandle(links.primary_social_handle, "instagram");
  const tiktokUrl = links.tiktok ?? fallbackUrlFromPrimaryHandle(links.primary_social_handle, "tiktok");
  const facebookUrl = links.facebook ?? fallbackUrlFromPrimaryHandle(links.primary_social_handle, "facebook");
  const xUrl = links.x ?? fallbackUrlFromPrimaryHandle(links.primary_social_handle, "x");
  const youtubeUrl = links.youtube ?? fallbackUrlFromPrimaryHandle(links.primary_social_handle, "youtube");

  if (instagramUrl) jobs.push({ platform: "instagram", fn: () => scrapeInstagram(instagramUrl) });
  if (tiktokUrl)    jobs.push({ platform: "tiktok",    fn: () => scrapeTiktok(tiktokUrl) });
  if (facebookUrl)  jobs.push({ platform: "facebook",  fn: () => scrapeFacebook(facebookUrl) });
  if (xUrl)         jobs.push({ platform: "x",         fn: () => scrapeX(xUrl) });
  if (youtubeUrl)   jobs.push({ platform: "youtube",   fn: () => scrapeYoutube(youtubeUrl) });

  const insights: SocialInsight[] = [];
  const errors: Array<{ platform: string; error: string }> = [];

  await Promise.allSettled(
    jobs.map(async ({ platform, fn }) => {
      try {
        insights.push(await fn());
      } catch (e) {
        errors.push({ platform, error: e instanceof Error ? e.message : String(e) });
      }
    })
  );

  return { ok: insights.length > 0, insights, errors };
}

export function formatInsightsForBlueprint(insights: SocialInsight[]): string {
  if (!insights.length) return "";

  const lines: string[] = ["### Social Media Intelligence"];
  for (const ins of insights) {
    lines.push(`\n**${ins.platform.charAt(0).toUpperCase() + ins.platform.slice(1)}** (${ins.handle})`);
    if (ins.followers !== null) lines.push(`- Followers: ${ins.followers.toLocaleString()}`);
    if (ins.engagementRate !== null) lines.push(`- Engagement rate: ${ins.engagementRate}%`);
    if (ins.postingFrequency) lines.push(`- Posting frequency: ${ins.postingFrequency}`);
    if (ins.topHashtags.length) lines.push(`- Top hashtags: ${ins.topHashtags.slice(0, 5).join(", ")}`);
    if (ins.contentThemes.length) lines.push(`- Content themes: ${ins.contentThemes.slice(0, 3).join(", ")}`);
    if (ins.recentCaption) lines.push(`- Recent content: "${ins.recentCaption.slice(0, 100)}…"`);
  }

  const totalFollowers = insights.reduce((s, i) => s + (i.followers ?? 0), 0);
  const avgEng = insights.filter((i) => i.engagementRate !== null);
  const avgEngRate = avgEng.length
    ? (avgEng.reduce((s, i) => s + i.engagementRate!, 0) / avgEng.length).toFixed(2)
    : null;

  lines.push(`\n**Combined reach:** ${totalFollowers.toLocaleString()} followers across ${insights.length} platform(s)`);
  if (avgEngRate) lines.push(`**Average engagement:** ${avgEngRate}%`);

  return lines.join("\n");
}
