/**
 * Creates / reconciles the Consultant Portal's private Storage bucket (Why Board images,
 * proof of payment) through the Supabase Storage REST API, then checks that no Storage RLS
 * policy exposes it.
 *
 *   npm run consultant:storage
 *
 * Idempotent: creates the bucket when absent, otherwise PUTs the same settings back (so a
 * bucket someone flipped to public, or whose limits drifted, is corrected). Settings:
 *   - public: false                     (no unauthenticated /object/public/** URLs)
 *   - file_size_limit = cfg.storage.maxBytes
 *   - allowed_mime_types = the UploadRequest content types (lib/consultant/types.ts)
 *
 * WHY ACCESS CONTROL IS APP-SIDE, NOT `auth.uid()` RLS POLICIES
 * The app does not use Supabase Auth: consultants sign in with our own JWT session cookie
 * (lib/admin/session*), so inside Postgres `auth.uid()` is always null and a policy cannot tell
 * one consultant from another. Instead the bucket has NO policies for anon/authenticated at all
 * (RLS on storage.objects denies by default); only the service-role key — server-side, never
 * sent to the browser — can touch it. Every upload and view goes through our API, which checks
 * the session and ownership first and then issues a short-lived signed URL
 * (cfg.storage.signedUrlTtlSec) for exactly one object path.
 *
 * Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (the project or staging-branch values), and
 * optionally DATABASE_URL / SUPABASE_DATABASE_POOLER_URL for the policy check. Never prints
 * keys, URLs with credentials, or object names.
 */
import { consultantConfig } from "../lib/consultant/config";
import { connectCrmDb, getCrmDbUrl } from "../lib/crm/db";
import { UploadRequest } from "../lib/consultant/types";

type BucketSettings = {
  public: boolean;
  file_size_limit: number;
  allowed_mime_types: string[];
};

const TAG = "[consultant:storage]";

function fail(msg: string): never {
  console.error(`${TAG} ${msg}`);
  process.exit(1);
}

async function storageFetch(base: string, key: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${base}/storage/v1${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init.headers },
  });
}

async function ensureBucket(base: string, key: string, bucket: string, settings: BucketSettings): Promise<"created" | "updated"> {
  const existing = await storageFetch(base, key, `/bucket/${encodeURIComponent(bucket)}`);
  if (existing.ok) {
    const put = await storageFetch(base, key, `/bucket/${encodeURIComponent(bucket)}`, {
      method: "PUT",
      body: JSON.stringify(settings),
    });
    if (!put.ok) fail(`update bucket failed: HTTP ${put.status}`);
    return "updated";
  }
  // Storage answers a missing bucket with 400 or 404 depending on version.
  if (existing.status !== 400 && existing.status !== 404) fail(`read bucket failed: HTTP ${existing.status}`);
  const post = await storageFetch(base, key, "/bucket", {
    method: "POST",
    body: JSON.stringify({ id: bucket, name: bucket, ...settings }),
  });
  if (!post.ok) fail(`create bucket failed: HTTP ${post.status}`);
  return "created";
}

async function verifyBucket(base: string, key: string, bucket: string, settings: BucketSettings): Promise<void> {
  const res = await storageFetch(base, key, `/bucket/${encodeURIComponent(bucket)}`);
  if (!res.ok) fail(`re-read bucket failed: HTTP ${res.status}`);
  const b = (await res.json()) as Partial<BucketSettings>;
  if (b.public !== false) fail("bucket is PUBLIC after setup — refusing to continue");
  if (b.file_size_limit !== settings.file_size_limit) fail(`file_size_limit is ${b.file_size_limit}, expected ${settings.file_size_limit}`);
  const mimes = [...(b.allowed_mime_types ?? [])].sort().join(",");
  if (mimes !== [...settings.allowed_mime_types].sort().join(",")) fail(`allowed_mime_types drifted: ${mimes}`);
}

/**
 * Lists Storage RLS policies that could let a non-service role reach this bucket: any policy on
 * storage.objects for anon / authenticated / public that either names this bucket or does not
 * filter on bucket_id at all (which would apply to every bucket). Skipped when no DB URL.
 */
async function riskyPolicies(bucket: string): Promise<string[] | null> {
  if (!getCrmDbUrl()) return null;
  const db = await connectCrmDb();
  if (!db) return null;
  const rows = await db<{ policyname: string; roles: string[]; expr: string }[]>`
    select policyname::text, roles::text[] as roles,
           coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'`;
  return rows
    .filter((r) => r.roles.some((role) => ["anon", "authenticated", "public"].includes(role)))
    .filter((r) => r.expr.includes(`'${bucket}'`) || !r.expr.includes("bucket_id"))
    .map((r) => `${r.policyname} (${r.roles.join(", ")})`);
}

async function main() {
  const cfg = consultantConfig();
  const base = cfg.storage.supabaseUrl.replace(/\/+$/, "");
  const key = cfg.storage.serviceRoleKey;
  if (!base || !key) fail("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (.env.local).");

  const bucket = cfg.storage.bucket;
  const settings: BucketSettings = {
    public: false,
    file_size_limit: cfg.storage.maxBytes,
    allowed_mime_types: [...UploadRequest.shape.contentType.options],
  };

  console.log(`${TAG} project ${new URL(base).hostname}  bucket "${bucket}"`);
  const outcome = await ensureBucket(base, key, bucket, settings);
  await verifyBucket(base, key, bucket, settings);
  console.log(`${TAG} bucket ${outcome}: private, limit ${settings.file_size_limit} bytes, types ${settings.allowed_mime_types.join(", ")}`);

  const risky = await riskyPolicies(bucket);
  if (risky === null) {
    console.log(`${TAG} policy check skipped (no DATABASE_URL). Check storage.objects policies in the dashboard.`);
  } else if (risky.length > 0) {
    fail(`storage.objects has policies that may expose "${bucket}" to anon/authenticated: ${risky.join("; ")}`);
  } else {
    console.log(`${TAG} no anon/authenticated/public policies reach "${bucket}" — service role only.`);
  }
  process.exit(0);
}

main().catch((err: unknown) => {
  // Message only — never the stack with env-derived values.
  fail(err instanceof Error ? err.message : "unexpected error");
});
