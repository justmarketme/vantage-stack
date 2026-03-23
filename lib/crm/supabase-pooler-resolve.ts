import postgres from "postgres";

/**
 * Supabase direct host `db.<ref>.supabase.co` is often IPv6-only. Node on Windows
 * may return getaddrinfo ENOTFOUND. Session pooler hosts (aws-0-<region>.pooler.supabase.com)
 * resolve over IPv4. See: https://supabase.com/docs/guides/database/connecting-to-postgres
 */

const DIRECT_DB_HOST = /^db\.([^.]+)\.supabase\.co$/i;

/** Regions used by Supabase shared pooler (expand if your project is elsewhere). */
const POOLER_REGIONS = [
  "eu-central-1",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-north-1",
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "ap-south-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "ap-northeast-2",
  "ca-central-1",
  "sa-east-1",
  "af-south-1",
  "me-central-1",
];

export function parseDirectSupabaseDbHost(hostname: string): string | null {
  const m = hostname.trim().match(DIRECT_DB_HOST);
  return m?.[1] ?? null;
}

/** Build session-pooler URL from a direct Supabase DATABASE_URL. */
export function rewriteDirectSupabaseToSessionPooler(urlString: string, ref: string, region: string): string {
  const u = new URL(urlString);
  u.hostname = `aws-0-${region}.pooler.supabase.com`;
  if (!u.port || u.port === "5432") u.port = "5432";

  const user = decodeURIComponent(u.username || "");
  const ulow = user.toLowerCase();
  if (!user || ulow === "postgres") {
    u.username = `postgres.${ref}`;
  } else if (!ulow.startsWith("postgres.")) {
    u.username = `postgres.${ref}`;
  }

  return u.toString();
}

function supabaseProjectRefFromAppUrl(): string | null {
  const raw = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  if (!raw) return null;
  try {
    const h = new URL(raw).hostname.toLowerCase();
    const m = h.match(/^([^.]+)\.supabase\.co$/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

async function trySessionPooler(
  baseUrl: URL,
  ref: string,
  region: string,
  connectTimeout: number,
): Promise<boolean> {
  const conn = rewriteDirectSupabaseToSessionPooler(baseUrl.toString(), ref, region);
  const sql = postgres(conn, {
    max: 1,
    prepare: false,
    connect_timeout: connectTimeout,
    idle_timeout: 2,
  });
  try {
    await sql`select 1 as _pooler_probe`;
    return true;
  } catch {
    return false;
  } finally {
    try {
      await sql.end({ timeout: 3 });
    } catch {
      /* ignore */
    }
  }
}

/** Probe all shared pooler regions in parallel (one correct region per project; wall time ~ connect timeout). */
async function detectPoolerRegion(baseUrl: URL, ref: string): Promise<string | null> {
  const timeout = 10;
  const hits = await Promise.all(
    POOLER_REGIONS.map(async (region) => ((await trySessionPooler(baseUrl, ref, region, timeout)) ? region : null)),
  );
  return hits.find((r) => r !== null) ?? null;
}

/**
 * If DATABASE_URL targets direct `db.<ref>.supabase.co`, rewrite to session pooler for IPv4.
 * Optional `SUPABASE_POOLER_REGION` skips probing. Set `SUPABASE_DISABLE_AUTO_POOLER=1` to disable.
 */
export async function resolveSupabaseDatabaseUrlForNode(urlString: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return urlString;
  }

  const ref = parseDirectSupabaseDbHost(parsed.hostname);
  if (!ref) return urlString;

  if (process.env.SUPABASE_DISABLE_AUTO_POOLER === "1") {
    return urlString;
  }

  const explicit = (process.env.SUPABASE_POOLER_REGION || "").trim();
  if (explicit) {
    return rewriteDirectSupabaseToSessionPooler(urlString, ref, explicit);
  }

  const appRef = supabaseProjectRefFromAppUrl();
  if (appRef && appRef.toLowerCase() !== ref.toLowerCase()) {
    return urlString;
  }

  if (process.env.NODE_ENV === "development") {
    console.info(
      "[crm/db] Direct Supabase DB host detected; resolving session pooler (IPv4). Set SUPABASE_POOLER_REGION to skip probing.",
    );
  }

  const region = await detectPoolerRegion(parsed, ref);
  if (!region) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[crm/db] Could not auto-detect pooler region. Set SUPABASE_POOLER_REGION in .env.local (see Supabase → Database → Connection pooling).",
      );
    }
    return urlString;
  }

  if (process.env.NODE_ENV === "development") {
    console.info(`[crm/db] Using Supabase session pooler (region ${region}).`);
  }

  return rewriteDirectSupabaseToSessionPooler(urlString, ref, region);
}
