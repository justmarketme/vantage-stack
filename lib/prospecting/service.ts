import type { Sql } from "postgres";
import type {
  Prospect,
  ProspectEngagement,
  ProspectingRun,
  ProspectingChannel,
  Track,
  ConfidenceFlag,
  ProspectStage,
  EngagementStatus,
} from "./types";
import {
  INTENT_SIGNALS,
  PAIN_POINT_TO_LANDING_PAGE,
  STANDARD_TRACK_LANDING,
} from "./types";

// ---------------------------------------------------------------------------
// Prospects CRUD
// ---------------------------------------------------------------------------

export async function createProspect(
  db: Sql,
  data: {
    source_platform: string;
    source_url: string;
    source_text: string;
    name?: string;
    business_name?: string;
    contact_email?: string;
    contact_phone?: string;
    contact_whatsapp?: string;
    website_url?: string;
    social_profiles?: Record<string, string>;
    industry_vertical?: string;
    company_size_estimate?: string;
    pain_point: string;
    intent_signals: string[];
    track: Track;
    confidence_flag?: ConfidenceFlag;
    metadata?: Record<string, unknown>;
  },
): Promise<Prospect> {
  const landingPage = routeLandingPage(data.intent_signals, data.track);

  const [row] = await db`
    insert into public.prospects (
      source_platform, source_url, source_text,
      name, business_name, contact_email, contact_phone, contact_whatsapp,
      website_url, social_profiles, industry_vertical, company_size_estimate,
      pain_point, intent_signals, track, confidence_flag,
      routed_landing_page, metadata
    ) values (
      ${data.source_platform}, ${data.source_url}, ${data.source_text},
      ${data.name ?? null}, ${data.business_name ?? null},
      ${data.contact_email ?? null}, ${data.contact_phone ?? null},
      ${data.contact_whatsapp ?? null}, ${data.website_url ?? null},
      ${JSON.stringify(data.social_profiles ?? {})},
      ${data.industry_vertical ?? null}, ${data.company_size_estimate ?? null},
      ${data.pain_point}, ${data.intent_signals},
      ${data.track}, ${data.confidence_flag ?? "yellow"},
      ${landingPage}, ${JSON.stringify(data.metadata ?? {})}
    )
    returning *
  `;
  return row as unknown as Prospect;
}

export async function getProspect(db: Sql, id: string): Promise<Prospect | null> {
  const [row] = await db`select * from public.prospects where id = ${id}`;
  return (row as unknown as Prospect) ?? null;
}

