import type { Sql } from "postgres";
import { AGENTS, SEO_GOAL, SEO_WHY, CADENCE, ANALYTICS_NOTE } from "./config";
import { recentEvents, listPipeline, type SeoEvent } from "./store";

// Builds the dashboard shape the CRM SEO Ops tab renders, aggregated from the DB
// on read (no separate 30s writer — avoids write races and suits serverless).
export async function buildDashboard(db: Sql) {
  const events = await recentEvents(db, 100);
  const pipeline = await listPipeline(db);

  const latestByAgent = new Map<string, SeoEvent>();
  const completedByAgent = new Map<string, number>();
  for (const e of events) {
    if (!latestByAgent.has(e.agent)) latestByAgent.set(e.agent, e); // events are desc → first seen = latest
    if (/await|staged|draft_ready|success|pass|done|complete/i.test(e.status)) {
      completedByAgent.set(e.agent, (completedByAgent.get(e.agent) ?? 0) + 1);
    }
  }

  const sub_agents = AGENTS.map((name) => {
    const ev = latestByAgent.get(name);
    return {
      agent_name: name,
      current_task: ev?.task ?? "Idle",
      status: ev?.status ?? "Ready",
      progress_percent: ev?.progress ?? 0,
      tasks_completed: completedByAgent.get(name) ?? 0,
      last_update: ev?.ts ?? "",
    };
  });

  const pendingReview = pipeline.filter((p) => /review|await/i.test(p.status)).length;

  return {
    goal: SEO_GOAL,
    why: SEO_WHY,
    last_updated: new Date().toISOString(),
    overview: {
      total_tasks_active: sub_agents.filter((a) => /run|progress/i.test(a.status)).length,
      completed_this_week: [...completedByAgent.values()].reduce((a, b) => a + b, 0),
      pending_review: pendingReview,
    },
    sub_agents,
    content_pipeline: pipeline.map((p) => ({
      piece_id: p.piece_id,
      title: p.title,
      status: p.status,
      owner_next: p.owner_next ?? undefined,
      platform_targets: p.platform_targets,
      created_date: p.created_at.slice(0, 10),
      scheduled_publish: p.scheduled_publish ?? undefined,
    })),
    analytics_snapshot: {
      gsc_impressions_week: 0,
      gsc_clicks_week: 0,
      ga4_sessions_week: 0,
      social_posts_published: 0,
      ads_live: 0,
      ai_citations_detected: 0,
      note: ANALYTICS_NOTE,
    },
    next_scheduled: CADENCE.map((c) => ({ job: c.job, when: c.when, status: "live" })),
  };
}
