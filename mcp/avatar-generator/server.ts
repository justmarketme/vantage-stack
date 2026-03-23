#!/usr/bin/env node
/**
 * Avatar explainer video MCP — VantageStack (Agent: avatar video specialist)
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";
import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { connectCrmDb, ensureCrmSchema } from "../../lib/crm/db";
import { logCrmActivity } from "../../lib/crm/activity";

const ELEVEN_API = "https://api.elevenlabs.io/v1";
const repoRoot = process.cwd();

function env(name: string, fallback = ""): string {
  return (process.env[name] || fallback).trim();
}

function getElevenLabsKey(): string {
  return env("ELEVENLABS_API_KEY") || env("ELEVEN_LABS_API_KEY");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeSlug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function asStr(v: unknown, d = ""): string {
  if (v == null) return d;
  if (typeof v === "string") return v.trim() || d;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "yes" : "no";
  return d;
}

function estimateSecondsFromScript(script: string): number {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(60, Math.round(words / 2.5));
}

/** Flexible extraction from Agent 3 report JSON */
function extractReportFields(report: Record<string, unknown>) {
  const clientName = asStr(report.client_name ?? report.clientName, "there");

  const healthScore = asStr(
    report.health_score ?? report.healthScore ?? report.website_score ?? report.websiteScore,
    "—",
  );

  const traffic = (report.traffic_data ?? report.trafficData ?? report.traffic) as Record<string, unknown> | undefined;
  const monthlyVisitors = asStr(
    traffic?.monthly_visitors ?? traffic?.monthlyVisitors ?? traffic?.visitors ?? report.monthly_visitors,
    "—",
  );
  const bounceRate = asStr(traffic?.bounce_rate ?? traffic?.bounceRate ?? traffic?.bounce_pct, "—");

  const industryAvgBounce = asStr(traffic?.industry_avg_bounce ?? traffic?.industryAverageBounce, "");
  const vsIndustry = asStr(traffic?.vs_industry ?? traffic?.compared_to_industry, "in line with");

  const backlinks = report.backlink_data ?? report.backlinkData ?? report.backlinks;
  const competitors = report.competitor_data ?? report.competitorData ?? report.competitors;
  const seo = report.seo_opportunities ?? report.seoOpportunities;
  const conversion = report.conversion_critique ?? report.conversionCritique;
  const revenue = report.revenue_opportunity ?? report.revenueOpportunity;
  const upsells = report.upsell_suggestions ?? report.upsellSuggestions ?? report.upsells;

  return {
    clientName,
    healthScore,
    monthlyVisitors,
    bounceRate,
    industryAvgBounce,
    vsIndustry,
    backlinks,
    competitors,
    seo,
    conversion,
    revenue,
    upsells,
  };
}

function formatCompetitorGaps(competitors: unknown): string {
  if (!competitors) return "they’re winning on clarity, trust, and speed-to-lead — the boring stuff that actually moves revenue.";
  if (typeof competitors === "string") return competitors;
  if (Array.isArray(competitors)) {
    return competitors
      .slice(0, 4)
      .map((c, i) => {
        if (c && typeof c === "object") {
          const o = c as Record<string, unknown>;
          const name = asStr(o.name ?? o.competitor, `Competitor ${i + 1}`);
          const gap = asStr(o.gap ?? o.weakness ?? o.note, "");
          return gap ? `${name}: ${gap}` : `${name}`;
        }
        return String(c);
      })
      .join(" ");
  }
  if (typeof competitors === "object") {
    return JSON.stringify(competitors).slice(0, 600);
  }
  return String(competitors);
}