export async function listProspects(
  db: Sql,
  filters: {
    stage?: ProspectStage;
    track?: Track;
    confidence?: ConfidenceFlag;
    platform?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<Prospect[]> {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const rows = await db`
    select * from public.prospects
    where true
      ${filters.stage ? db`and stage = ${filters.stage}` : db``}
      ${filters.track ? db`and track = ${filters.track}` : db``}
      ${filters.confidence ? db`and confidence_flag = ${filters.confidence}` : db``}
      ${filters.platform ? db`and source_platform = ${filters.platform}` : db``}
    order by created_at desc
    limit ${limit} offset ${offset}
  `;
  return rows as unknown as Prospect[];
}

export async function updateProspect(
  db: Sql,
  id: string,
  patch: Partial<Pick<Prospect,
    | "name" | "contact_email" | "contact_phone" | "contact_whatsapp"
    | "business_name" | "cipc_registration" | "website_url"
    | "social_profiles" | "company_size_estimate" | "industry_vertical"
    | "pain_point" | "intent_signals" | "track" | "confidence_flag"
    | "stage" | "routed_landing_page" | "research_findings" | "metadata"
  >>,
): Promise<Prospect | null> {
  const sets: string[] = [];
  const vals: (string | number | boolean | null)[] = [];

  for (const [key, val] of Object.entries(patch)) {
    if (val === undefined) continue;
    const dbVal = typeof val === "object" && val !== null ? JSON.stringify(val) : (val as string | number | boolean | null);
    sets.push(`${key} = $${vals.length + 2}`);
    vals.push(dbVal);
  }

  if (sets.length === 0) return getProspect(db, id);

  sets.push("updated_at = now()");

  const query = `
    update public.prospects
    set ${sets.join(", ")}
    where id = $1
    returning *
  `;
  const [row] = await db.unsafe(query, [id as string, ...vals]);
  return (row as unknown as Prospect) ?? null;
}

export async function updateProspectStage(
  db: Sql,
  id: string,
  stage: ProspectStage,
): Promise<Prospect | null> {
  return updateProspect(db, id, { stage });
}

// ---------------------------------------------------------------------------
// Engagements
// ---------------------------------------------------------------------------

export async function createEngagement(
  db: Sql,
  data: {
    prospect_id: string;
    run_id?: string;
    channel: string;
    direction?: "outbound" | "inbound";
    message_text: string;
    cta_type?: string;
    cta_url?: string;
    status?: EngagementStatus;
    thread_url?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<ProspectEngagement> {
  const [row] = await db`
    insert into public.prospect_engagements (
      prospect_id, run_id, channel, direction, message_text,
      cta_type, cta_url, status, thread_url, metadata
    ) values (
      ${data.prospect_id}, ${data.run_id ?? null},
      ${data.channel}, ${data.direction ?? "outbound"},
      ${data.message_text}, ${data.cta_type ?? null}, ${data.cta_url ?? null},
      ${data.status ?? "draft"}, ${data.thread_url ?? null},
      ${JSON.stringify(data.metadata ?? {})}
    )
    returning *
  `;
  return row as unknown as ProspectEngagement;
}

export async function updateEngagementStatus(
  db: Sql,
  id: string,
  status: EngagementStatus,
  extra?: { approved_by?: string; response_text?: string; posted_at?: string },
): Promise<ProspectEngagement | null> {
  const timestampCol =
    status === "approved" ? "approved_at" :
    status === "posted" ? "posted_at" :
    status === "responded" ? "responded_at" :
    null;

  let query = `update public.prospect_engagements set status = $2`;
  const vals: (string | null)[] = [id, status];

  if (timestampCol) {
    query += `, ${timestampCol} = now()`;
  }
  if (extra?.approved_by) {
    vals.push(extra.approved_by);
    query += `, approved_by = $${vals.length}`;
  }
  if (extra?.response_text) {
    vals.push(extra.response_text);
    query += `, response_text = $${vals.length}`;
  }

  query += ` where id = $1 returning *`;
  const [row] = await db.unsafe(query, vals);
  return (row as unknown as ProspectEngagement) ?? null;
}

export async function listEngagements(
  db: Sql,
  filters: { prospect_id?: string; status?: EngagementStatus; run_id?: string; limit?: number },
): Promise<ProspectEngagement[]> {
  const limit = filters.limit ?? 50;
  const rows = await db`
    select * from public.prospect_engagements
    where true
      ${filters.prospect_id ? db`and prospect_id = ${filters.prospect_id}` : db``}
      ${filters.status ? db`and status = ${filters.status}` : db``}
      ${filters.run_id ? db`and run_id = ${filters.run_id}::uuid` : db``}
    order by created_at desc
    limit ${limit}
  `;
  return rows as unknown as ProspectEngagement[];
}

export async function getPendingApprovals(db: Sql): Promise<(ProspectEngagement & { prospect_name: string; prospect_business: string })[]> {
  const rows = await db`
    select e.*, p.name as prospect_name, p.business_name as prospect_business
    from public.prospect_engagements e
    join public.prospects p on p.id = e.prospect_id
    where e.status = 'pending_approval'
    order by e.created_at asc
  `;
  return rows as unknown as (ProspectEngagement & { prospect_name: string; prospect_business: string })[];
}

// ---------------------------------------------------------------------------
// Prospecting Runs
// ---------------------------------------------------------------------------

export async function startRun(
  db: Sql,
  trigger: "cron" | "manual",
): Promise<ProspectingRun> {
  const [row] = await db`
    insert into public.prospecting_runs (trigger) values (${trigger})
    returning *
  `;
  return row as unknown as ProspectingRun;
}

export async function finishRun(
  db: Sql,
  id: string,
  result: {
    channels_scanned: string[];
    signals_found: number;
    leads_created: number;
    drafts_created: number;
    hot_leads_flagged: number;
    status: "completed" | "failed";
    summary?: Record<string, unknown>;
    error?: Record<string, unknown>;
  },
): Promise<ProspectingRun> {
  const [row] = await db`
    update public.prospecting_runs set
      finished_at = now(),
      channels_scanned = ${result.channels_scanned},
      signals_found = ${result.signals_found},
      leads_created = ${result.leads_created},
      drafts_created = ${result.drafts_created},
      hot_leads_flagged = ${result.hot_leads_flagged},
      status = ${result.status},
      summary = ${JSON.stringify(result.summary ?? {})},
      error = ${result.error ? JSON.stringify(result.error) : null}
    where id = ${id}
    returning *
  `;
  return row as unknown as ProspectingRun;
}

export async function getLatestRun(db: Sql): Promise<ProspectingRun | null> {
  const [row] = await db`
    select * from public.prospecting_runs order by started_at desc limit 1
  `;
  return (row as unknown as ProspectingRun) ?? null;
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

export async function listChannels(
  db: Sql,
  filters: { track?: Track; enabled?: boolean } = {},
): Promise<ProspectingChannel[]> {
  const rows = await db`
    select * from public.prospecting_channels
    where true
      ${filters.track ? db`and track = ${filters.track}` : db``}
      ${filters.enabled !== undefined ? db`and enabled = ${filters.enabled}` : db``}
    order by scan_priority asc
  `;
  return rows as unknown as ProspectingChannel[];
}

export async function upsertChannel(
  db: Sql,
  channel: Omit<ProspectingChannel, "id">,
): Promise<ProspectingChannel> {
  const [row] = await db`
    insert into public.prospecting_channels (
      platform, channel_name, channel_url, track, enabled,
      scan_priority, last_scanned_at, conversion_rate, metadata
    ) values (
      ${channel.platform}, ${channel.channel_name}, ${channel.channel_url},
      ${channel.track}, ${channel.enabled}, ${channel.scan_priority},
      ${channel.last_scanned_at ?? null}, ${channel.conversion_rate},
      ${JSON.stringify(channel.metadata)}
    )
    on conflict (platform, channel_name)
    do update set
      channel_url = excluded.channel_url,
      track = excluded.track,
      enabled = excluded.enabled,
      scan_priority = excluded.scan_priority,
      metadata = excluded.metadata
    returning *
  `;
  return row as unknown as ProspectingChannel;
}

export async function markChannelScanned(db: Sql, id: string): Promise<void> {
  await db`update public.prospecting_channels set last_scanned_at = now() where id = ${id}`;
}

// ---------------------------------------------------------------------------
// Intent Detection
// ---------------------------------------------------------------------------

export function detectIntentSignals(text: string): { signals: string[]; topCategory: string; score: number } {
  const lower = text.toLowerCase();
  const matched: { category: string; weight: number }[] = [];

  for (const signal of INTENT_SIGNALS) {
    if (lower.includes(signal.keyword.toLowerCase())) {
      matched.push({ category: signal.category, weight: signal.weight });
    }
  }

  if (matched.length === 0) return { signals: [], topCategory: "", score: 0 };

  matched.sort((a, b) => b.weight - a.weight);
  const score = matched.reduce((sum, m) => sum + m.weight, 0) / matched.length;
  const signals = [...new Set(matched.map((m) => m.category))];

  return { signals, topCategory: matched[0].category, score };
}

export function routeLandingPage(signals: string[], track: Track): string {
  if (track === "standard") return STANDARD_TRACK_LANDING;
  if (signals.length === 0) return "/";
  return PAIN_POINT_TO_LANDING_PAGE[signals[0]] ?? "/";
}

// ---------------------------------------------------------------------------
// Stats / Metrics
// ---------------------------------------------------------------------------

export async function getDailyStats(db: Sql, date?: string): Promise<{
  leads_found: number;
  leads_contacted: number;
  leads_responded: number;
  hot_leads: number;
  calls_booked: number;
  pending_approvals: number;
}> {
  const targetDate = date ?? new Date().toISOString().slice(0, 10);
  const [stats] = await db`
    select
      count(*) filter (where created_at::date = ${targetDate}::date) as leads_found,
      count(*) filter (where stage != 'new' and created_at::date = ${targetDate}::date) as leads_contacted,
      count(*) filter (where stage = 'responded' and updated_at::date = ${targetDate}::date) as leads_responded,
      count(*) filter (where confidence_flag = 'green' and stage in ('responded', 'call_booked') and updated_at::date = ${targetDate}::date) as hot_leads,
      count(*) filter (where stage = 'call_booked' and updated_at::date = ${targetDate}::date) as calls_booked
    from public.prospects
  `;
  const [approvals] = await db`
    select count(*) as cnt from public.prospect_engagements where status = 'pending_approval'
  `;
  return {
    leads_found: Number(stats?.leads_found ?? 0),
    leads_contacted: Number(stats?.leads_contacted ?? 0),
    leads_responded: Number(stats?.leads_responded ?? 0),
    hot_leads: Number(stats?.hot_leads ?? 0),
    calls_booked: Number(stats?.calls_booked ?? 0),
    pending_approvals: Number(approvals?.cnt ?? 0),
  };
}
