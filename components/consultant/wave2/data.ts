"use client";

/**
 * Wave-2 data glue for the Consultant Portal screens.
 *
 * Screens use Agent 2's hooks (`hooks/consultant/use*.ts`) directly. This file
 * only holds what those don't cover: Emma message history for a lead, and the
 * upload `accept` lists for file pickers. Not persisted to disk — message
 * metadata is personal data (POPIA: minimise what sits on a shared phone).
 */

import { api, type DeadLetter, type TeamFunnelMetrics } from "../../../lib/consultant/client/api";
import { invalidateQueries, useQuery } from "../../../hooks/consultant/useQuery";
import type { EmmaMessage, UploadRequest } from "../../../lib/consultant/types";

export type { DeadLetter, TeamFunnelMetrics };
export { invalidateQueries };

/** Content types the upload endpoint accepts (mirrors `UploadRequest.contentType`). */
export const UPLOAD_TYPES: readonly UploadRequest["contentType"][] = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const IMAGE_TYPES: readonly UploadRequest["contentType"][] = ["image/jpeg", "image/png", "image/webp"];

export const useLeadMessages = (leadId: string, enabled = true) =>
  useQuery<EmmaMessage[]>(enabled ? `messages:${leadId}` : null, () => api.messages.list(leadId), { refreshMs: 60_000 });