function formatRevenueScenarios(revenue: unknown): {
  conservative: string;
  moderate: string;
  aggressive: string;
  roiLine: string;
} {
  const fallback = {
    conservative: "a conservative lift if you tighten tracking and landing pages first",
    moderate: "a moderate lift once ads + conversion work together",
    aggressive: "an aggressive upside if you scale spend with a dialed-in funnel",
    roiLine: "ROI improves fastest when we fix leakage before we add budget.",
  };
  if (!revenue || typeof revenue !== "object") {
    return {
      conservative: "R12k–R28k / month (illustrative — replace with your model)",
      moderate: "R28k–R65k / month",
      aggressive: "R65k+ / month",
      roiLine: fallback.roiLine,
    };
  }
  const r = revenue as Record<string, unknown>;
  const scenarios = (r.scenarios ?? r.projections) as Record<string, unknown> | undefined;
  if (scenarios && typeof scenarios === "object") {
    return {
      conservative: asStr(scenarios.conservative ?? scenarios.low, fallback.conservative),
      moderate: asStr(scenarios.moderate ?? scenarios.mid, fallback.moderate),
      aggressive: asStr(scenarios.aggressive ?? scenarios.high, fallback.aggressive),
      roiLine: asStr(r.roi_note ?? r.roi, fallback.roiLine),
    };
  }
  return {
    conservative: asStr(r.conservative_monthly ?? r.monthly_low, "see report details"),
    moderate: asStr(r.moderate_monthly ?? r.monthly_mid, "see report details"),
    aggressive: asStr(r.aggressive_monthly ?? r.monthly_high, "see report details"),
    roiLine: asStr(r.roi_calculation ?? r.roi, fallback.roiLine),
  };
}

function buildScript(
  report: Record<string, unknown>,
  avatarName: string,
  avatarDescription: string,
): { script: string; estimated_duration_seconds: number } {
  const x = extractReportFields(report);
  const rev = formatRevenueScenarios(x.revenue);
  const compGaps = formatCompetitorGaps(x.competitors);
  const seoBit = x.seo ? (typeof x.seo === "string" ? x.seo : JSON.stringify(x.seo).slice(0, 400)) : "technical SEO and on-page intent alignment";
  const convBit = x.conversion
    ? typeof x.conversion === "string"
      ? x.conversion
      : JSON.stringify(x.conversion).slice(0, 400)
    : "form friction, clarity of offer, and follow-up speed";

  const upsell =
    x.upsells != null
      ? typeof x.upsells === "string"
        ? x.upsells
        : Array.isArray(x.upsells)
          ? x.upsells.map((u) => (typeof u === "string" ? u : JSON.stringify(u))).join("; ")
          : JSON.stringify(x.upsells).slice(0, 500)
      : "a Growth Optimization Blueprint to validate priorities, then install the Revenue System so capture → qualify → book happens on autopilot.";

  const bounceCompare =
    x.industryAvgBounce && x.bounceRate !== "—"
      ? `Industry bounce is roughly ${x.industryAvgBounce}%, so you're ${x.vsIndustry} typical — not disastrous, but it’s a lever.`
      : `Compared to your category, you’re ${x.vsIndustry} what we usually see — the opportunity is turning more of the right visitors into conversations.`;

  const script = `Hi ${x.clientName}, I'm ${avatarName} from VantageStack. I've completed a deep analysis of your business, and I have some really interesting insights to share with you.

Your website health score is ${x.healthScore} out of 100. Here's what that means in plain English: it's not a "good/bad" label — it's a snapshot of how well your site earns trust, guides intent, and turns attention into action. Where the score is softer, it's usually not because you're "bad at marketing" — it's because a few friction points are quietly taxing conversion. Where it's stronger, we double down and scale what's already working.

Traffic insights — right now, you're getting ${x.monthlyVisitors} monthly visitors, with a bounce rate of ${x.bounceRate}%. ${bounceCompare} The real question isn't just volume — it's whether you're winning the high-intent sessions that should convert.

Competitive gaps — I looked at your top competitors, and here's where they're beating you: ${compGaps} And look — this isn't to make you feel behind. It's to make the roadmap obvious: we close gaps with better intent coverage, clearer proof, and a faster path to "book a call" — not with random redesign theatre.

On SEO and demand: ${seoBit}. Think of it as making sure you're visible for the searches that actually buy — not just the ones that browse.

Conversion reality check: ${convBit}. Small fixes here compound because they touch every visitor — not only the new ones.

Here's the exciting part — revenue opportunity. If you implemented paid ads in your niche, based on typical CPC and conversion assumptions in your space, you could be looking at roughly ${rev.conservative} per month on the conservative side, ${rev.moderate} in a moderate scenario, and ${rev.aggressive} in an aggressive scenario. That's the three-scenario view: conservative, moderate, aggressive — so you're not staring at one fantasy number. ${rev.roiLine}

Upsell recommendation — based on what I'm seeing, I think the best next step for you would be ${upsell}. Here's why: it's the logical progression from insight to system — we stop guessing, we install the workflow, and we measure what matters.

Closing — I'm really excited about the potential here, ${x.clientName}. Let's set up a quick call to discuss this further. I've attached a full written report with all the details — and if you want, we can turn this into a clean 30-day plan with owners and milestones.

Looking forward to working with you.

— ${avatarName}, VantageStack
(${avatarDescription})`;

  return { script: script.trim(), estimated_duration_seconds: estimateSecondsFromScript(script) };
}

