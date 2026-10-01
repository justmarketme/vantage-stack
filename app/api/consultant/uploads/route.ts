import { rateLimit } from "@/lib/consultant/auth/rateLimit";
import { MESSAGES } from "@/lib/consultant/server/constants";
import { fail, json, parseBody } from "@/lib/consultant/server/http";
import { writerId } from "@/lib/consultant/server/repo/scope";
import { consultantRoute } from "@/lib/consultant/server/route";
import { auditSafe } from "@/lib/consultant/server/sideEffects";
import { createUploadTicket, StorageError } from "@/lib/consultant/server/storage";
import { UploadRequest, type UploadTicket } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TODO(contract-request 3B-CR-3): cfg.limits.uploadsPerMinute + cfg.messages.
const UPLOADS_PER_MINUTE = 20;
const UPLOAD_MESSAGES = {
  tooLarge: "That file is too large.",
  badType: "That file type isn't allowed here.",
  unavailable: "Uploads aren't available right now. Please try again.",
  forbidden: "You don't have permission to upload this.",
} as const;

/**
 * A signed upload URL into the private bucket, at `<purpose>/<memberId>/<uuid>.<ext>`.
 * `payment_proof` needs `confirm_payments`. The browser PUTs the file straight to Storage; the
 * returned `path` is then sent with the goal / payment, where the server re-checks ownership.
 */
export async function POST(req: Request) {
  return consultantRoute("uploads.create", undefined, async (s, db) => {
    const input = await parseBody(req, UploadRequest);
    const memberId = writerId(s);
    if (input.purpose === "payment_proof" && !s.permissions.includes("confirm_payments")) fail(403, UPLOAD_MESSAGES.forbidden);
    if (!rateLimit(`consultant-upload:${memberId}`, UPLOADS_PER_MINUTE, 60_000)) fail(429, MESSAGES.rateLimited);
    let ticket: UploadTicket;
    try {
      ticket = await createUploadTicket(input.purpose, input.contentType, input.bytes, memberId);
    } catch (e) {
      if (e instanceof StorageError) {
        if (e.kind === "too_large") fail(400, MESSAGES.badRequest, { bytes: UPLOAD_MESSAGES.tooLarge });
        if (e.kind === "bad_type") fail(400, MESSAGES.badRequest, { contentType: UPLOAD_MESSAGES.badType });
        fail(503, UPLOAD_MESSAGES.unavailable);
      }
      throw e;
    }
    await auditSafe(db, {
      actorId: memberId,
      actorKind: "member",
      action: "upload.ticket",
      entity: "storage_object",
      meta: { purpose: input.purpose, contentType: input.contentType, bytes: input.bytes },
    });
    return json<UploadTicket>(ticket, 201);
  });
}
