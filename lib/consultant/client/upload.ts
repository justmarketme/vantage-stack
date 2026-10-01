/**
 * File uploads to private Supabase Storage via short-lived signed URLs.
 *
 * Flow (SPEC-WAVE2): `POST /api/consultant/uploads` → `UploadTicket`
 * { path, uploadUrl, expiresAt } → the browser PUTs the bytes straight to
 * `uploadUrl` → the caller saves `path` on the goal / payment. The bucket is
 * private; nothing is ever public.
 *
 * Images are downscaled in a canvas first (longest side ≤ 1600px, re-encoded
 * as WebP when the browser can, else JPEG). A 4 MB phone photo becomes
 * ~200–400 KB — a big deal on 3G — and re-encoding also strips EXIF metadata,
 * including the GPS location phones embed in photos (POPIA data minimisation).
 *
 * The signed URL contains a token: it is never logged, stored or put in an
 * error message.
 */

import { ApiClientError } from "./api";
import type { UploadPurpose, UploadRequest } from "../types";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // mirrors UploadRequest.bytes max
export const MAX_IMAGE_EDGE = 1600;
export const IMAGE_QUALITY = 0.82;

export type UploadContentType = UploadRequest["contentType"];
const ALLOWED: readonly UploadContentType[] = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export const UPLOAD_MESSAGES = {
  type: "That file type isn't supported. Use a JPG, PNG, WebP photo or a PDF.",
  size: "That file is too large (5 MB maximum).",
  decode: "We couldn't read that image. Try a JPG or PNG.",
  failed: "The upload didn't finish. Check your signal and try again.",
  expired: "The upload link expired. Try again.",
} as const;

/** Largest size that fits inside `max`×`max`, keeping the aspect ratio; never upscales. */
export function fitWithin(width: number, height: number, max = MAX_IMAGE_EDGE): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function isImageType(type: string): boolean {
  return /^image\//.test(type);
}

export function isAllowedUploadType(type: string): type is UploadContentType {
  return (ALLOWED as readonly string[]).includes(type);
}

type Drawable = { width: number; height: number; close?: () => void };

async function decodeImage(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  // createImageBitmap honours EXIF orientation with this option (portrait phone photos stay upright).
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
      return { source: bmp, width: bmp.width, height: bmp.height, release: () => (bmp as Drawable).close?.() };
    } catch {
      /* fall back to <img> (older Safari) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), type, quality);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Downscale + re-encode an image for upload. Browser-only (needs a canvas).
 * Returns WebP when supported (a browser that can't encode WebP hands back a
 * PNG, which we detect and replace with JPEG). PDFs and non-images are
 * returned unchanged.
 */
export async function prepareImage(file: Blob, opts: { maxEdge?: number; quality?: number } = {}): Promise<Blob> {
  if (!isImageType(file.type)) return file;
  if (typeof document === "undefined") return file;
  const maxEdge = opts.maxEdge ?? MAX_IMAGE_EDGE;
  const quality = opts.quality ?? IMAGE_QUALITY;
  let decoded: Awaited<ReturnType<typeof decodeImage>>;
  try {
    decoded = await decodeImage(file);
  } catch {
    throw new ApiClientError(422, UPLOAD_MESSAGES.decode);
  }
  try {
    const size = fitWithin(decoded.width, decoded.height, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // Transparent PNGs would turn black as JPEG — paint white first.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(decoded.source, 0, 0, size.width, size.height);
    let out = await canvasToBlob(canvas, "image/webp", quality);
    if (!out || out.type !== "image/webp") out = await canvasToBlob(canvas, "image/jpeg", quality);
    if (!out) return file;
    // Already small and a supported type? Keep whichever is smaller.
    const untouched = decoded.width <= maxEdge && decoded.height <= maxEdge && isAllowedUploadType(file.type);
    return untouched && file.size <= out.size ? file : out;
  } finally {
    decoded.release();
  }
}

/**
 * PUT bytes to a signed URL with progress (XHR — fetch has no upload progress).
 * Rejects with ApiClientError: status 0 for network loss, the HTTP status otherwise.
 */
export function putWithProgress(
  url: string,
  body: Blob,
  contentType: string,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof XMLHttpRequest === "undefined") {
      reject(new ApiClientError(0, UPLOAD_MESSAGES.failed));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress?.(Math.min(1, e.loaded / e.total));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
      } else {
        const expired = xhr.status === 400 || xhr.status === 401 || xhr.status === 403;
        reject(new ApiClientError(xhr.status, expired ? UPLOAD_MESSAGES.expired : UPLOAD_MESSAGES.failed));
      }
    };
    xhr.onerror = () => reject(new ApiClientError(0, UPLOAD_MESSAGES.failed));
    xhr.ontimeout = () => reject(new ApiClientError(408, UPLOAD_MESSAGES.failed));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.timeout = 120_000;
    xhr.send(body);
  });
}

export type PreparedUpload = { body: Blob; request: UploadRequest };

/** Validate + (for images) shrink a file and build the ticket request. */
export async function prepareUpload(file: Blob, purpose: UploadPurpose): Promise<PreparedUpload> {
  const body = await prepareImage(file);
  const type = body.type;
  if (!isAllowedUploadType(type)) throw new ApiClientError(422, UPLOAD_MESSAGES.type);
  if (body.size > MAX_UPLOAD_BYTES) throw new ApiClientError(413, UPLOAD_MESSAGES.size);
  if (body.size < 1) throw new ApiClientError(422, UPLOAD_MESSAGES.type);
  return { body, request: { purpose, contentType: type, bytes: body.size } };
}