// --- Zod tool inputs ---

const GenerateScriptInput = z.object({
  report_json: z.any(),
  avatar_name: z.string().default("Amara"),
  avatar_description: z
    .string()
    .default("Female Gen Z professional from Sandton, friendly and witty"),
});

const CallElevenLabsInput = z.object({
  script: z.string().min(1),
  client_id: z.string().min(1),
  voice_id: z.string().optional(),
  avatar_id: z.string().optional(),
  video_format: z.enum(["mp4"]).default("mp4"),
  background: z
    .object({
      style: z.string().optional(),
      color: z.string().optional(),
    })
    .optional(),
  model_id: z.string().optional(),
  retries: z.number().int().min(0).max(2).default(2),
  retry_delay_ms: z.number().int().min(0).default(5000),
});

const UploadToSupabaseInput = z.object({
  local_file_path: z.string().min(1),
  client_id: z.string().min(1),
  bucket: z.string().optional(),
  /** Override object name (default avatar_video_<timestamp>.<ext>) */
  object_name: z.string().optional(),
});

const CreateDraftRecordInput = z.object({
  client_id: z.string().uuid(),
  report_id: z.string().uuid().optional(),
  video_url: z.string().url(),
  script_content: z.string().min(1),
  video_type: z.string().default("avatar_explainer"),
  avatar_description: z.string().default("Female Gen Z professional from Sandton, friendly and witty"),
  status: z.string().default("draft"),
  created_by: z.string().default("system"),
});

const NotifyCrmInput = z.object({
  client_id: z.string().uuid(),
  client_name: z.string().min(1),
  report_draft_id: z.string().uuid(),
  video_url: z.string().url(),
  message: z.string().optional(),
});

async function writeOutputFile(clientId: string, ext: string, data: Uint8Array): Promise<string> {
  const dir = join(repoRoot, "data", "avatar-output", safeSlug(clientId));
  await mkdir(dir, { recursive: true });
  const name = `avatar_${Date.now()}.${ext.replace(/^\./, "")}`;
  const fp = join(dir, name);
  await writeFile(fp, data);
  return fp;
}

