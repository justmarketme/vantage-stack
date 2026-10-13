import { randomBytes } from "crypto";
import type { Sql } from "postgres";
import { get as getBlob } from "@vercel/blob";
import { detectBrand, mergeBrand, DEFAULT_BRAND, type FeedbackBrand } from "./feedback-brand";

export type FeedbackItemKind = "pin" | "drawing" | "note";

export type FeedbackItemInput = {
  client_ref: string;
  kind: FeedbackItemKind;
  body: string;
  x?: number | null;
  y?: number | null;
  at_seconds?: number | null;
  screenshot_url?: string | null;
};

export type AiTask = { title: string; detail: string; priority: "high" | "normal" | "low"; timestamp_seconds?: number | null; item_refs?: string[] };
export type AiResult = { summary: string; transcript: { t: number; text: string }[]; tasks: AiTask[] };

let schemaReady: Promise<void> | null = null;

/** Same runtime-DDL approach as ensureCrmSchema: idempotent, so no separate migration step. */
export function ensureFeedbackSchema(db: Sql) {
  schemaReady ??= db
    .unsafe(`
      set local client_min_messages = warning;
      create table if not exists public.proposal_feedback_links (
        id uuid primary key default gen_random_uuid(),
        client_id uuid not null references public.clients(id) on delete cascade,
        token text not null unique,
        proposal_url text not null,
        title text not null default 'Proposal',
        status text not null default 'created',
        created_by text not null default 'crm_user',
        created_at timestamptz not null default now(),
        opened_at timestamptz,
        submitted_at timestamptz
      );
      create index if not exists proposal_feedback_links_client_idx on public.proposal_feedback_links (client_id, created_at desc);
      create table if not exists public.proposal_feedback_sessions (
        id uuid primary key default gen_random_uuid(),
        link_id uuid not null references public.proposal_feedback_links(id) on delete cascade,
        recording_url text,
        recording_kind text,
        duration_seconds real,
        consent_at timestamptz not null,
        user_agent text,
        ai_status text not null default 'pending',
        ai_error text,
        ai_summary text,
        transcript jsonb,
        created_at timestamptz not null default now()
      );
      create index if not exists proposal_feedback_sessions_link_idx on public.proposal_feedback_sessions (link_id, created_at desc);
      create table if not exists public.proposal_feedback_items (
        id uuid primary key default gen_random_uuid(),
        session_id uuid not null references public.proposal_feedback_sessions(id) on delete cascade,
        client_ref text not null,
        kind text not null,
        body text not null default '',
        x real,
        y real,
        at_seconds real,
        screenshot_url text,
        created_at timestamptz not null default now()
      );
      create index if not exists proposal_feedback_items_session_idx on public.proposal_feedback_items (session_id);
      alter table public.tasks add column if not exists source_ref text;
      alter table public.proposal_feedback_links add column if not exists brand jsonb;
      alter table public.proposal_feedback_links add column if not exists brand_override jsonb;
    `)
    .then(() => undefined)
    .catch((e) => {
      schemaReady = null;
      throw e;
    });
  return schemaReady;
}

/** Client-facing links always use the brand domain; NEXT_PUBLIC_APP_URL points at a host this project doesn't own. */
function feedbackBase() {
  const explicit = (process.env.FEEDBACK_PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  return process.env.NODE_ENV === "production" ? "https://vantagestack.co.za" : "http://localhost:6685";
}

export function feedbackUrl(token: string) {
  return `${feedbackBase()}/f/${token}`;
}

export async function createFeedbackLink(
  db: Sql,
  input: { clientId: string; proposalUrl: string; title: string; createdBy: string; brandOverride?: Partial<FeedbackBrand> | null },
) {
  await ensureFeedbackSchema(db);
  const token = randomBytes(18).toString("base64url");
  const detected = await detectBrand(input.proposalUrl);
  const override = input.brandOverride ?? null;
  const rows = await db<{ id: string; token: string }[]>`
    insert into public.proposal_feedback_links (client_id, token, proposal_url, title, created_by, brand, brand_override)
    values (${input.clientId}::uuid, ${token}, ${input.proposalUrl}, ${input.title}, ${input.createdBy},
      ${db.json(detected as never)}, ${override ? db.json(override as never) : null})
    returning id::text, token
  `;
  return { id: rows[0].id, token, url: feedbackUrl(token), brand: mergeBrand(detected, override) };
}

export async function updateLinkBrand(db: Sql, linkId: string, clientId: string, override: Partial<FeedbackBrand>) {
  await ensureFeedbackSchema(db);
  await db`
    update public.proposal_feedback_links set brand_override = ${db.json(override as never)}
    where id = ${linkId}::uuid and client_id = ${clientId}::uuid
  `;
}

export type PublicLink = { id: string; client_id: string; client_name: string; proposal_url: string; title: string; status: string; brand: FeedbackBrand };

export async function getLinkByToken(db: Sql, token: string): Promise<PublicLink | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  await ensureFeedbackSchema(db);
  const rows = await db<(Omit<PublicLink, "brand"> & { brand: FeedbackBrand | null; brand_override: Partial<FeedbackBrand> | null })[]>`
    select l.id::text, l.client_id::text, coalesce(c.name, '') as client_name, l.proposal_url, l.title, l.status, l.brand, l.brand_override
    from public.proposal_feedback_links l
    join public.clients c on c.id = l.client_id
    where l.token = ${token}
    limit 1
  `;
  const r = rows[0];
  if (!r) return null;
  let detected = r.brand;
  if (!detected) {
    detected = await detectBrand(r.proposal_url).catch(() => DEFAULT_BRAND);
    await db`update public.proposal_feedback_links set brand = ${db.json(detected as never)} where id = ${r.id}::uuid`;
  }
  const { brand_override, brand: _b, ...rest } = r;
  return { ...rest, brand: mergeBrand(detected, brand_override) };
}

