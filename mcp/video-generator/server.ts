#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";
import { writeFile, mkdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

const API_BASE = "https://api.elevenlabs.io/v1";

const repoRoot = process.cwd();

function getElevenLabsApiKey(): string {
  return (process.env.ELEVENLABS_API_KEY || "").trim();
}

function safeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function estimateSecondsFromScript(script: string): number {
  // Conservative: ~150 wpm → 2.5 wps
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(20, Math.round(words / 2.5));
}

const ClientProfileSchema = z
  .object({
    client_id: z.string().min(1),
    client_name: z.string().min(1),
    report_id: z.string().min(1),
    consultation_url: z.string().optional(),
  })
  .passthrough();

const WriteVideoScriptInput = z.object({
  report_json: z.any().optional(),
  report_markdown: z.string().optional(),
  client_profile: ClientProfileSchema,
  strategist_name: z.string().default("VantageStack team"),
  brand_feel: z.enum(["premium", "friendly", "technical", "bold"]).default("premium"),
});

function extractSection(md: string, headingLike: RegExp): string | null {
  // Best-effort: find a heading line and capture until next heading of same/higher level.
  const lines = md.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headingLike.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  const startLevel = (lines[start].match(/^#+/)?.[0]?.length ?? 1);
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    const m = l.match(/^(#+)\s+/);
    if (m && m[1].length <= startLevel) break;
    out.push(l);
  }
  return out.join("\n").trim() || null;
}

function pickFirstNumberLine(text: string | null): string | null {
  if (!text) return null;
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  for (const l of lines) {
    if (/\d/.test(l)) return l;
  }
  return null;
}

function formatMaybeCurrency(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function asString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function pickFromReport(report: any) {
  // Best-effort extraction across likely keys.
  const healthScore =
    report?.health_score ??
    report?.healthScore ??
    report?.website_health?.score ??
    report?.websiteHealth?.score ??
    report?.scores?.health;

  const monthlyVisitors =
    report?.monthly_visitors ??
    report?.monthlyVisitors ??
    report?.traffic?.monthly_visitors ??
    report?.traffic?.monthlyVisitors ??
    report?.metrics?.monthly_visitors ??
    report?.metrics?.monthlyVisitors;

  const biggestOpportunity =
    report?.biggest_opportunity ??
    report?.biggestOpportunity ??
    report?.top_opportunity ??
    report?.topOpportunity ??
    report?.summary?.biggest_opportunity ??
    report?.summary?.biggestOpportunity;

  const competitorName =
    report?.competitor_name ??
    report?.competitorName ??
    report?.competitors?.[0]?.name ??
    report?.competitive?.top_competitor ??
    report?.competitive?.topCompetitor;

  const competitiveGaps =
    report?.competitive_gaps ??
    report?.competitiveGaps ??
    report?.gaps ??
    report?.traffic_gaps ??
    report?.trafficGaps ??
    report?.competitive?.gaps ??
    report?.competitive?.gap_list ??
    report?.competitive?.gapList;

  const revenueProjection =
    report?.revenue_projection ??
    report?.revenueProjection ??
    report?.opportunity?.revenue_projection ??
    report?.opportunity?.revenueProjection ??
    report?.revenue?.projection ??
    report?.revenue?.opportunity;

  const recommendedNextSteps =
    report?.recommended_next_steps ??
    report?.recommendedNextSteps ??
    report?.next_steps ??
    report?.nextSteps ??
    report?.recommendations ??
    report?.recommendation_list ??
    report?.recommendationList;

  return {
    healthScore,
    monthlyVisitors,
    biggestOpportunity,
    competitorName,
    competitiveGaps,
    revenueProjection,
    recommendedNextSteps,
  };
}

function normalizeToBullets(v: unknown, max = 4): string[] {
  if (!v) return [];
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === "string" ? x : JSON.stringify(x)))
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, max);
  }
  if (typeof v === "string") {
    return v
      .split(/\r?\n|;\s+/)
      .map((s) => s.replace(/^[-*]\s+/, "").trim())
      .filter(Boolean)
      .slice(0, max);
  }
  return [JSON.stringify(v)].slice(0, max);
}

function buildVideoScript(params: z.infer<typeof WriteVideoScriptInput>) {
  const { report_markdown: md, report_json, client_profile, strategist_name, brand_feel } = params;
  const clientName = client_profile.client_name;

  const extracted = pickFromReport(report_json);

  const health = md
    ? extractSection(md, /^#{1,6}\s*(website\s+health|site\s+health|health\s+score)\b/i) ??
      extractSection(md, /^#{1,6}\s*(summary|overview|executive\s+summary)\b/i)
    : null;
  const gaps = md ? extractSection(md, /^#{1,6}\s*(traffic\s+gaps|competitive\s+gaps|gaps|opportunities)\b/i) : null;
  const revenue = md ? extractSection(md, /^#{1,6}\s*(revenue\s+opportunity|opportunity|impact)\b/i) : null;
  const next = md ? extractSection(md, /^#{1,6}\s*(recommended\s+next\s+step|next\s+step|recommendation)\b/i) : null;

  const healthHook = pickFirstNumberLine(health) ?? (health ? health.split(/\r?\n/)[0] : null);
  const gapsHook = pickFirstNumberLine(gaps) ?? (gaps ? gaps.split(/\r?\n/)[0] : null);
  const revHook = pickFirstNumberLine(revenue) ?? (revenue ? revenue.split(/\r?\n/)[0] : null);
  const nextHook = (next ? next.split(/\r?\n/)[0] : null) ?? "a focused 30-minute diagnostic to map the fastest wins";

  const tone =
    brand_feel === "premium"
      ? "calm, high-trust, strategist-to-founder"
      : brand_feel === "friendly"
        ? "warm, encouraging, upbeat"
        : brand_feel === "technical"
          ? "clear, direct, metric-led"
          : "confident, punchy, decisive";

  const healthScore = asString(extracted.healthScore);
  const monthlyVisitors = asString(extracted.monthlyVisitors);
  const competitorName = asString(extracted.competitorName);
  const biggestOpp = asString(extracted.biggestOpportunity);
  const revenueProjection = formatMaybeCurrency(extracted.revenueProjection);
  const competitiveGapBullets = normalizeToBullets(extracted.competitiveGaps, 4);
  const nextStepBullets = normalizeToBullets(extracted.recommendedNextSteps, 4);
  const consultationUrl = client_profile.consultation_url ?? "#blueprint";

  const script = `Hi ${clientName} — it’s ${strategist_name}.

This is your personalized VantageStack report, and in the next few minutes I’m going to walk you through what we found, what it means, and what I’d recommend you do next. I’ll keep it conversational and practical.

Quick 30-second summary — website health and the biggest opportunity.
${healthScore ? `Your website health score is sitting at ${healthScore}.` : healthHook ? `At a high level, the headline is: ${healthHook}` : `At a high level, your site is doing a few things well, but there are some trust and conversion friction points holding performance back.`}
${monthlyVisitors ? `You’re currently getting around ${monthlyVisitors} monthly visitors, which is a solid base to work with.` : `You already have enough baseline attention to make meaningful gains without immediately spending more on traffic.`}
${biggestOpp ? `The biggest opportunity we see is: ${biggestOpp}.` : `The biggest opportunity is tightening your conversion journey so more of the people already landing on your site become enquiries.`}

Now let’s spend about a minute on competitive gaps — where competitors are out-positioning you, and what that’s costing you.
${competitorName ? `In your space, one of the key benchmarks we looked at is ${competitorName}.` : `We compared you against what a “top performer” in your category is doing online.`}
${competitiveGapBullets.length ? `Here are the gaps that matter most right now:\n${competitiveGapBullets.map((g) => `- ${g}`).join("\n")}` : gapsHook ? `The strongest gap signal in the report is: ${gapsHook}` : `The pattern is consistent: competitors are capturing higher-intent searches, presenting clearer trust signals, and making the next step easier — so they win the “ready to buy” traffic.`}
The practical takeaway is this: it’s not just “more traffic” — it’s better intent coverage and a cleaner path to action, so you win more of the demand that already exists.

Next: about 45 seconds on the revenue opportunity, with the numbers.
${revenueProjection ? `Based on the report’s projection, the revenue opportunity on the table is about ${revenueProjection}.` : revHook ? `The clearest revenue lever called out is: ${revHook}` : `The top revenue lever is conversion-rate lift — turning more of your existing visitors into qualified enquiries.`}
If you imagine even a modest improvement in how many visitors become leads — and then how quickly those leads get a response — the compounding effect is real. This is why we focus on systems, not just design.

Now: about 45 seconds on recommended next steps.
${nextStepBullets.length ? `Here’s the exact sequence I’d recommend:\n${nextStepBullets.map((s, i) => `- Step ${i + 1}: ${s}`).join("\n")}` : nextHook ? `I’d start with: ${nextHook}` : `I’d start by mapping your highest-intent journey end-to-end, then fixing the first two drop-off points and making your primary CTA impossible to miss.`}
The goal is simple: capture more high-intent demand, reduce friction, and put follow-up on rails so leads don’t go cold.

Closing and call to action.
If you want, we can turn this into a concrete plan and execute it with you. The next step is to book a consultation so we can validate the assumptions, confirm the numbers, and map the fastest wins for your business.
Go ahead and book your consult here: ${consultationUrl}

Thanks again, ${clientName} — and if you want, reply with your primary goal for the next 90 days, and we’ll tailor the plan around that.`;

  return {
    tone,
    script: script.trim(),
    sections_present: {
      health: Boolean(healthScore || health),
      competitive_gaps: Boolean(competitiveGapBullets.length || gaps),
      revenue_opportunity: Boolean(revenueProjection || revenue),
      next_step: Boolean(nextStepBullets.length || next),
    },
    duration_seconds_estimate: estimateSecondsFromScript(script),
  };
}

const CallElevenLabsInput = z.object({
  script: z.string().min(1),
  client_id: z.string().optional(),
  report_id: z.string().optional(),
  voice_id: z.string().default("Adam"), // "Adam" or "Rachel" recommended
  model_id: z.string().default("eleven_monolingual_v1"),
  output_format: z.enum(["mp3_44100_128", "mp3_44100_192"]).default("mp3_44100_128"),
  retries: z.number().int().min(0).max(2).default(2),
  retry_delay_ms: z.number().int().min(0).default(5000),
});

const GenerateVideoMetadataInput = z.object({
  company_name: z.string().min(1),
  strategist_name: z.string().optional(),
  tone: z.string().optional(),
  script: z.string().min(1),
  audio_url: z.string().optional(),
  voice_id: z.string().optional(),
});

const StoreVideoOutputInput = z.object({
  report_id: z.string().min(1),
  client_id: z.string().min(1),
  client_name: z.string().min(1),
  script: z.string().min(1),
  tone: z.string().optional(),
  voice_id: z.string().optional(),
  audio_url: z.string().min(1),
  duration_seconds_estimate: z.number().int().positive().optional(),
  source_report_hash: z.string().optional(),
});

async function ensureDirs() {
  await mkdir(join(repoRoot, "public", "generated-audio"), { recursive: true });
  await mkdir(join(repoRoot, "public", "reports"), { recursive: true });
  await mkdir(join(repoRoot, "data"), { recursive: true });
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    const txt = await readFile(path, "utf-8");
    return JSON.parse(txt) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function elevenlabsTextToSpeech(params: z.infer<typeof CallElevenLabsInput>) {
  const apiKey = getElevenLabsApiKey();
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is required (set it in .env.local)");
  }

  // Prefer a known-good voice ID when caller passes a name
  const voiceId =
    params.voice_id === "Rachel"
      ? "EXAVITQu4vr4xnSDxMaL"
      : params.voice_id === "Adam"
        ? "pNInz6obpgDQGcFmaJgB"
        : params.voice_id;

  let lastErr: unknown = null;
  let audio: Uint8Array | null = null;
  for (let attempt = 0; attempt <= params.retries; attempt++) {
    try {
      const res = await fetch(
        `${API_BASE}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(
          params.output_format
        )}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text: params.script,
            model_id: params.model_id,
          }),
        }
      );

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`ElevenLabs TTS failed: ${res.status} ${err}`);
      }

      audio = new Uint8Array(await res.arrayBuffer());
      break;
    } catch (e) {
      lastErr = e;
      if (attempt < params.retries) {
        await sleep(params.retry_delay_ms);
      }
    }
  }

  if (!audio) {
    throw lastErr instanceof Error ? lastErr : new Error("ElevenLabs TTS failed after retries");
  }

  await ensureDirs();

  const clientId = params.client_id ? safeSlug(params.client_id) : "unknown-client";
  const reportId = params.report_id ? safeSlug(params.report_id) : `report-${Date.now()}`;
  const relDir = join("reports", clientId);
  await mkdir(join(repoRoot, "public", relDir), { recursive: true });
  const fileName = `${reportId}.mp3`;
  const publicPath = join(repoRoot, "public", relDir, fileName);
  await writeFile(publicPath, audio);

  // URL is served by Next.js from /public
  const audioUrl = `/${relDir.replace(/\\/g, "/")}/${fileName}`;

  return { audio_url: audioUrl, voice_id: voiceId, bytes: audio.byteLength };
}

export async function storeVideoOutput(params: z.infer<typeof StoreVideoOutputInput>) {
  await ensureDirs();
  const dbPath = join(repoRoot, "data", "video-outputs.json");
  const existing = await readJsonFile<any[]>(dbPath, []);
  const reportsPath = join(repoRoot, "data", "reports.json");
  const reports = await readJsonFile<any[]>(reportsPath, []);

  const duration = params.duration_seconds_estimate ?? estimateSecondsFromScript(params.script);
  const id = `vo_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  const record = {
    id,
    created_at: new Date().toISOString(),
    report_id: params.report_id,
    client_id: params.client_id,
    client_name: params.client_name,
    script: params.script,
    tone: params.tone ?? null,
    voice_id: params.voice_id ?? null,
    audio_url: params.audio_url,
    duration_seconds_estimate: duration,
    source_report_hash: params.source_report_hash ?? null,
  };

  existing.unshift(record);
  await writeJsonFile(dbPath, existing);

  const idx = reports.findIndex((r) => r?.report_id === params.report_id);
  const updated = {
    ...(idx >= 0 ? reports[idx] : {}),
    report_id: params.report_id,
    client_id: params.client_id,
    client_name: params.client_name,
    video_url: params.audio_url,
    video_complete: true,
    updated_at: new Date().toISOString(),
  };
  if (idx >= 0) reports[idx] = updated;
  else reports.unshift(updated);
  await writeJsonFile(reportsPath, reports);

  return record;
}

function generateVideoMetadata(params: z.infer<typeof GenerateVideoMetadataInput>) {
  const duration = estimateSecondsFromScript(params.script);
  return {
    company_name: params.company_name,
    strategist_name: params.strategist_name ?? null,
    tone: params.tone ?? null,
    voice_id: params.voice_id ?? null,
    audio_url: params.audio_url ?? null,
    duration_seconds_estimate: duration,
    recommended_visuals: [
      { t: "0:00-0:15", scene: "Brand intro + company name overlay" },
      { t: "0:15-0:55", scene: "Website health highlights (score/metrics)" },
      { t: "0:55-1:30", scene: "Traffic gaps (missing pages, intent coverage)" },
      { t: "1:30-2:10", scene: "Top revenue lever (conversion lift)" },
      { t: "2:10-2:30", scene: "Next step CTA (blueprint / action plan)" },
    ],
  };
}

async function main() {
  await ensureDirs();

  const server = new Server(
    { name: "video-generator", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "write-video-script",
          description:
            "Turn report JSON + client profile into a ~4–5 minute personalized strategist-style video narration script (no bracket variables).",
          inputSchema: zodToJsonSchema(WriteVideoScriptInput),
        },
        {
          name: "call-elevenlabs-api",
          description:
            "Generate an MP3 narration file from a script via ElevenLabs TTS (retries up to 2x, 5s delay). Saves to /public/reports/{clientId}/{reportId}.mp3 and returns the URL path.",
          inputSchema: zodToJsonSchema(CallElevenLabsInput),
        },
        {
          name: "generate-video-metadata",
          description: "Create structured metadata for a generated video/audio output.",
          inputSchema: zodToJsonSchema(GenerateVideoMetadataInput),
        },
        {
          name: "store-video-output",
          description:
            "Persist the generated audio URL + script (data/video-outputs.json) and update a local reports table (data/reports.json) with video_url + video_complete=true.",
          inputSchema: zodToJsonSchema(StoreVideoOutputInput),
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params ?? {};

    if (name === "write-video-script") {
      const parsed = WriteVideoScriptInput.parse(args);
      const out = buildVideoScript(parsed);
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
    }

    if (name === "call-elevenlabs-api") {
      const parsed = CallElevenLabsInput.parse(args);
      const out = await elevenlabsTextToSpeech(parsed);
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
    }

    if (name === "generate-video-metadata") {
      const parsed = GenerateVideoMetadataInput.parse(args);
      const out = generateVideoMetadata(parsed);
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
    }

    if (name === "store-video-output") {
      const parsed = StoreVideoOutputInput.parse(args);
      const out = await storeVideoOutput(parsed);
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Keep alive; stdio transport holds process.
  if (existsSync(join(repoRoot, "package.json"))) {
    // no-op
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