async function callElevenLabsAvatarOrTts(parsed: z.infer<typeof CallElevenLabsInput>): Promise<Record<string, unknown>> {
  const apiKey = getElevenLabsKey();
  if (!apiKey) throw new Error("Set ELEVENLABS_API_KEY or ELEVEN_LABS_API_KEY");

  const voiceId =
    parsed.voice_id?.trim() ||
    env("ELEVENLABS_AVATAR_VOICE_ID") ||
    "EXAVITQu4vr4xnSDxMaL"; // Rachel — professional female; override for SA voice when you have ID

  const avatarId = parsed.avatar_id?.trim() || env("ELEVENLABS_AVATAR_ID") || "";
  const videoUrl = env("ELEVENLABS_AVATAR_VIDEO_URL");

  let lastErr: unknown;

  for (let attempt = 0; attempt <= parsed.retries; attempt++) {
    try {
      if (videoUrl) {
        const res = await fetch(videoUrl, {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            script: parsed.script,
            voice_id: voiceId,
            avatar_id: avatarId,
            video_format: parsed.video_format,
            background: parsed.background ?? { style: "office", color: "light_gray" },
          }),
        });
        const ct = res.headers.get("content-type") || "";
        if (res.ok && ct.includes("video")) {
          const buf = new Uint8Array(await res.arrayBuffer());
          const path = await writeOutputFile(parsed.client_id, "mp4", buf);
          return {
            ok: true,
            mode: "avatar_video",
            local_file_path: path,
            mime: "video/mp4",
            voice_id: voiceId,
            avatar_id: avatarId || null,
            note: "MP4 returned from ELEVENLABS_AVATAR_VIDEO_URL",
          };
        }
        const txt = await res.text();
        // JSON job response
        try {
          const j = JSON.parse(txt) as Record<string, unknown>;
          if (j.video_url || j.url || j.output_url) {
            return {
              ok: true,
              mode: "avatar_video_async",
              remote: j,
              voice_id: voiceId,
              avatar_id: avatarId || null,
              note: "Endpoint returned JSON (async URL). Use video URL from response for upload step.",
            };
          }
        } catch {
          /* ignore */
        }
        throw new Error(`Avatar video HTTP ${res.status}: ${txt.slice(0, 800)}`);
      }

      // Fallback: TTS audio only (until avatar MP4 URL is configured)
      const modelId = parsed.model_id || env("ELEVENLABS_TTS_MODEL_ID") || "eleven_multilingual_v2";
      const ttsUrl = `${ELEVEN_API}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
      const res = await fetch(ttsUrl, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({ text: parsed.script, model_id: modelId }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`TTS fallback failed: ${res.status} ${err.slice(0, 500)}`);
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      const path = await writeOutputFile(parsed.client_id, "mp3", buf);
      return {
        ok: true,
        mode: "tts_fallback",
        local_file_path: path,
        mime: "audio/mpeg",
        voice_id: voiceId,
        avatar_id: avatarId || null,
        note:
          "ELEVENLABS_AVATAR_VIDEO_URL not set or MP4 not returned — saved narration audio (.mp3). Configure ELEVENLABS_AVATAR_VIDEO_URL for MP4 avatar output.",
      };
    } catch (e) {
      lastErr = e;
      if (attempt < parsed.retries) await sleep(parsed.retry_delay_ms);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function uploadToSupabaseStorage(parsed: z.infer<typeof UploadToSupabaseInput>): Promise<Record<string, unknown>> {
  const supabaseUrl = env("SUPABASE_URL") || env("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY for Storage upload.");
  }
  const bucket = parsed.bucket || env("SUPABASE_REPORTS_BUCKET") || "reports";
  const ext = parsed.local_file_path.split(".").pop() || "mp4";
  const objectName =
    parsed.object_name || `${safeSlug(parsed.client_id)}/avatar_video_${Date.now()}.${ext}`;

  const body = await readFile(parsed.local_file_path);
  const encodedPath = objectName
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  const uploadUrl = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`;

  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": ext === "mp3" ? "audio/mpeg" : "video/mp4",
      "x-upsert": "true",
    },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Supabase upload failed: ${res.status} ${t.slice(0, 600)}`);
  }

  const publicUrl = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${encodeURIComponent(bucket)}/${objectName}`;

  return {
    ok: true,
    bucket,
    object_path: `/${objectName}`,
    public_url: publicUrl,
  };
}

async function createDraftRecord(parsed: z.infer<typeof CreateDraftRecordInput>): Promise<Record<string, unknown>> {
  const db = await connectCrmDb();
  if (!db) throw new Error("DATABASE_URL (or SUPABASE_DB_URL) required for report_drafts insert.");
  try {
    await ensureCrmSchema(db);
    const rows = await db<{ id: string }[]>`
      insert into public.report_drafts (
        client_id,
        report_id,
        video_url,
        video_type,
        script_content,
        avatar_description,
        status,
        created_by
      ) values (
        ${parsed.client_id}::uuid,
        ${parsed.report_id ? parsed.report_id : null}::uuid,
        ${parsed.video_url},
        ${parsed.video_type},
        ${parsed.script_content},
        ${parsed.avatar_description},
        ${parsed.status},
        ${parsed.created_by}
      )
      returning id
    `;
    const id = rows[0]?.id;
    return { ok: true, report_draft_id: id };
  } finally {
    await db.end({ timeout: 5 });
  }
}