export async function markOpened(db: Sql, linkId: string) {
  await db`
    update public.proposal_feedback_links
    set opened_at = coalesce(opened_at, now()), status = case when status = 'created' then 'opened' else status end
    where id = ${linkId}::uuid
  `;
}

export async function saveSession(
  db: Sql,
  link: PublicLink,
  input: { recordingUrl: string | null; recordingKind: string | null; durationSeconds: number | null; userAgent: string; items: FeedbackItemInput[] },
) {
  const rows = await db<{ id: string }[]>`
    insert into public.proposal_feedback_sessions (link_id, recording_url, recording_kind, duration_seconds, consent_at, user_agent)
    values (${link.id}::uuid, ${input.recordingUrl}, ${input.recordingKind}, ${input.durationSeconds}, now(), ${input.userAgent.slice(0, 400)})
    returning id::text
  `;
  const sessionId = rows[0].id;
  for (const it of input.items) {
    await db`
      insert into public.proposal_feedback_items (session_id, client_ref, kind, body, x, y, at_seconds, screenshot_url)
      values (${sessionId}::uuid, ${it.client_ref}, ${it.kind}, ${it.body}, ${it.x ?? null}, ${it.y ?? null}, ${it.at_seconds ?? null}, ${it.screenshot_url ?? null})
    `;
  }
  await db`update public.proposal_feedback_links set status = 'submitted', submitted_at = now() where id = ${link.id}::uuid`;
  await db`
    insert into public.crm_activity (action_type, client_id, user_actor, details)
    values ('proposal_feedback_received', ${link.client_id}::uuid, ${link.client_name || "client"}, ${JSON.stringify({ link_id: link.id, session_id: sessionId, items: input.items.length, has_recording: !!input.recordingUrl })}::jsonb)
  `;
  return sessionId;
}

/** Recordings are private blobs; only paths we issued for feedback are ever read back. */
export function isFeedbackBlobUrl(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(".blob.vercel-storage.com") && u.pathname.startsWith("/feedback/");
  } catch {
    return false;
  }
}

export async function readPrivateBlob(url: string, headers?: HeadersInit) {
  if (!isFeedbackBlobUrl(url)) throw new Error("Not a feedback blob");
  const r = await getBlob(url, { access: "private", headers });
  if (!r || r.statusCode !== 200) throw new Error("Blob not found");
  return r;
}

