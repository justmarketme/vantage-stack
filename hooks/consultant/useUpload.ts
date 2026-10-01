"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiClientError } from "../../lib/consultant/client/api";
import { prepareUpload, putWithProgress, UPLOAD_MESSAGES } from "../../lib/consultant/client/upload";
import type { UploadPurpose } from "../../lib/consultant/types";

/**
 * Upload a Why Board image or a proof of payment to private storage.
 *
 *   const up = useUpload();
 *   const path = await up.upload(file, "goal_image");   // → save as GoalInput.imagePath
 *   <progress value={up.progress} />                     // 0..1
 *
 * Steps: shrink images in a canvas (≤1600px, WebP/JPEG, EXIF + GPS stripped)
 * → request an `UploadTicket` → PUT the bytes to the signed URL with progress.
 * Resolves with the storage `path`, or null when cancelled. Errors are
 * user-safe `ApiClientError`s (also exposed as `error`). Needs a connection:
 * uploads are never queued offline (the signed URL would expire).
 */
export interface UseUploadResult {
  upload: (file: Blob, purpose: UploadPurpose) => Promise<string | null>;
  /** 0..1 while sending (preparing the image counts as 0). */
  progress: number;
  uploading: boolean;
  error: string | null;
  cancel: () => void;
  reset: () => void;
}

export function useUpload(): UseUploadResult {
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      ctrl.current?.abort();
    };
  }, []);

  const cancel = useCallback(() => ctrl.current?.abort(), []);
  const reset = useCallback(() => {
    setProgress(0);
    setError(null);
  }, []);

  const upload = useCallback(async (file: Blob, purpose: UploadPurpose) => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setUploading(true);
    setProgress(0);
    setError(null);
    // Progress updates are throttled to whole percents so a fast upload
    // doesn't trigger hundreds of renders.
    let lastPct = -1;
    const onProgress = (f: number) => {
      const pct = Math.floor(f * 100);
      if (pct === lastPct || !mounted.current || c.signal.aborted) return;
      lastPct = pct;
      setProgress(pct / 100);
    };
    try {
      const { body, request } = await prepareUpload(file, purpose);
      if (c.signal.aborted) return null;
      const ticket = await api.uploads.ticket(request, { signal: c.signal });
      await putWithProgress(ticket.uploadUrl, body, request.contentType, onProgress, c.signal);
      return ticket.path;
    } catch (e) {
      if (c.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) return null;
      const msg = e instanceof ApiClientError ? e.error : UPLOAD_MESSAGES.failed;
      if (mounted.current) setError(msg);
      throw e instanceof ApiClientError ? e : new ApiClientError(0, msg);
    } finally {
      if (mounted.current && ctrl.current === c) setUploading(false);
      if (ctrl.current === c) ctrl.current = null;
    }
  }, []);

  return { upload, progress, uploading, error, cancel, reset };
}