async function notifyCrm(parsed: z.infer<typeof NotifyCrmInput>): Promise<Record<string, unknown>> {
  const text = `Avatar video ready for review for ${parsed.client_name}`;
  const db = await connectCrmDb();
  const details = {
    type: "avatar_explainer_draft",
    report_draft_id: parsed.report_draft_id,
    video_url: parsed.video_url,
    message: parsed.message ?? text,
  };

  if (db) {
    try {
      await logCrmActivity(db, {
        action_type: "avatar_video_draft_ready",
        client_id: parsed.client_id,
        user_actor: "system",
        details,
      });
    } finally {
      await db.end({ timeout: 5 });
    }
  }

  const hook = env("CRM_AVATAR_NOTIFICATION_WEBHOOK_URL");
  if (hook) {
    const res = await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notification: text, ...details }),
    });
    if (!res.ok) {
      const raw = await res.text();
      return { ok: true, crm_activity: true, webhook: { ok: false, status: res.status, raw: raw.slice(0, 500) } };
    }
    return { ok: true, crm_activity: Boolean(db), webhook: { ok: true, status: res.status } };
  }

  return {
    ok: true,
    crm_activity: Boolean(db),
    webhook: { skipped: true, reason: "CRM_AVATAR_NOTIFICATION_WEBHOOK_URL not set" },
    notification: text,
  };
}

// --- MCP server ---

const server = new Server({ name: "avatar-generator", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "generate-script",
      description:
        "Generate a 4–5 minute personalized avatar narration script (Amara / Sandton persona) from Agent 3 report_json.",
      inputSchema: zodToJsonSchema(GenerateScriptInput),
    },
    {
      name: "call-elevenlabs-api",
      description:
        "Call ElevenLabs avatar MP4 endpoint (ELEVENLABS_AVATAR_VIDEO_URL) or TTS audio fallback; retries up to 2x with delay.",
      inputSchema: zodToJsonSchema(CallElevenLabsInput),
    },
    {
      name: "upload-to-supabase",
      description: "Upload local video/audio file to Supabase Storage under reports/{client_id}/avatar_video_<timestamp>.ext",
      inputSchema: zodToJsonSchema(UploadToSupabaseInput),
    },
    {
      name: "create-draft-record",
      description: "Insert a draft row into public.report_drafts (requires DATABASE_URL).",
      inputSchema: zodToJsonSchema(CreateDraftRecordInput),
    },
    {
      name: "notify-crm",
      description: "Notify CRM via crm_activity + optional CRM_AVATAR_NOTIFICATION_WEBHOOK_URL.",
      inputSchema: zodToJsonSchema(NotifyCrmInput),
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = req.params.arguments ?? {};

  const text = (obj: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] });

  if (name === "generate-script") {
    const p = GenerateScriptInput.parse(args);
    const rj = p.report_json && typeof p.report_json === "object" && !Array.isArray(p.report_json) ? (p.report_json as Record<string, unknown>) : {};
    const { script, estimated_duration_seconds } = buildScript(rj, p.avatar_name, p.avatar_description);
    return text({
      ok: true,
      avatar_name: p.avatar_name,
      avatar_description: p.avatar_description,
      script,
      estimated_duration_seconds,
    });
  }

  if (name === "call-elevenlabs-api") {
    const p = CallElevenLabsInput.parse(args);
    const out = await callElevenLabsAvatarOrTts(p);
    return text(out);
  }

  if (name === "upload-to-supabase") {
    const p = UploadToSupabaseInput.parse(args);
    if (!existsSync(p.local_file_path)) throw new Error(`File not found: ${p.local_file_path}`);
    const out = await uploadToSupabaseStorage(p);
    return text(out);
  }

  if (name === "create-draft-record") {
    const p = CreateDraftRecordInput.parse(args);
    const out = await createDraftRecord(p);
    return text(out);
  }

  if (name === "notify-crm") {
    const p = NotifyCrmInput.parse(args);
    const out = await notifyCrm(p);
    return text(out);
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