function fmt(sec: number | null | undefined) {
  if (sec == null || !Number.isFinite(sec)) return "";
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function geminiKey() {
  const k = (process.env.FEEDBACK_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "").trim().replace(/\\n$/, "");
  if (!k) throw new Error("FEEDBACK_GEMINI_API_KEY is not set");
  return k;
}

const GEMINI_MODEL = "gemini-2.5-flash";

async function uploadToGemini(bytes: Buffer, mimeType: string, name: string) {
  const key = geminiKey();
  const start = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${key}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.length),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: name } }),
  });
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!start.ok || !uploadUrl) throw new Error(`Gemini upload start ${start.status}: ${(await start.text()).slice(0, 200)}`);
  const fin = await fetch(uploadUrl, {
    method: "POST",
    headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize", "Content-Length": String(bytes.length) },
    body: new Uint8Array(bytes),
  });
  const j = (await fin.json()) as { file?: { uri: string; name: string; state: string; mimeType: string } };
  if (!fin.ok || !j.file) throw new Error(`Gemini upload ${fin.status}`);
  let file = j.file;
  for (let i = 0; i < 60 && file.state === "PROCESSING"; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const s = await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${key}`);
    file = (await s.json()) as typeof file;
  }
  if (file.state !== "ACTIVE") throw new Error(`Gemini file state ${file.state}`);
  return file;
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    transcript: { type: "ARRAY", items: { type: "OBJECT", properties: { t: { type: "NUMBER" }, text: { type: "STRING" } }, required: ["t", "text"] } },
    tasks: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          detail: { type: "STRING" },
          priority: { type: "STRING", enum: ["high", "normal", "low"] },
          timestamp_seconds: { type: "NUMBER", nullable: true },
          item_refs: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["title", "detail", "priority"],
      },
    },
  },
  required: ["summary", "transcript", "tasks"],
};

export async function analyseSession(
  recording: { bytes: Buffer; mimeType: string } | null,
  items: { client_ref: string; kind: string; body: string; at_seconds: number | null }[],
  context: { clientName: string; title: string; proposalUrl: string },
): Promise<AiResult> {
  const parts: unknown[] = [];
  if (recording) {
    const file = await uploadToGemini(recording.bytes, recording.mimeType, `feedback-${Date.now()}`);
    parts.push({ file_data: { mime_type: file.mimeType, file_uri: file.uri } });
  }
  const itemLines = items.length
    ? items.map((i) => `- [${i.client_ref}] ${i.kind}${i.at_seconds != null ? ` at ${fmt(i.at_seconds)}` : ""}: ${i.body || "(no text)"}`).join("\n")
    : "(none)";
  parts.push({
    text: `You are processing a client's review of a proposal so an agency can act on it.
Client: ${context.clientName}. Proposal: "${context.title}" (${context.proposalUrl}).
${recording ? "The attached recording is the client's screen and voice while reviewing the proposal." : "There is no recording; only written items."}
Written items the client placed (pins on the page, drawings, notes), with their ids and recording timestamps:
${itemLines}

Return:
- summary: 2-4 plain sentences on what the client thinks overall.
- transcript: the client's speech with start time in seconds (empty if no recording or no speech).
- tasks: every concrete change or request, merged and de-duplicated across speech and written items. One task per distinct change. title is an imperative under 70 characters; detail quotes or paraphrases what the client said and what they pointed at; timestamp_seconds is when it was raised; item_refs lists the ids of related written items. Ignore small talk. Do not invent requests the client did not make.`,
  });

  const body = JSON.stringify({
    contents: [{ role: "user", parts }],
    generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA, temperature: 0.2 },
  });
  // Gemini returns 503 "high demand" and 429 in bursts; a short backoff usually clears it.
  let res: Response | null = null;
  let txt = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    txt = await res.text();
    if (res.ok || ![429, 500, 502, 503, 504].includes(res.status)) break;
    await new Promise((r) => setTimeout(r, 4000 * 2 ** attempt));
  }
  if (!res || !res.ok) throw new Error(`Gemini ${res?.status}: ${txt.slice(0, 300)}`);
  const j = JSON.parse(txt) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const out = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const parsed = JSON.parse(out) as AiResult;
  return { summary: parsed.summary ?? "", transcript: parsed.transcript ?? [], tasks: parsed.tasks ?? [] };
}

async function insertTask(db: Sql, clientId: string, sourceRef: string, description: string, priority: string) {
  await db`
    insert into public.tasks (client_id, task_type, status, notes, priority, source_ref)
    values (${clientId}::uuid, 'client-feedback', 'open', ${description}, ${priority}, ${sourceRef})
  `;
}

/**
 * Runs AI over a session and writes CRM tasks. Safe to re-run: tasks for the session are replaced.
 * If AI fails, each written item still becomes a task so nothing the client said is lost.
 */
export async function processSession(db: Sql, sessionId: string) {
  await ensureFeedbackSchema(db);
  const rows = await db<{ session_id: string; recording_url: string | null; client_id: string; client_name: string; title: string; proposal_url: string; link_id: string }[]>`
    select s.id::text as session_id, s.recording_url, l.client_id::text, coalesce(c.name,'') as client_name, l.title, l.proposal_url, l.id::text as link_id
    from public.proposal_feedback_sessions s
    join public.proposal_feedback_links l on l.id = s.link_id
    join public.clients c on c.id = l.client_id
    where s.id = ${sessionId}::uuid
  `;
  const s = rows[0];
  if (!s) throw new Error("Session not found");
  const items = await db<{ id: string; client_ref: string; kind: string; body: string; at_seconds: number | null }[]>`
    select id::text, client_ref, kind, body, at_seconds from public.proposal_feedback_items where session_id = ${sessionId}::uuid order by created_at
  `;
  await db`update public.proposal_feedback_sessions set ai_status = 'processing', ai_error = null where id = ${sessionId}::uuid`;

  const sourceRef = `feedback:${sessionId}`;
  const reviewLink = `${feedbackBase()}/crm/clients/${s.client_id}#proposal-feedback`;
  try {
    let recording: { bytes: Buffer; mimeType: string } | null = null;
    if (s.recording_url) {
      const b = await readPrivateBlob(s.recording_url);
      recording = { bytes: Buffer.from(await new Response(b.stream).arrayBuffer()), mimeType: (b.blob.contentType || "video/webm").split(";")[0] };
    }
    const ai = await analyseSession(recording, items, { clientName: s.client_name, title: s.title, proposalUrl: s.proposal_url });
    await db.begin(async (trx) => {
      const tx = trx as unknown as Sql;
      await tx`delete from public.tasks where source_ref = ${sourceRef}`;
      for (const t of ai.tasks) {
        const when = t.timestamp_seconds != null ? ` ▶ ${fmt(t.timestamp_seconds)}` : "";
        const refs = t.item_refs?.length ? ` · ${t.item_refs.join(", ")}` : "";
        await insertTask(tx, s.client_id, sourceRef, `[Proposal feedback] ${t.title}\n${t.detail}${when}${refs}\n${reviewLink}`, t.priority);
      }
      await tx`
        update public.proposal_feedback_sessions
        set ai_status = 'done', ai_summary = ${ai.summary}, transcript = ${tx.json(ai.transcript as unknown as Parameters<Sql["json"]>[0])}
        where id = ${sessionId}::uuid
      `;
    });
    return { ok: true as const, tasks: ai.tasks.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.begin(async (trx) => {
      const tx = trx as unknown as Sql;
      await tx`delete from public.tasks where source_ref = ${sourceRef}`;
      for (const it of items) {
        const label = it.kind === "pin" ? "Pin" : it.kind === "drawing" ? "Drawing" : "Note";
        const when = it.at_seconds != null ? ` ▶ ${fmt(it.at_seconds)}` : "";
        await insertTask(tx, s.client_id, sourceRef, `[Proposal feedback] ${label} ${it.client_ref}: ${it.body || "(see screenshot)"}${when}\n${reviewLink}`, "normal");
      }
      await tx`update public.proposal_feedback_sessions set ai_status = 'failed', ai_error = ${msg.slice(0, 500)} where id = ${sessionId}::uuid`;
    });
    return { ok: false as const, error: msg };
  }
}

export async function listFeedbackForClient(db: Sql, clientId: string) {
  await ensureFeedbackSchema(db);
  const links = await db`
    select id::text, token, proposal_url, title, status, created_by, created_at::text, opened_at::text, submitted_at::text, brand, brand_override
    from public.proposal_feedback_links where client_id = ${clientId}::uuid order by created_at desc
  `;
  const sessions = await db`
    select s.id::text, s.link_id::text, s.recording_url, s.recording_kind, s.duration_seconds, s.ai_status, s.ai_error, s.ai_summary, s.transcript, s.created_at::text
    from public.proposal_feedback_sessions s
    join public.proposal_feedback_links l on l.id = s.link_id
    where l.client_id = ${clientId}::uuid order by s.created_at desc
  `;
  const items = sessions.length
    ? await db`
        select id::text, session_id::text, client_ref, kind, body, x, y, at_seconds, screenshot_url
        from public.proposal_feedback_items where session_id = any(${sessions.map((s) => s.id as string)}::uuid[]) order by created_at
      `
    : [];
  return {
    links: links.map(({ brand, brand_override, ...l }) => ({
      ...l,
      url: feedbackUrl(l.token as string),
      brand: mergeBrand((brand as FeedbackBrand | null) ?? DEFAULT_BRAND, brand_override as Partial<FeedbackBrand> | null),
      brand_override,
    })),
    sessions: sessions.map((s) => ({
      ...s,
      transcript: typeof s.transcript === "string" ? JSON.parse(s.transcript) : s.transcript,
      items: items.filter((i) => i.session_id === s.id),
    })),
  };
}
