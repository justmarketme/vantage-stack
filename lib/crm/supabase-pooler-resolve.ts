import postgres from "postgres";

/**
 * Supabase direct host `db.<ref>.supabase.co` is often IPv6-only. Node on Windows
 * may return getaddrinfo ENOTFOUND. Session pooler hosts (aws-0-<region>.pooler.supabase.com)
 * resolve over IPv4. See: https://supabase.com/docs/guides/database/connecting-to-postgres
 */

const DIRECT_DB_HOST = /^db\.([^.]+)\.supabase\.co$/i;

/**
 * Order: common regions first (incl. Africa/EU/US) so parallel probes succeed faster.
 * Add regions if Supabase adds data centers.
 */
const POOLER_REGIONS = [
  "af-south-1",
  "eu-central-1",
  "eu-west-1",
  "eu-west-2",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-south-1",
  "us-east-1",
  "us-east-2",
  "eu-west-3",
  "eu-north-1",
  "us-west-1",
  "us-west-2",
  "ap-northeast-1",
  "ap-northeast-2",
  "ca-central-1",
  "sa-east-1",
  "me-central-1",
  "ap-southeast-3",
  "eu-south-1",
  "il-central-1",
];

export function parseDirectSupabaseDbHost(hostname: string): string | null {
  const m = hostname.trim().match(DIRECT_DB_HOST);
  return m?.[1] ?? null;
}

/** Parsed pieces for pooler (avoids broken URL round-trips when password has @, #, etc.). */
export function parseSupabasePgUrl(urlString: string): {
  password: string;
  database: string;
  userRaw: string;
  search: string;
} | null {
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    return null;
  }
  const path = (u.pathname || "/postgres").replace(/^\//, "");
  const database = path || "postgres";
  return {
    userRaw: decodeURIComponent(u.username || ""),
    password: decodeURIComponent(u.password || ""),
    database,
    search: u.search || "",
  };
}

function poolerUser(ref: string, userRaw: string): string {
  const ulow = userRaw.toLowerCase();
  if (!userRaw || ulow === "postgres" || !ulow.startsWith("postgres.")) {
    return `postgres.${ref}`;
  }
  return userRaw;
}

function mergeSearchWithSsl(search: string): string {
  const sp = new URLSearchParams(search.replace(/^\?/, ""));
  if (!sp.has("sslmode")) sp.set("sslmode", "require");
  const q = sp.toString();
  return q ? `?${q}` : "?sslmode=require";
}

/** Build session-pooler URL from a direct Supabase DATABASE_URL. */
export function rewriteDirectSupabaseToSessionPooler(
  urlString: string,
  ref: string,
  region: string,
  hostPrefix: "aws-0" | "aws-1" = "aws-0",
): string {
  const parts = parseSupabasePgUrl(urlString);
  if (!parts) return urlString;

  const user = poolerUser(ref, parts.userRaw);
  const host = `${hostPrefix}-${region}.pooler.supabase.com`;

  const u = new URL("postgresql://x:y@placeholder.supabase.com:5432/postgres");
  u.hostname = host;
  u.port = "5432";
  u.username = user;
  u.password = parts.password;
  u.pathname = `/${parts.database}`;
  u.search = mergeSearchWithSsl(parts.search);
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
  parts: NonNullable<ReturnType<typeof parseSupabasePgUrl>>,
  ref: string,
  region: string,
  connectTimeout: number,
): Promise<"aws-0" | "aws-1" | null> {
  const user = poolerUser(ref, parts.userRaw);

  for (const prefix of ["aws-0", "aws-1"] as const) {
    const host = `${prefix}-${region}.pooler.supabase.com`;
    const sql = postgres({
      host,
      port: 5432,
      database: parts.database,
      user,
      password: parts.password,
      ssl: "require",
      max: 1,
      prepare: false,
      connect_timeout: connectTimeout,
      idle_timeout: 2,
    });
    try {
      await sql`select 1 as _pooler_probe`;
      return prefix;
    } catch {
      /* try next prefix or region */
    } finally {
      try {
        await sql.end({ timeout: 3 });
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

type PoolerHit = { region: string; hostPrefix: "aws-0" | "aws-1" };

/** Probe pooler regions in small batches (avoids too many parallel TCP attempts). */
async function detectPoolerRegion(
  ref: string,
  parts: NonNullable<ReturnType<typeof parseSupabasePgUrl>>,
): Promise<PoolerHit | null> {
  const timeout = 20;
  const batchSize = 5;
  for (let i = 0; i < POOLER_REGIONS.length; i += batchSize) {
    const batch = POOLER_REGIONS.slice(i, i + batchSize);
    const hits = await Promise.all(
      batch.map(async (region) => {
        const prefix = await trySessionPooler(parts, ref, region, timeout);
        return prefix ? { region, hostPrefix: prefix } : null;
      }),
    );
    const ok = hits.find((h): h is PoolerHit => h !== null);
    if (ok) return ok;
  }
  return null;
}

/**
 * If DATABASE_URL targets direct `db.<ref>.supabase.co`, rewrite to session pooler for IPv4.
 * Optional `SUPABASE_POOLER_REGION` skips probing. Set `SUPABASE_DISABLE_AUTO_POOLER=1` to disable.
 * Prefer pasting the Session pooler URI as `SUPABASE_DATABASE_POOLER_URL` in .env.local (see db.ts).
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
    const pfx = ((process.env.SUPABASE_POOLER_HOST_PREFIX || "aws-0").trim() as "aws-0" | "aws-1") || "aws-0";
    const hostPrefix = pfx === "aws-1" ? "aws-1" : "aws-0";
    return rewriteDirectSupabaseToSessionPooler(urlString, ref, explicit, hostPrefix);
  }

  const appRef = supabaseProjectRefFromAppUrl();
  if (appRef && appRef.toLowerCase() !== ref.toLowerCase()) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `[crm/db] DATABASE_URL project ref (${ref}) differs from NEXT_PUBLIC_SUPABASE_URL (${appRef}); still trying session pooler for DATABASE_URL.`,
      );
    }
  }

  const parts = parseSupabasePgUrl(urlString);
  if (!parts) return urlString;

  if (process.env.NODE_ENV === "development") {
    console.info(
      "[crm/db] Direct Supabase DB host detected; resolving session pooler (IPv4). Set SUPABASE_POOLER_REGION or SUPABASE_DATABASE_POOLER_URL to skip probing.",
    );
  }

  const hit = await detectPoolerRegion(ref, parts);
  if (!hit) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[crm/db] Could not auto-detect pooler region. Set SUPABASE_POOLER_REGION or paste Session pooler URI as SUPABASE_DATABASE_POOLER_URL (Supabase → Database → Connection pooling).",
      );
    }
    return urlString;
  }

  if (process.env.NODE_ENV === "development") {
    console.info(`[crm/db] Using Supabase session pooler (${hit.hostPrefix}, ${hit.region}).`);
  }

  return rewriteDirectSupabaseToSessionPooler(urlString, ref, hit.region, hit.hostPrefix);
}
