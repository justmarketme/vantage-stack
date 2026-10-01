import type { Sql } from "postgres";
import type { ConsultantSession } from "../../auth/session";
import { TRAINING_MODULES } from "../../training/modules";
import type { TrainingModule } from "../../types";
import { fail } from "../http";
import { auditSafe } from "../sideEffects";
import { signedViewUrl } from "../storage";
import { iso } from "../util";
import { writerId } from "./scope";

/**
 * Sales Readiness & Training hub. Module content is static (lib/consultant/training/modules.ts);
 * progress is per consultant in `consultant_training_progress`.
 *
 * Sequential unlock is enforced HERE, not just in the UI: module n is locked until module n-1 is
 * complete, and completing a locked module is a 409. Completion is idempotent (a repeat keeps the
 * first completion time).
 */

type Session = Pick<ConsultantSession, "memberId">;

// TODO(contract-request 3B-CR-3): cfg.messages.
export const TRAINING_MESSAGES = {
  notFound: "Training module not found.",
  locked: "Finish the previous module first.",
} as const;

type ModuleDef = (typeof TRAINING_MODULES)[number];

function ordered(): ModuleDef[] {
  return [...TRAINING_MODULES].sort((a, b) => a.order - b.order);
}

/** Pure: modules + completion map → the TrainingModule list with lock state (video URL resolved later). */
export function withLocks(
  modules: readonly ModuleDef[],
  completed: ReadonlyMap<string, string>,
): (Omit<TrainingModule, "videoUrl"> & { videoPath: string | null })[] {
  const sorted = [...modules].sort((a, b) => a.order - b.order);
  return sorted.map((m, i) => ({
    id: m.id,
    order: m.order,
    title: m.title,
    summary: m.summary,
    videoPath: m.videoPath,
    durationSec: m.durationSec,
    completedAt: completed.get(m.id) ?? null,
    // Locked until EVERY earlier module is complete (not just the one before), so odd data can't skip ahead.
    locked: sorted.slice(0, i).some((prev) => !completed.has(prev.id)),
  }));
}

/** A clip path: an absolute/public path (starts with "/" or http) is served as is; anything else is a private storage object. */
async function videoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("/") || /^https:\/\//.test(path)) return path;
  return signedViewUrl(path);
}

async function completedMap(db: Sql, memberId: string | null): Promise<Map<string, string>> {
  if (!memberId) return new Map();
  const rows = await db<{ module_id: string; completed_at: Date | string }[]>`
    select module_id, completed_at from public.consultant_training_progress where consultant_id = ${memberId}::uuid
  `;
  return new Map(rows.map((r) => [r.module_id, iso(r.completed_at)!]));
}

export async function listTraining(db: Sql, s: Session): Promise<TrainingModule[]> {
  const list = withLocks(ordered(), await completedMap(db, s.memberId));
  return Promise.all(
    list.map(async ({ videoPath, ...m }) => ({ ...m, videoUrl: m.locked ? null : await videoUrl(videoPath) })),
  );
}

export async function completeModule(db: Sql, s: Session, moduleId: string): Promise<TrainingModule[]> {
  const memberId = writerId(s);
  const list = withLocks(ordered(), await completedMap(db, memberId));
  const m = list.find((x) => x.id === moduleId);
  if (!m) fail(404, TRAINING_MESSAGES.notFound);
  if (m.locked) fail(409, TRAINING_MESSAGES.locked);
  if (!m.completedAt) {
    await db`
      insert into public.consultant_training_progress (consultant_id, module_id)
      values (${memberId}::uuid, ${moduleId})
      on conflict (consultant_id, module_id) do nothing
    `;
    await auditSafe(db, { actorId: memberId, actorKind: "member", action: "training.complete", entity: "training_module", entityId: moduleId, meta: { order: m.order } });
  }
  return listTraining(db, s);
}
