import type { Sql } from "postgres";
import type { ConsultantSession } from "../../auth/session";
import { consultantConfig } from "../../config";
import { calculate } from "../../metrics/calculator";
import {
  GOAL_METRICS,
  type CalculatorInput,
  type CalculatorResult,
  type Goal,
  type GoalInput,
  type GoalMetric,
  type GoalPatch,
} from "../../types";
import { sastDateKey } from "../calendar/sast";
import { MESSAGES } from "../constants";
import { fail, isUuid } from "../http";
import { auditSafe, kick } from "../sideEffects";
import { deleteObject, isOwnedPath, signedViewUrl } from "../storage";
import { iso } from "../util";
import { workingDaysUntil } from "../workingDays";
import { metricValue } from "./metrics";
import { writerId } from "./scope";

/**
 * Why Board goals. Owner CRUD; managers read any consultant's board (Decision 4).
 *
 * - currentValue: 3A's `metricValue` from the goal's creation to now (progress "since I set it").
 * - progress: min(1, current ÷ target).
 * - dailyPlan: 3A's `calculate()` for what is STILL needed (target − current) over the SA working
 *   days from today (SAST) to the target date, using the consultant's own recent rates where
 *   there's enough data, otherwise the config defaults. Only money/deal goals have a calculator
 *   plan (the calculator works from deals); activity goals (dials, connects, meetings held) and
 *   achieved or past-due goals have `dailyPlan: null`.
 * - imageUrl: a short-lived signed URL; the stored path is re-validated as the owner's.
 */

type Session = Pick<ConsultantSession, "memberId" | "isManager">;

// TODO(contract-request 3B-CR-3): move into cfg (rates window + minimum samples) and cfg.messages.
export const GOALS = {
  /** Look-back window for a consultant's "actual" rates. */
  ratesLookbackDays: 90,
  /** Minimum samples before an actual rate replaces the default. */
  minDialsForConnectRate: 50,
  minConnectsForCloseRate: 30,
  minPaidForAvgSale: 3,
  messages: {
    notFound: "Goal not found.",
    ownerOnly: "Only the consultant who set this goal can change it.",
    notYourBoard: "You can only view your own Why Board.",
    badImage: "Upload the image again, then save.",
    pastDate: "Choose a target date from today onwards.",
  },
} as const;

type GoalRow = {
  id: string;
  consultant_id: string;
  consultant_name: string;
  title: string;
  why: string;
  target_date: Date | string;
  metric: string;
  target_value: number;
  image_path: string | null;
  created_at: Date | string;
  updated_at: Date | string | null;
};

export type Rates = Pick<CalculatorInput, "avgSale" | "closeFromConnects" | "connectRate" | "commissionRate">;

const CALC_TYPE: Partial<Record<GoalMetric, CalculatorInput["goalType"]>> = {
  commission: "commission",
  revenue: "revenue",
  deals_paid: "deals",
};

function clampRate(x: number): number {
  return Math.min(1, Math.max(0.001, x));
}

/** Pure: actual rates when the sample is big enough, else the defaults. */
export function ratesFrom(
  actual: { dials: number; connects: number; paid: number; revenue: number },
  defaults: Rates,
): Rates {
  return {
    connectRate: actual.dials >= GOALS.minDialsForConnectRate ? clampRate(actual.connects / actual.dials) : defaults.connectRate,
    closeFromConnects:
      actual.connects >= GOALS.minConnectsForCloseRate && actual.paid > 0 ? clampRate(actual.paid / actual.connects) : defaults.closeFromConnects,
    avgSale: actual.paid >= GOALS.minPaidForAvgSale ? Math.max(1, Math.round(actual.revenue / actual.paid)) : defaults.avgSale,
    commissionRate: defaults.commissionRate,
  };
}

export function defaultRates(): Rates {
  const cfg = consultantConfig();
  return {
    connectRate: clampRate(cfg.metrics.defaultConnectRate),
    closeFromConnects: clampRate(cfg.gamificationDefaults.closeTargetFromConnects),
    avgSale: Math.max(1, cfg.metrics.defaultAvgSale),
    commissionRate: cfg.commission.rate,
  };
}

