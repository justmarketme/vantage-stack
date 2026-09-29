import type { Sql } from "postgres";
import type { z } from "zod";
import type { Goal, GoalInput, GoalMetric, GoalPatch } from "../../types";

interface GoalRow {
  id: string;
  title: string;
  metric: GoalMetric;
  target: number | null;
  progress: number | null;
  due_on: string | null;
  color: Goal["color"];
  x: number;
  y: number;
  done: boolean;
}

export function toGoal(r: GoalRow): Goal {
  return {
    id: r.id,
    title: r.title,
    metric: r.metric,
    target: r.target,
    progress: r.progress,
    dueOn: r.due_on,
    color: r.color,
    x: r.x,
    y: r.y,
    done: r.done,
  };
}

const COLS = (sql: Sql) =>
  sql`id, title, metric, target, progress, due_on::text AS due_on, color, x, y, done`;

export async function listGoals(sql: Sql, clinicId: string): Promise<Goal[]> {
  const rows = await sql<GoalRow[]>`
    SELECT ${COLS(sql)} FROM clinic_crm.goals WHERE clinic_id = ${clinicId} ORDER BY created_at`;
  return rows.map(toGoal);
}

export async function createGoal(sql: Sql, clinicId: string, g: z.infer<typeof GoalInput>): Promise<Goal> {
  const [r] = await sql<GoalRow[]>`
    INSERT INTO clinic_crm.goals (clinic_id, title, metric, target, due_on, color, x, y)
    VALUES (${clinicId}, ${g.title}, ${g.metric}, ${g.target}, ${g.dueOn}, ${g.color}, ${g.x}, ${g.y})
    RETURNING ${COLS(sql)}`;
  return toGoal(r);
}

export async function updateGoal(sql: Sql, clinicId: string, id: string, p: z.infer<typeof GoalPatch>): Promise<Goal | null> {
  const set: Record<string, unknown> = {};
  if (p.title !== undefined) set.title = p.title;
  if (p.metric !== undefined) set.metric = p.metric;
  if (p.target !== undefined) set.target = p.target;
  if (p.dueOn !== undefined) set.due_on = p.dueOn;
  if (p.color !== undefined) set.color = p.color;
  if (p.x !== undefined) set.x = p.x;
  if (p.y !== undefined) set.y = p.y;
  if (p.done !== undefined) set.done = p.done;
  if (p.progress !== undefined) set.progress = p.progress;
  if (Object.keys(set).length === 0) {
    const [r] = await sql<GoalRow[]>`SELECT ${COLS(sql)} FROM clinic_crm.goals WHERE clinic_id = ${clinicId} AND id = ${id}`;
    return r ? toGoal(r) : null;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [r] = await sql<GoalRow[]>`
    UPDATE clinic_crm.goals SET ${sql(set as any, ...Object.keys(set))}
     WHERE clinic_id = ${clinicId} AND id = ${id}
    RETURNING ${COLS(sql)}`;
  return r ? toGoal(r) : null;
}

export async function deleteGoal(sql: Sql, clinicId: string, id: string): Promise<boolean> {
  const rows = await sql`DELETE FROM clinic_crm.goals WHERE clinic_id = ${clinicId} AND id = ${id} RETURNING id`;
  return rows.length > 0;
}
