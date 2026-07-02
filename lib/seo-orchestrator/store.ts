import type { Sql } from "postgres";
import { connectCrmDb } from "../crm/db";
import { ensureSeoSchema } from "./schema";

// All engine state lives in the app DB (Supabase, via the postgres driver).
// withSeoDb opens the shared CRM pool, ensures the SEO schema, then runs fn.
// Returns null if the DB is unreachable (callers degrade gracefully).
export async function withSeoDb<T>(fn: (db: Sql) => Promise<T>): Promise<T | null> {
  const db = await connectCrmDb();
  if (!db) return null;
  await ensureSeoSchema(db);
  return fn(db);
}

export type SeoEvent = {
  ts: string;
  agent: string;
  task: string;
  status: string;
  progress: number;
  meta: Record<string, unknown>;
};
export type PipelinePiece = {
  piece_id: string;
  title: string;
  status: string;
  pillar: string | null;
  owner_next: string | null;
  platform_targets: string[];
  scheduled_publish: string | null;
  created_at: string;
};
export type Handoff = {
  id: string;
  created_at: string;
  job: string | null;
  item: string;
  status: string;
  meta: Record<string, unknown>;
};

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v ?? ""));

export async function appendEvent(
  db: Sql,
  e: { agent: string; task: string; status: string; progress?: number; meta?: Record<string, unknown> },
): Promise<void> {
  await db`
    insert into public.seo_events (agent, task, status, progress, meta)
    values (${e.agent}, ${e.task}, ${e.status}, ${e.progress ?? 0}, ${db.json((e.meta ?? {}) as Parameters<typeof db.json>[0])})
  `;
}

export async function recentEvents(db: Sql, limit = 50): Promise<SeoEvent[]> {
  const rows = await db`
    select ts, agent, task, status, progress, meta
    from public.seo_events order by ts desc limit ${limit}
  `;
  return rows.map((r) => ({
    ts: iso(r.ts),
    agent: String(r.agent),
    task: String(r.task),
    status: String(r.status),
    progress: Number(r.progress ?? 0),
    meta: (r.meta ?? {}) as Record<string, unknown>,
  }));
}

export async function existingKeywords(db: Sql): Promise<Set<string>> {
  const rows = await db`select keyword from public.seo_keyword_queue`;
  return new Set(rows.map((r) => String(r.keyword).toLowerCase()));
}

export async function addKeywords(db: Sql, kws: { keyword: string; pillar: string }[]): Promise<number> {
  let added = 0;
  for (const k of kws) {
    const res = await db`
      insert into public.seo_keyword_queue (keyword, pillar, status)
      values (${k.keyword}, ${k.pillar}, 'candidate')
      on conflict do nothing
    `;
    added += res.count;
  }
  return added;
}

export async function keywordsForOutline(db: Sql, limit = 5): Promise<{ keyword: string; pillar: string | null }[]> {
  const rows = await db`
    select keyword, pillar from public.seo_keyword_queue
    where status in ('approved', 'candidate')
    order by (status = 'approved') desc, surfaced_at asc
    limit ${limit}
  `;
  return rows.map((r) => ({ keyword: String(r.keyword), pillar: r.pillar ? String(r.pillar) : null }));
}

export async function upsertPipeline(
  db: Sql,
  p: {
    piece_id: string;
    title: string;
    status: string;
    pillar?: string | null;
    owner_next?: string | null;
    platform_targets?: string[];
    scheduled_publish?: string | null;
  },
): Promise<void> {
  await db`
    insert into public.seo_pipeline (piece_id, title, status, pillar, owner_next, platform_targets, scheduled_publish)
    values (${p.piece_id}, ${p.title}, ${p.status}, ${p.pillar ?? null}, ${p.owner_next ?? null},
            ${p.platform_targets ?? []}, ${p.scheduled_publish ?? null})
    on conflict (piece_id) do update set
      title = excluded.title,
      status = excluded.status,
      owner_next = excluded.owner_next,
      platform_targets = excluded.platform_targets,
      scheduled_publish = excluded.scheduled_publish,
      updated_at = now()
  `;
}

export async function pieceStatus(db: Sql, status: string): Promise<PipelinePiece[]> {
  const rows = await db`
    select piece_id, title, status, pillar, owner_next, platform_targets, scheduled_publish, created_at
    from public.seo_pipeline where status = ${status} order by created_at asc
  `;
  return rows.map(mapPiece);
}

export async function listPipeline(db: Sql): Promise<PipelinePiece[]> {
  const rows = await db`
    select piece_id, title, status, pillar, owner_next, platform_targets, scheduled_publish, created_at
    from public.seo_pipeline order by created_at desc limit 50
  `;
  return rows.map(mapPiece);
}

function mapPiece(r: Record<string, unknown>): PipelinePiece {
  return {
    piece_id: String(r.piece_id),
    title: String(r.title),
    status: String(r.status),
    pillar: r.pillar ? String(r.pillar) : null,
    owner_next: r.owner_next ? String(r.owner_next) : null,
    platform_targets: Array.isArray(r.platform_targets) ? (r.platform_targets as string[]) : [],
    scheduled_publish: r.scheduled_publish ? String(r.scheduled_publish) : null,
    created_at: iso(r.created_at),
  };
}

export async function createHandoff(
  db: Sql,
  h: { job?: string | null; item: string; meta?: Record<string, unknown> },
): Promise<void> {
  await db`
    insert into public.seo_handoffs (to_party, job, item, meta)
    values ('cowork', ${h.job ?? null}, ${h.item}, ${db.json((h.meta ?? {}) as Parameters<typeof db.json>[0])})
  `;
}

export async function listHandoffs(db: Sql, status = "ready"): Promise<Handoff[]> {
  const rows = await db`
    select id, created_at, job, item, status, meta from public.seo_handoffs
    where status = ${status} order by created_at desc limit 50
  `;
  return rows.map((r) => ({
    id: String(r.id),
    created_at: iso(r.created_at),
    job: r.job ? String(r.job) : null,
    item: String(r.item),
    status: String(r.status),
    meta: (r.meta ?? {}) as Record<string, unknown>,
  }));
}
