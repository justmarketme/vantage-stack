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

async function runApifyActor(actorId: string, input: Record<string, unknown>): Promise<unknown> {
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
    contentThemes: [],
    audienceSentiment: null,
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
    contentThemes: [],
    audienceSentiment: null,
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
    contentThemes: [],
    audienceSentiment: null,
    postingFrequency: estimateFrequency(posts as never),
    recentCaption: captions[0]?.slice(0, 200) ?? null,
    scrapedAt: new Date().toISOString(),
    raw,
  };
}

async function scrapeX(url: string): Promise<SocialInsight> {
  const handle = extractHandle(url);
  const profileUrl = normaliseHandle(handle, "x");

  const raw = await runApifyActor("quacker/twitter-scraper", {
    handle,
    tweetsDesired: 12,
  }) as Array<Record<string, unknown>>;

  const profile = raw?.[0] as Record<string, unknown> | undefined;
  const followers = (profile?.author as Record<string, unknown>)?.followers as number ?? null;
  const tweets = raw;

  const likes = tweets.map((t) => (t.likeCount as number) ?? 0);
  const comments = tweets.map((t) => (t.replyCount as number) ?? 0);
  const avgLikes = likes.length ? Math.round(likes.reduce((a, b) => a + b, 0) / likes.length) : null;
  const avgComments = comments.length ? Math.round(comments.reduce((a, b) => a + b, 0) / comments.length) : null;

  const captions = tweets.map((t) => (t.text as string) ?? "").filter(Boolean);
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
    contentThemes: [],
    audienceSentiment: null,
    postingFrequency: estimateFrequency(tweets as never),
    recentCaption: captions[0]?.slice(0, 200) ?? null,
    scrapedAt: new Date().toISOString(),
    raw,
  };
}

async function scrapeYoutube(url: string): Promise<SocialInsight> {
  const handle = extractHandle(url);
  const profileUrl = normaliseHandle(handle, "youtube");

  const raw = await runApifyActor("apify/youtube-scraper", {
    startUrls: [{ url: profileUrl }],
    maxResults: 10,
  }) as Array<Record<string, unknown>>;

  const channel = raw?.[0] as Record<string, unknown> | undefined;
  const videos = ((channel?.videos as Array<Record<string, unknown>>) ?? raw);
  const followers = (channel?.numberOfSubscribers as number) ?? null;

  const likes = videos.map((v) => (v.likes as number) ?? 0);
  const comments = videos.map((v) => (v.commentsCount as number) ?? 0);
  const avgLikes = likes.length ? Math.round(likes.reduce((a, b) => a + b, 0) / likes.length) : null;
  const avgComments = comments.length ? Math.round(comments.reduce((a, b) => a + b, 0) / comments.length) : null;

  const titles = videos.map((v) => (v.title as string) ?? "").filter(Boolean);
  const topHashtags = extractHashtags(titles.join(" "));

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
    contentThemes: titles.slice(0, 5),
    audienceSentiment: null,
    postingFrequency: estimateFrequency(videos as never),
    recentCaption: titles[0]?.slice(0, 200) ?? null,
    scrapedAt: new Date().toISOString(),
    raw,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface SocialLinks {
  instagram?: string | null;
  tiktok?: string | null;
  facebook?: string | null;
  x?: string | null;
  youtube?: string | null;
}

export async function scrapeSocialProfiles(links: SocialLinks): Promise<SocialScraperResult> {
  const jobs: Array<{ platform: string; fn: () => Promise<SocialInsight> }> = [];

  if (links.instagram) jobs.push({ platform: "instagram", fn: () => scrapeInstagram(links.instagram!) });
  if (links.tiktok)    jobs.push({ platform: "tiktok",    fn: () => scrapeTiktok(links.tiktok!) });
  if (links.facebook)  jobs.push({ platform: "facebook",  fn: () => scrapeFacebook(links.facebook!) });
  if (links.x)         jobs.push({ platform: "x",         fn: () => scrapeX(links.x!) });
  if (links.youtube)   jobs.push({ platform: "youtube",   fn: () => scrapeYoutube(links.youtube!) });

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
