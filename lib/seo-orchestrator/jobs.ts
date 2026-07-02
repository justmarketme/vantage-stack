import type { Sql } from "postgres";
import { PILLAR_SEEDS, type SeoJob } from "./config";
import {
  appendEvent,
  addKeywords,
  existingKeywords,
  keywordsForOutline,
  upsertPipeline,
  pieceStatus,
  createHandoff,
} from "./store";

export type JobResult = { status: "success" | "partial" | "failed"; summary: Record<string, unknown> };

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);

// Each job advances DB state, emits an event, and creates a Cowork handoff for
// the browser/content/analytics work Cowork owns. The heavy external steps
// (real GSC data, AI drafting, social publishing, briefing delivery) are
// explicitly delegated — never faked here.

async function keyword_research(db: Sql): Promise<JobResult> {
  await appendEvent(db, { agent: "Researcher", task: "keyword_research", status: "running", progress: 10 });
  const existing = await existingKeywords(db);
  const fresh: { keyword: string; pillar: string }[] = [];
  for (const p of PILLAR_SEEDS) {
    if (fresh.length >= 3) break; // cap 3 per run (per spec)
    const kw = p.keywords.find((k) => !existing.has(k.toLowerCase()));
    if (kw) fresh.push({ keyword: kw, pillar: p.pillar });
  }
  const added = await addKeywords(db, fresh);
  await createHandoff(db, {
    job: "keyword_research",
    item: `Validate/expand ${added} seeded keyword(s) with real GSC query-gap data, then approve the winners into the queue.`,
    meta: { seeded: fresh.map((f) => f.keyword) },
  });
  await appendEvent(db, {
    agent: "Researcher",
    task: "keyword_research",
    status: "awaiting_review",
    progress: 100,
    meta: { surfaced: fresh.map((f) => f.keyword) },
  });
  return { status: added > 0 ? "success" : "partial", summary: { added, surfaced: fresh.map((f) => f.keyword) } };
}

async function outline_generation(db: Sql): Promise<JobResult> {
  await appendEvent(db, { agent: "Builder", task: "outline_generation", status: "running", progress: 20 });
  const targets = await keywordsForOutline(db, 3);
  if (targets.length === 0) {
    await appendEvent(db, { agent: "Builder", task: "outline_generation", status: "idle_no_input", progress: 100 });
    return { status: "partial", summary: { note: "No keywords to outline — approve keywords first." } };
  }
  for (const t of targets) {
    await upsertPipeline(db, {
      piece_id: `LP-${slugify(t.keyword)}`,
      title: t.keyword,
      status: "outline",
      pillar: t.pillar,
      owner_next: "cowork (3 outline variants)",
      platform_targets: ["blog"],
    });
  }
  await createHandoff(db, {
    job: "outline_generation",
    item: `Produce 3 outline variants for ${targets.length} keyword(s); Boss man picks one to draft.`,
    meta: { keywords: targets.map((t) => t.keyword) },
  });
  await appendEvent(db, { agent: "Builder", task: "outline_generation", status: "awaiting_review", progress: 100 });
  return { status: "success", summary: { outlined: targets.map((t) => t.keyword) } };
}

async function draft_to_review(db: Sql): Promise<JobResult> {
  await appendEvent(db, { agent: "Builder", task: "draft_to_review", status: "running", progress: 30 });
  const outlines = await pieceStatus(db, "outline");
  for (const piece of outlines) {
    await upsertPipeline(db, {
      piece_id: piece.piece_id,
      title: piece.title,
      status: "review",
      owner_next: "boss_man (approve draft)",
      platform_targets: piece.platform_targets,
    });
  }
  await createHandoff(db, {
    job: "draft_to_review",
    item: `Generate body copy for ${outlines.length} approved outline(s) via the content engine; flag >>> REVIEW sections; drop into content/blog for implementation.`,
    meta: { pieces: outlines.map((o) => o.piece_id) },
  });
  await appendEvent(db, { agent: "Builder", task: "draft_to_review", status: "awaiting_review", progress: 100 });
  return { status: outlines.length > 0 ? "success" : "partial", summary: { drafted: outlines.map((o) => o.piece_id) } };
}

async function social_distribution(db: Sql): Promise<JobResult> {
  await appendEvent(db, { agent: "Builder", task: "social_distribution", status: "running", progress: 25 });
  await createHandoff(db, {
    job: "social_distribution",
    item: "Repurpose approved content into per-platform variants and publish SEQUENTIALLY with fallback (LinkedIn → Facebook → Instagram) via the browser schedulers.",
    meta: { order: ["linkedin", "facebook", "instagram"] },
  });
  await appendEvent(db, {
    agent: "Builder",
    task: "social_distribution",
    status: "staged",
    progress: 100,
    meta: { note: "Browser publishing runs on Cowork's side; handoff created." },
  });
  return { status: "success", summary: { staged: true } };
}

async function sunday_briefing(db: Sql): Promise<JobResult> {
  await appendEvent(db, { agent: "Researcher", task: "sunday_briefing", status: "running", progress: 15 });
  await createHandoff(db, {
    job: "sunday_briefing",
    item: "Pull GSC + GA4 + social + competitor + AI-citation data (Coupler), synthesize the weekly briefing, and deliver via Teams + email; mirror the summary into the SEO Ops tab.",
    meta: {},
  });
  await appendEvent(db, { agent: "Researcher", task: "sunday_briefing", status: "draft_ready", progress: 100 });
  return { status: "success", summary: { briefing: "handoff_created" } };
}

export const JOB_FNS: Record<SeoJob, (db: Sql) => Promise<JobResult>> = {
  keyword_research,
  outline_generation,
  draft_to_review,
  social_distribution,
  sunday_briefing,
};