/** Pure: the per-working-day plan for what's left, or null when there's no plan to show. */
export function dailyPlanFor(
  metric: GoalMetric,
  remaining: number,
  workingDays: number,
  rates: Rates,
): CalculatorResult | null {
  const goalType = CALC_TYPE[metric];
  if (!goalType || remaining <= 0 || workingDays < 1) return null;
  if (goalType === "commission" && !(rates.commissionRate > 0)) return null;
  try {
    return calculate({ goalType, goalValue: Math.ceil(remaining), workingDays, ...rates });
  } catch {
    return null;
  }
}

async function actualRates(db: Sql, consultantId: string, now: Date): Promise<Rates> {
  const from = new Date(now.getTime() - GOALS.ratesLookbackDays * 86_400_000).toISOString();
  const to = now.toISOString();
  const [dials, connects, paid, revenue] = await Promise.all([
    metricValue(db, consultantId, "dials", from, to),
    metricValue(db, consultantId, "connects", from, to),
    metricValue(db, consultantId, "deals_paid", from, to),
    metricValue(db, consultantId, "revenue", from, to),
  ]);
  return ratesFrom({ dials, connects, paid, revenue }, defaultRates());
}

function dateKey(v: Date | string): string {
  if (v instanceof Date) {
    // `date` columns come back as a Date at UTC midnight of that calendar day.
    return v.toISOString().slice(0, 10);
  }
  return String(v).slice(0, 10);
}

async function toGoals(db: Sql, rows: GoalRow[], now: Date): Promise<Goal[]> {
  const ratesByConsultant = new Map<string, Promise<Rates>>();
  const ratesFor = (id: string) => {
    let p = ratesByConsultant.get(id);
    if (!p) {
      p = actualRates(db, id, now);
      ratesByConsultant.set(id, p);
    }
    return p;
  };
  return Promise.all(
    rows.map(async (r) => {
      const metric = (GOAL_METRICS as readonly string[]).includes(r.metric) ? (r.metric as GoalMetric) : "revenue";
      const target = Number(r.target_value);
      const createdAt = iso(r.created_at)!;
      const current = await metricValue(db, r.consultant_id, metric, createdAt, now.toISOString());
      const targetDate = dateKey(r.target_date);
      const remaining = Math.max(0, target - current);
      const plan = CALC_TYPE[metric] && remaining > 0 ? dailyPlanFor(metric, remaining, workingDaysUntil(targetDate, now), await ratesFor(r.consultant_id)) : null;
      return {
        id: r.id,
        consultantId: r.consultant_id,
        consultantName: r.consultant_name,
        title: r.title,
        why: r.why,
        targetDate,
        metric,
        targetValue: target,
        currentValue: current,
        progress: target > 0 ? Math.min(1, Math.max(0, current / target)) : 0,
        dailyPlan: plan,
        imageUrl: r.image_path ? await signedViewUrl(r.image_path) : null,
        createdAt,
        updatedAt: iso(r.updated_at),
      } satisfies Goal;
    }),
  );
}

function goalSelect(db: Sql) {
  return db`
    select g.id::text, g.consultant_id::text, coalesce(nullif(m.full_name, ''), m.username)::text as consultant_name,
      g.title, g.why, g.target_date, g.metric, g.target_value, g.image_path, g.created_at, g.updated_at
    from public.consultant_goals g join public.team_members m on m.id = g.consultant_id
  `;
}

/** GET goals?consultantId= — own board by default; managers may read anyone's. */
export async function listGoals(db: Sql, s: Session, consultantId: string | null, now: Date = new Date()): Promise<Goal[]> {
  let target = s.memberId;
  if (consultantId && consultantId.toLowerCase() !== s.memberId) {
    if (!s.isManager) fail(403, GOALS.messages.notYourBoard);
    if (!isUuid(consultantId)) fail(404, MESSAGES.notFound);
    target = consultantId.toLowerCase();
  }
  if (!target) return [];
  const rows = await db<GoalRow[]>`
    ${goalSelect(db)} where g.consultant_id = ${target}::uuid
    order by g.target_date asc, g.created_at asc
  `;
  return toGoals(db, rows, now);
}

