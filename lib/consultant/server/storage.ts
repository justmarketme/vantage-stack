import { randomUUID } from "node:crypto";
import { consultantConfig } from "../config";
import type { UploadPurpose, UploadRequest, UploadTicket } from "../types";
import { errorTag } from "./http";

/**
 * Private Supabase Storage (Why Board images, proof of payment, training clips) over the
 * Storage REST API with the service-role key — server only. The bucket is private with no
 * RLS policies: the ONLY way in or out is a short-lived signed URL issued here after the app's
 * own session check (the portal doesn't use Supabase Auth, so storage policies can't identify
 * consultants).
 *
 *   upload ticket: POST {url}/storage/v1/object/upload/sign/{bucket}/{path} → { url: "/object/upload/sign/…?token=…" }
 *                  (the browser then PUTs the file to that URL; valid ~2 hours, single path)
 *   view URL:      POST {url}/storage/v1/object/sign/{bucket}/{path} { expiresIn } → { signedURL }
 *   delete:        DELETE {url}/storage/v1/object/{bucket} { prefixes: [path] }
 *
 * Paths are `<purpose>/<ownerId>/<uuid>.<ext>`. Anything a client later submits as an
 * `imagePath` / `proofPath` is re-checked with `isOwnedPath` so a consultant can't attach
 * someone else's object (or a crafted path) to their record.
 * Size and MIME are enforced twice: by `UploadRequest` + `cfg.storage.maxBytes` here, and by the
 * bucket's own file-size / allowed-MIME limits (set by scripts/consultant-storage-setup.ts).
 */

export class StorageError extends Error {
  constructor(readonly kind: "not_configured" | "too_large" | "bad_type" | "upstream") {
    super(`storage_${kind}`);
    this.name = "StorageError";
  }
}

/** Supabase's signed upload URLs are valid for two hours (fixed by the Storage API). */
const UPLOAD_URL_TTL_SEC = 2 * 60 * 60;
const REQUEST_TIMEOUT_MS = 8_000;

const EXT: Record<UploadRequest["contentType"], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** Which content types each purpose accepts. A Why Board image can't be a PDF. */
const ALLOWED: Record<UploadPurpose, readonly UploadRequest["contentType"][]> = {
  goal_image: ["image/jpeg", "image/png", "image/webp"],
  payment_proof: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
};

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export function ownerPrefix(purpose: UploadPurpose, ownerId: string): string {
  return `${purpose}/${ownerId.toLowerCase()}/`;
}

/**
 * True only for a path this app could have issued to `ownerId` for `purpose`: exact shape
 * `<purpose>/<ownerId>/<uuid>.<ext>` — no `..`, no extra segments, no other owner. Pure.
 */
export function isOwnedPath(path: unknown, purpose: UploadPurpose, ownerId: string | null): path is string {
  if (typeof path !== "string" || !ownerId) return false;
  const exts = [...new Set(ALLOWED[purpose].map((t) => EXT[t]))].join("|");
  const re = new RegExp(`^${purpose}/${ownerId.toLowerCase().replace(/[^0-9a-f-]/g, "")}/${UUID}\\.(${exts})$`);
  return re.test(path);
}

export function buildObjectPath(purpose: UploadPurpose, ownerId: string, contentType: UploadRequest["contentType"], id: string = randomUUID()): string {
  return `${ownerPrefix(purpose, ownerId)}${id}.${EXT[contentType]}`;
}

function base(): { url: string; key: string; bucket: string } {
  const s = consultantConfig().storage;
  if (!s.supabaseUrl || !s.serviceRoleKey) throw new StorageError("not_configured");
  return { url: `${s.supabaseUrl.replace(/\/+$/, "")}/storage/v1`, key: s.serviceRoleKey, bucket: s.bucket };
}

export function storageConfigured(): boolean {
  const s = consultantConfig().storage;
  return !!(s.supabaseUrl && s.serviceRoleKey);
}

function encPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function call(url: string, key: string, init: { method: string; body?: unknown }): Promise<Response> {
  try {
    return await fetch(url, {
      method: init.method,
      headers: {
        authorization: `Bearer ${key}`,
        apikey: key,
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new StorageError("upstream");
  }
}

/** A signed, single-path upload URL. Throws StorageError for size/type/config/upstream problems. */
export async function createUploadTicket(
  purpose: UploadPurpose,
  contentType: UploadRequest["contentType"],
  bytes: number,
  ownerId: string,
): Promise<UploadTicket> {
  const cfg = consultantConfig().storage;
  if (!Number.isFinite(bytes) || bytes < 1 || bytes > cfg.maxBytes) throw new StorageError("too_large");
  if (!ALLOWED[purpose].includes(contentType)) throw new StorageError("bad_type");
  const b = base();
  const path = buildObjectPath(purpose, ownerId, contentType);
  const res = await call(`${b.url}/object/upload/sign/${encodeURIComponent(b.bucket)}/${encPath(path)}`, b.key, { method: "POST" });
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new StorageError("upstream");
  }
  const j = (await res.json()) as { url?: unknown };
  if (typeof j.url !== "string" || !j.url.includes("token=")) throw new StorageError("upstream");
  return {
    path,
    uploadUrl: `${b.url}${j.url.startsWith("/") ? "" : "/"}${j.url}`,
    expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SEC * 1000).toISOString(),
  };
}

/**
 * A short-lived (cfg.storage.signedUrlTtlSec) URL to view a private object, or null when storage
 * isn't configured or the object can't be signed (e.g. it was never uploaded). Never throws —
 * callers render "no image" rather than failing the whole response.
 */
export async function signedViewUrl(path: string): Promise<string | null> {
  if (!path || path.includes("..")) return null;
  try {
    const b = base();
    const ttl = consultantConfig().storage.signedUrlTtlSec;
    const res = await call(`${b.url}/object/sign/${encodeURIComponent(b.bucket)}/${encPath(path)}`, b.key, {
      method: "POST",
      body: { expiresIn: ttl },
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return null;
    }
    const j = (await res.json()) as { signedURL?: unknown; signedUrl?: unknown };
    const rel = typeof j.signedURL === "string" ? j.signedURL : typeof j.signedUrl === "string" ? j.signedUrl : null;
    if (!rel) return null;
    return /^https?:\/\//.test(rel) ? rel : `${b.url}${rel.startsWith("/") ? "" : "/"}${rel}`;
  } catch (e) {
    if (!(e instanceof StorageError)) console.warn("[consultant] storage sign failed", errorTag(e));
    return null;
  }
}

/** Delete one object. Best effort: returns false on failure (never throws). */
export async function deleteObject(path: string): Promise<boolean> {
  if (!path || path.includes("..")) return false;
  try {
    const b = base();
    const res = await call(`${b.url}/object/${encodeURIComponent(b.bucket)}`, b.key, {
      method: "DELETE",
      body: { prefixes: [path] },
    });
    await res.body?.cancel().catch(() => undefined);
    return res.ok;
  } catch {
    return false;
  }
}