async function getGoal(db: Sql, id: string, now: Date): Promise<Goal | null> {
  const rows = await db<GoalRow[]>`${goalSelect(db)} where g.id = ${id}::uuid`;
  return rows[0] ? (await toGoals(db, rows, now))[0] : null;
}

function checkImage(path: string | null | undefined, memberId: string): void {
  if (path && !isOwnedPath(path, "goal_image", memberId)) fail(400, MESSAGES.badRequest, { imagePath: GOALS.messages.badImage });
}

function checkDate(key: string, now: Date): void {
  const d = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== key) fail(400, MESSAGES.badRequest, { targetDate: "Use YYYY-MM-DD" });
  if (key < sastDateKey(now)) fail(400, MESSAGES.badRequest, { targetDate: GOALS.messages.pastDate });
}

export async function createGoal(db: Sql, s: Session, input: GoalInput, now: Date = new Date()): Promise<Goal> {
  const memberId = writerId(s);
  checkDate(input.targetDate, now);
  checkImage(input.imagePath, memberId);
  const rows = await db<{ id: string }[]>`
    insert into public.consultant_goals (consultant_id, title, why, target_date, metric, target_value, image_path)
    values (${memberId}::uuid, ${input.title}, ${input.why}, ${input.targetDate}::date, ${input.metric},
      ${input.targetValue}, ${input.imagePath ?? null})
    returning id::text
  `;
  kick();
  await auditSafe(db, { actorId: memberId, actorKind: "member", action: "goal.create", entity: "goal", entityId: rows[0].id, meta: { metric: input.metric } });
  return (await getGoal(db, rows[0].id, now))!;
}

async function ownGoal(db: Sql, s: Session, id: string): Promise<{ memberId: string; imagePath: string | null }> {
  const memberId = writerId(s);
  const rows = await db<{ consultant_id: string; image_path: string | null }[]>`
    select consultant_id::text, image_path from public.consultant_goals where id = ${id}::uuid
  `;
  const g = rows[0];
  // Hide other consultants' goals entirely from non-managers (404, not 403).
  if (!g || (!s.isManager && g.consultant_id !== memberId)) fail(404, GOALS.messages.notFound);
  if (g.consultant_id !== memberId) fail(403, GOALS.messages.ownerOnly);
  return { memberId, imagePath: g.image_path };
}

export async function patchGoal(db: Sql, s: Session, id: string, patch: GoalPatch, now: Date = new Date()): Promise<Goal> {
  const { memberId, imagePath } = await ownGoal(db, s, id);
  const updates: Record<string, unknown> = {};
  if (patch.title !== undefined) updates.title = patch.title;
  if (patch.why !== undefined) updates.why = patch.why;
  if (patch.targetDate !== undefined) {
    checkDate(patch.targetDate, now);
    updates.target_date = patch.targetDate;
  }
  if (patch.metric !== undefined) updates.metric = patch.metric;
  if (patch.targetValue !== undefined) updates.target_value = patch.targetValue;
  if (patch.imagePath !== undefined) {
    checkImage(patch.imagePath, memberId);
    updates.image_path = patch.imagePath;
  }
  if (Object.keys(updates).length) {
    updates.updated_at = now;
    await db`update public.consultant_goals set ${db(updates)} where id = ${id}::uuid`;
  }
  // Replaced or removed image: delete the old object (best effort) so nothing lingers.
  if (patch.imagePath !== undefined && imagePath && imagePath !== patch.imagePath) await deleteObject(imagePath);
  kick();
  await auditSafe(db, { actorId: memberId, actorKind: "member", action: "goal.update", entity: "goal", entityId: id, meta: { fields: Object.keys(updates).length } });
  return (await getGoal(db, id, now))!;
}

export async function deleteGoal(db: Sql, s: Session, id: string): Promise<void> {
  const { memberId, imagePath } = await ownGoal(db, s, id);
  await db`delete from public.consultant_goals where id = ${id}::uuid`;
  if (imagePath) await deleteObject(imagePath);
  kick();
  await auditSafe(db, { actorId: memberId, actorKind: "member", action: "goal.delete", entity: "goal", entityId: id });
}
