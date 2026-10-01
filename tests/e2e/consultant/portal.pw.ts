/**
 * Consultant Portal — browser E2E (Playwright, Chromium). NOT part of `npm test`: jest only
 * picks up `*.test.ts`, and this file is `*.pw.ts`. It drives the real production build
 * with every `/api/consultant/**` call served by an in-memory fake backend (page.route) and
 * the Twilio Voice SDK chunk swapped for a fake Device, so no database, Twilio or network
 * is needed.
 *
 * Run (Chromium must match the playwright-core version):
 *   npx next build
 *   CRM_JWT_SECRET=$SECRET npx next start -p 6686 &
 *   E2E_BASE_URL=http://localhost:6686 E2E_JWT_SECRET=$SECRET \
 *   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core \
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
 *   E2E_SHOTS=/tmp/qa-shots E2E_SHOTS_W2=/tmp/qa-shots-w2 \
 *   npx tsx --test tests/e2e/consultant/portal.pw.ts
 *
 * Wave 2 adds: Why Board, Performance + calculator, Leaderboard, Training, Settings, lead
 * workspace (SAST booking from a non-SA device, consent chip, manager payment), new-lead source
 * picker, Admin systems (dead letters + retry), wrap-up consent, and the service-worker offline
 * shell. Every wave-2 page is also checked for amber colours (Decision 1) and CLS < 0.05.
 */
import { createHmac, randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";

type PW = typeof import("playwright-core");
type Browser = import("playwright-core").Browser;
type BrowserContext = import("playwright-core").BrowserContext;
type Page = import("playwright-core").Page;
type Route = import("playwright-core").Route;

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:6686";
const SECRET = process.env.E2E_JWT_SECRET ?? "";
const SHOTS = process.env.E2E_SHOTS ?? join(process.cwd(), "data", "qa", "e2e-shots");
const CHROMIUM = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const require_ = createRequire(__filename);
const pw: PW = require_(process.env.PLAYWRIGHT_CORE ?? "playwright-core");

const ME = { memberId: "11111111-2222-4333-8444-555555555555", username: "alice", displayName: "Alice Consultant", role: "sales_consultant", isManager: false, canCall: true, permissions: ["use_consultant_portal"] };
/** A leader (role `admin`): manager + every wave-2 permission (confirm payments, system health, …). */
const ADMIN_ME = {
  memberId: "99999999-2222-4333-8444-555555555555",
  username: "kg",
  displayName: "KG Leader",
  role: "admin",
  isManager: true,
  canCall: true,
  permissions: ["use_consultant_portal", "view_clients", "confirm_payments", "manage_gamification", "view_system_health", "view_team_performance"],
};
type Identity = typeof ME;

const VIEWPORTS = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const;
type Vp = keyof typeof VIEWPORTS;

// ── Session cookie (same HS256 CRM JWT the login route issues) ────────────────
function memberJwt(who: Identity = ME): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = `${b64({ alg: "HS256" })}.${b64({ typ: "crm", role: who.role, un: who.username, sv: 0, sub: who.memberId, iat: now, exp: now + 3600 })}`;
  return `${head}.${createHmac("sha256", SECRET).update(head).digest("base64url")}`;
}

// ── Fake backend ─────────────────────────────────────────────────────────────
const iso = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString();
const DAY = 86_400_000;

function lead(i: number, stage: string, health: string, extra: Record<string, unknown> = {}) {
  return {
    id: `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, "0")}`,
    clinicName: ["Glow Aesthetics", "Skin Studio Rosebank", "Lumière Clinic", "Derma Point", "The Face Place", "Radiance Med Spa", "Bella Vita", "Pure Skin"][i % 8],
    contactName: ["Dr Naidoo", "Thandi M.", "Lerato K.", null][i % 4],
    contactRole: "Owner",
    phone: `+2782555${String(1000 + i)}`,
    email: null,
    website: "https://clinic.example",
    city: ["Cape Town", "Johannesburg", "Durban"][i % 3],
    source: "consultant_portal",
    vertical: "clinics",
    salesStage: stage,
    salesStageChangedAt: iso(i * DAY),
    lostReason: null,
    nextAction: i % 2 ? "Follow-up call" : null,
    nextActionAt: i % 2 ? iso(-3600_000) : null,
    dealValue: stage === "won" || stage === "proposal" ? 4500 : null,
    consultantId: i === 7 ? null : ME.memberId,
    consultantName: i === 7 ? null : ME.displayName,
    health,
    lastCallAt: iso(i * DAY),
    callCount: i,
    createdAt: iso(10 * DAY),
    ...extra,
  };
}

class Backend {
  me: Identity;
  constructor(me: Identity = ME) {
    this.me = me;
  }
  leads = [
    lead(0, "new", "green"),
    lead(1, "contacted", "yellow"),
    lead(2, "discovery_booked", "green"),
    lead(3, "demo_done", "red"),
    lead(4, "proposal", "yellow"),
    lead(5, "won", "green"),
    lead(6, "lost", "red"),
    lead(7, "new", "green"),
  ];
  notes: Record<string, unknown>[] = [
    { id: "bbbbbbbb-0000-4000-8000-000000000001", leadId: this.leads[1].id, callId: null, kind: "manual", body: "Owner prefers WhatsApp. Busy on Mondays.", version: 1, createdBy: ME.displayName, createdAt: iso(2 * DAY), updatedBy: null, updatedAt: null },
  ];
  revisions: Record<string, { version: number; body: string; editedBy: string; editedAt: string }[]> = {};
  calls: Record<string, Record<string, unknown>> = {};
  segments: { seq: number; speaker: "consultant" | "prospect"; text: string; at: string }[] = [];
  callStatus = "in_progress";
  requests: string[] = [];
  noteCreates: Record<string, unknown>[] = [];
  callPatches: Record<string, unknown>[] = [];
  cardEvents: string[] = [];

  say(speaker: "consultant" | "prospect", text: string) {
    this.segments.push({ seq: this.segments.length + 1, speaker, text, at: iso() });
  }

  // ── Wave 2 state (contract-shaped: lib/consultant/types.ts + the real route handlers) ──
  goals: Record<string, unknown>[] = [];
  meetings: Record<string, unknown>[] = [];
  meetingPosts: Record<string, unknown>[] = [];
  payments: Record<string, unknown>[] = [];
  uploadsIssued: string[] = [];
  trainingDone = new Set<string>(["vantagestack-method"]);
  deadEvents = [{ kind: "event", id: "dddddddd-0000-4000-8000-000000000001", type: "deal.paid", occurredAt: iso(3600_000), targets: ["n8n"], attempts: 8, lastError: "http_500" }];
  deadMessages = [
    { id: "dddddddd-0000-4000-8000-000000000002", audience: "lead", leadId: null, consultantId: null, channel: "whatsapp", template: "lead_proposal_nudge", status: "dead", attempts: 5, lastError: "twilio_21211", createdAt: iso(7200_000), sentAt: null },
  ];
  retried: string[] = [];
  calendars = [
    { provider: "google", accountEmail: null, status: "not_connected", connectedAt: null, lastError: null },
    { provider: "microsoft", accountEmail: null, status: "not_connected", connectedAt: null, lastError: null },
  ];

  static readonly TRAINING = [
    ["vantagestack-method", "The VantageStack method"],
    ["why-board", "Your Why Board"],
    ["call-flow-nepq", "Call flow & NEPQ"],
    ["coach-alex-live", "Coach Alex on a live call"],
    ["mobile-capture", "Capturing on mobile"],
    ["demo-to-paid", "Demo to paid"],
  ] as const;

  training() {
    return Backend.TRAINING.map(([id, title], i) => {
      const prev = i > 0 ? Backend.TRAINING[i - 1][0] : null;
      return { id, order: i + 1, title, summary: `${title} in eight seconds.`, videoUrl: null, durationSec: 8, completedAt: this.trainingDone.has(id) ? iso(DAY) : null, locked: !!prev && !this.trainingDone.has(prev) };
    });
  }

  funnel(period: string) {
    return {
      period, from: iso(30 * DAY), to: iso(),
      dials: 240, connects: 72, conversations: 41, talkTimeSec: 51_300, meetingsBooked: 14, meetingsHeld: 10, noShows: 3, proposals: 7, won: 6, paid: 5,
      revenuePaid: 72_500, commission: 18_125,
      rates: { connectRate: 0.3, connectToMeeting: 14 / 72, showRate: 10 / 13, meetingToPaid: 0.5, proposalToPaid: 5 / 7, closeFromDials: 5 / 240, closeFromConnects: 5 / 72 },
      avgSale: 14_500, salesCycleDays: 18.5, pipelineValue: 96_000, weightedPipeline: 41_250, velocityPerDay: 2_240,
      defaults: { connectRate: 0.3, avgSale: 15_000, commissionRate: 0.25, closeTargetFromConnects: 0.3 },
    };
  }

  settings = {
    quarterTarget: 225_000,
    tier1: { label: "Monthly Achiever", monthlyRevenue: 30_000, reward: "R500 Takealot voucher" },
    tier2: { label: "High Performer", monthlyRevenue: 75_000, reward: "R1 500 Takealot voucher" },
    tier3: { label: "Quarter Top Performer", topN: 3, minQuarterRevenue: 150_000, reward: "VantageStack branded apparel" },
    points: { dial: 1, connect: 2, meetingBooked: 10, meetingHeld: 15, proposal: 20, won: 40, paid: 100 },
    closeTargetFromConnects: 0.3,
  };

  leaderboardRows() {
    const tiers = (month: number, quarter: number, rank: number) => [
      { tier: "tier1_monthly_achiever", label: "Monthly Achiever", reward: "R500 Takealot voucher", periodKey: "2026-10", threshold: 30_000, current: month, progress: Math.min(1, month / 30_000), achieved: month >= 30_000 },
      { tier: "tier2_high_performer", label: "High Performer", reward: "R1 500 Takealot voucher", periodKey: "2026-10", threshold: 75_000, current: month, progress: Math.min(1, month / 75_000), achieved: month >= 75_000 },
      { tier: "tier3_quarter_top", label: "Quarter Top Performer", reward: "VantageStack branded apparel", periodKey: "2026-Q4", threshold: 150_000, current: quarter, progress: Math.min(1, quarter / 150_000), achieved: rank <= 3 && quarter >= 150_000 },
    ];
    const row = (consultantId: string, name: string, rank: number, revenuePaid: number, dealsPaid: number, points: number) => ({
      consultantId, name, rank, points, revenuePaid, dealsPaid, commission: Math.round(revenuePaid * 0.25),
      dials: 180 + rank * 10, connects: 50, meetingsBooked: 12, meetingsHeld: 9, closeFromDials: dealsPaid / 200, closeFromConnects: dealsPaid / 50,
      quarterTarget: 225_000, quarterProgress: Math.min(1, (revenuePaid * 2) / 225_000), tiers: tiers(revenuePaid, revenuePaid * 2, rank),
    });
    return [
      row("cccccccc-0000-4000-8000-000000000001", "Thando Mokoena", 1, 82_500, 6, 1_480),
      row(ME.memberId, ME.displayName, 2, 72_500, 5, 1_310),
      row("cccccccc-0000-4000-8000-000000000003", "Pieter van Wyk", 3, 15_000, 1, 640),
    ];
  }

  meeting(input: Record<string, unknown>) {
    const l = this.leads.find((x) => x.id === input.leadId)!;
    const start = String(input.startsAt);
    return {
      id: randomUUID(), leadId: l.id, clinicName: l.clinicName, consultantId: this.me.memberId, kind: input.kind, status: "scheduled",
      startsAt: start, endsAt: new Date(Date.parse(start) + Number(input.durationMin ?? 30) * 60_000).toISOString(), notes: input.notes ?? null,
      sync: { google: "not_connected", microsoft: "not_connected" }, createdAt: iso(),
    };
  }

  /** Wave-2 endpoints. Returns null when the path isn't one of them. */
  wave2(method: string, path: string, url: URL, bodyJson: () => Record<string, unknown>): { body: unknown; status?: number } | null {
    let m: RegExpMatchArray | null;
    const q = (k: string) => url.searchParams.get(k);
    if (path === "/leads/search" && method === "POST") {
      const b = bodyJson();
      const needle = String(b.q ?? "").toLowerCase();
      return { body: this.leads.filter((l) => !needle || l.clinicName.toLowerCase().includes(needle)) };
    }
    if ((m = path.match(/^\/leads\/([^/]+)\/claim$/))) {
      const l = this.leads.find((x) => x.id === m![1])!;
      Object.assign(l, { consultantId: this.me.memberId, consultantName: this.me.displayName });
      return { body: l };
    }
    if (path === "/meetings" && method === "GET") return { body: this.meetings.filter((x) => !q("leadId") || x.leadId === q("leadId")) };
    if (path === "/meetings" && method === "POST") {
      const b = bodyJson();
      this.meetingPosts.push(b);
      const mt = this.meeting(b);
      this.meetings.unshift(mt);
      return { body: mt, status: 201 };
    }
    if ((m = path.match(/^\/meetings\/([^/]+)$/)) && method === "PATCH") {
      const mt = this.meetings.find((x) => x.id === m![1])!;
      Object.assign(mt, bodyJson());
      return { body: mt };
    }
    if (path === "/calendar" && method === "GET") return { body: this.calendars };
    if ((m = path.match(/^\/calendar\/(google|microsoft)$/)) && method === "DELETE") return { body: this.calendars };
    if (path === "/uploads" && method === "POST") {
      const b = bodyJson();
      const ext = String(b.contentType).split("/")[1].replace("jpeg", "jpg");
      const p = `${b.purpose}/${this.me.memberId}/${randomUUID()}.${ext}`;
      this.uploadsIssued.push(p);
      return { body: { path: p, uploadUrl: `${BASE}/__qa_upload/${p}`, expiresAt: iso(-600_000) }, status: 201 };
    }
    if (path === "/goals" && method === "GET") return { body: this.goals };
    if (path === "/goals" && method === "POST") {
      const b = bodyJson();
      const g = {
        id: randomUUID(), consultantId: this.me.memberId, consultantName: this.me.displayName, title: b.title, why: b.why ?? "", targetDate: b.targetDate, metric: b.metric, targetValue: b.targetValue,
        currentValue: 18_125, progress: Math.min(1, 18_125 / Number(b.targetValue)),
        dailyPlan: { dealsNeeded: 4, connectsNeeded: 14, dialsNeeded: 47, perDay: { dials: 3, connects: 1, deals: 0.24 }, revenue: 60_000, commission: 15_000 },
        imageUrl: b.imagePath ? `${BASE}/__qa_img/${b.imagePath}` : null, createdAt: iso(), updatedAt: null, imagePath: b.imagePath ?? null,
      };
      this.goals.push(g);
      return { body: g, status: 201 };
    }
    if ((m = path.match(/^\/goals\/([^/]+)$/))) {
      const i = this.goals.findIndex((x) => x.id === m![1]);
      if (method === "DELETE") {
        this.goals.splice(i, 1);
        return { body: null, status: 204 };
      }
      Object.assign(this.goals[i], bodyJson());
      return { body: this.goals[i] };
    }
    if (path === "/metrics") {
      const period = q("period") ?? "month";
      if (q("consultantId") === "team") {
        const f = this.funnel(period);
        return { body: { team: f, byConsultant: this.leaderboardRows().map((r) => ({ ...this.funnel(period), consultantId: r.consultantId, name: r.name, revenuePaid: r.revenuePaid, paid: r.dealsPaid })) } };
      }
      return { body: this.funnel(period) };
    }
    if (path === "/leaderboard") return { body: { period: q("period") ?? "month", rankedBy: q("rankBy") ?? "points", rows: this.leaderboardRows(), generatedAt: iso() } };
    if (path === "/settings/gamification") {
      if (method === "PUT") this.settings = bodyJson() as typeof this.settings;
      return { body: this.settings };
    }
    if (path === "/rewards") return { body: [] };
    if ((m = path.match(/^\/deals\/([^/]+)\/payment$/))) {
      const b = bodyJson();
      this.payments.push(b);
      const l = this.leads.find((x) => x.id === m![1])! as Record<string, unknown>;
      const deal = {
        ...(l.deal as object), status: "paid", paidAt: b.paidAt, paymentAmount: b.amount, paymentReference: b.reference, hasProof: !!b.proofPath,
        confirmedByName: this.me.displayName, commissionRate: 0.25, commissionAmount: Math.round(Number(b.amount) * 0.25),
      };
      Object.assign(l, { deal, salesStage: "paid" });
      return { body: deal };
    }
    if (path === "/training" && method === "GET") return { body: this.training() };
    if ((m = path.match(/^\/training\/([^/]+)\/complete$/))) {
      const mod = this.training().find((x) => x.id === m![1]);
      if (!mod) return { body: { error: "Module not found." }, status: 404 };
      if (mod.locked) return { body: { error: "Finish the previous module first." }, status: 409 };
      this.trainingDone.add(mod.id);
      return { body: this.training() };
    }
    if (path === "/messages") return { body: [] };
    if (path === "/admin/health") {
      return {
        body: {
          checkedAt: iso(), database: { ok: true, latencyMs: 12 }, twilio: { configured: true }, anthropic: { configured: true },
          n8n: { configured: true, lastDeliveryAt: iso(60_000), pending: 2, dead: this.deadEvents.length }, emmaOwner: { configured: true, lastDeliveryAt: iso(60_000), pending: 0, dead: 0 },
          emmaMessages: { queued: 3, failed24h: 0, dead: this.deadMessages.length }, calendars: { connected: 4, errors: 0 }, summaries: { pending: 1, failed: 0 },
        },
      };
    }
    // The REAL server shape (lib/consultant/server/events/health.ts → DeadLetters).
    if (path === "/admin/dead-letters") return { body: { events: this.deadEvents, messages: this.deadMessages } };
    if ((m = path.match(/^\/admin\/dead-letters\/(event|message)\/([^/]+)\/retry$/))) {
      this.retried.push(`${m[1]}:${m[2]}`);
      if (m[1] === "event") this.deadEvents = this.deadEvents.filter((e) => e.id !== m![2]);
      else this.deadMessages = this.deadMessages.filter((e) => e.id !== m![2]);
      return { body: { ok: true, requeued: 1 } };
    }
    return null;
  }

  async handle(route: Route): Promise<void> {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api\/consultant/, "");
    const method = req.method();
    this.requests.push(`${method} ${path}${url.search}`);
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    const bodyJson = () => (req.postData() ? JSON.parse(req.postData()!) : {});
    let m: RegExpMatchArray | null;

    if (path === "/me") return json(this.me);
    if (path === "/stats/today") return json({ dials: 14, connects: 6, talkTimeSec: 2710, discoveryBooked: 2, demosBooked: 1, dueFollowUps: 3 });
    if (path === "/leads" && method === "GET") {
      const scope = url.searchParams.get("scope");
      const stage = url.searchParams.get("stage");
      return json(this.leads.filter((l) => (scope === "pool" ? !l.consultantId : scope === "mine" ? l.consultantId === ME.memberId : true) && (!stage || l.salesStage === stage)));
    }
    if (path === "/leads" && method === "POST") {
      const input = bodyJson();
      const created = lead(this.leads.length, "new", "green", { ...input, id: randomUUID() });
      this.leads.push(created);
      return json(created, 201);
    }
    if ((m = path.match(/^\/leads\/([^/]+)$/)) && method === "GET") {
      const l = this.leads.find((x) => x.id === m![1]);
      if (!l) return json({ error: "Lead not found." }, 404);
      return json({ lead: l, calls: Object.values(this.calls).filter((c) => c.leadId === l.id), notes: this.notes.filter((n) => n.leadId === l.id) });
    }
    if ((m = path.match(/^\/leads\/([^/]+)$/)) && method === "PATCH") {
      const l = this.leads.find((x) => x.id === m![1])!;
      Object.assign(l, bodyJson());
      return json(l);
    }
    if (path === "/voice/token") return json({ token: "fake.jwt.token", identity: `consultant_${ME.memberId}`, expiresAt: iso(-3600_000) });
    if (path === "/calls" && method === "POST") {
      const { leadId } = bodyJson();
      const l = this.leads.find((x) => x.id === leadId)!;
      const call = { id: randomUUID(), leadId, consultantId: ME.memberId, consultantName: ME.displayName, toNumber: l.phone, status: "initiated", startedAt: iso(), answeredAt: null, endedAt: null, durationSec: null, hasRecording: false, disposition: null, nextAction: null, nextActionAt: null, summaryStatus: "pending", summary: null };
      this.calls[call.id] = call;
      return json(call, 201);
    }
    if ((m = path.match(/^\/calls\/([^/]+)\/live$/))) {
      const after = Number(url.searchParams.get("after") ?? 0);
      const segs = this.segments.filter((s) => s.seq > after);
      return json({ status: this.callStatus, segments: segs, lastSeq: segs.length ? segs[segs.length - 1].seq : after, ended: this.callStatus === "completed", pollMs: 400 });
    }
    if ((m = path.match(/^\/calls\/([^/]+)\/cards$/))) {
      for (const e of bodyJson().events ?? []) this.cardEvents.push(`${e.cardId}:${e.action}`);
      return route.fulfill({ status: 204 });
    }
    if ((m = path.match(/^\/calls\/([^/]+)\/summarise$/))) return json(this.calls[m[1]], 202);
    if ((m = path.match(/^\/calls\/([^/]+)$/)) && method === "GET") {
      const call = this.calls[m[1]];
      if (!call) return json({ error: "Call not found." }, 404);
      const l = this.leads.find((x) => x.id === call.leadId);
      return json({ call, lead: l, transcript: this.segments, notes: [] });
    }
    if ((m = path.match(/^\/calls\/([^/]+)$/)) && method === "PATCH") {
      const p = bodyJson();
      this.callPatches.push(p);
      Object.assign(this.calls[m[1]], p);
      return json(this.calls[m[1]]);
    }
    if (path === "/notes" && method === "POST") {
      const input = bodyJson();
      this.noteCreates.push(input);
      const existing = this.notes.find((n) => input.clientId && n.clientRequestId === input.clientId);
      if (existing) return json(existing, 201);
      const note = { id: randomUUID(), leadId: input.leadId, callId: input.callId ?? null, kind: "manual", body: input.body, version: 1, createdBy: ME.displayName, createdAt: iso(), updatedBy: null, updatedAt: null, clientRequestId: input.clientId };
      this.notes.unshift(note);
      return json(note, 201);
    }
    if ((m = path.match(/^\/notes\/([^/]+)$/)) && method === "PATCH") {
      const note = this.notes.find((n) => n.id === m![1])!;
      const p = bodyJson();
      if (p.baseVersion !== note.version) return json({ error: "This note was changed by someone else.", fields: { baseVersion: "stale" } }, 409);
      const revs = (this.revisions[note.id] ??= [{ version: 1, body: note.body as string, editedBy: note.createdBy as string, editedAt: note.createdAt as string }]);
      Object.assign(note, { body: p.body, version: (note.version as number) + 1, updatedBy: ME.displayName, updatedAt: iso() });
      revs.unshift({ version: note.version as number, body: p.body, editedBy: ME.displayName, editedAt: note.updatedAt as string });
      return json(note);
    }
    if ((m = path.match(/^\/notes\/([^/]+)\/revisions$/))) return json(this.revisions[m[1]] ?? []);
    const w2 = this.wave2(method, path, url, bodyJson);
    if (w2) return json(w2.body, w2.status ?? 200);
    return json({ error: "Not found." }, 404);
  }
}

// ── Fake Twilio Voice SDK (replaces the dynamically imported webpack chunk) ────
function sdkChunk(): { file: string; body: string } {
  const dir = join(process.cwd(), ".next", "static", "chunks");
  const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
  const file = files.find((f) => readFileSync(join(dir, f), "utf8").includes("voice-js"));
  assert.ok(file, "Twilio SDK chunk not found in .next/static/chunks — run `next build` first");
  const chunkId = readFileSync(join(dir, file!), "utf8").match(/push\(\[\[(\d+)\]/)![1];
  let moduleId: string | null = null;
  for (const f of files) {
    const mm = readFileSync(join(dir, f), "utf8").match(new RegExp(`\\.e\\(${chunkId}\\)\\.then\\(\\w+\\.bind\\(\\w+,(\\d+)\\)`));
    if (mm) moduleId = mm[1];
  }
  assert.ok(moduleId, "loader for the Twilio SDK chunk not found");
  const body = `(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[${chunkId}],{${moduleId}:(e,t,n)=>{n.r(t);n.d(t,{Device:()=>window.__FakeTwilio.Device,Call:()=>window.__FakeTwilio.Call})}}]);`;
  return { file, body };
}

const FAKE_TWILIO_INIT = `(() => {
  class Emitter { constructor(){ this.h = {}; } on(e, f){ (this.h[e] ||= []).push(f); return this; } emit(e, ...a){ (this.h[e] || []).forEach(f => f(...a)); } }
  class Call extends Emitter {
    constructor(){ super(); this.muted = false; window.__fakeCall = this; setTimeout(() => this.emit("ringing"), 50); setTimeout(() => this.emit("accept"), 200); }
    disconnect(){ setTimeout(() => this.emit("disconnect"), 10); }
    mute(m){ this.muted = m; this.emit("mute", m); }
    isMuted(){ return this.muted; }
  }
  Call.Codec = { Opus: "opus", PCMU: "pcmu" };
  class Device extends Emitter {
    constructor(token){ super(); this.token = token; }
    async connect(opts){ window.__connectParams = opts; return new Call(); }
    updateToken(t){ this.token = t; }
    destroy(){}
  }
  window.__FakeTwilio = { Device, Call };
  // Playwright can't intercept navigator.sendBeacon; returning false makes the app use its
  // keepalive-fetch fallback, which the fake backend does see (card telemetry assertions).
  try { Object.defineProperty(Navigator.prototype, "sendBeacon", { configurable: true, value: () => false }); } catch {}
  // Microphone: resolve with a silent stream so no permission prompt is needed.
  // A real (silent) audio track: something in the app bundle wraps getUserMedia and rejects a
  // stream without the requested audio track.
  const gum = async () => new AudioContext().createMediaStreamDestination().stream;
  if (window.MediaDevices) Object.defineProperty(MediaDevices.prototype, "getUserMedia", { configurable: true, value: gum });
  if (navigator.mediaDevices) Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, writable: true, value: gum });
  // Layout-shift accounting for the live-call screen.
  window.__cls = 0; window.__shifts = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) { window.__cls += e.value; window.__shifts.push({ t: e.startTime, v: e.value, n: (e.sources || []).map(s => s.node && s.node.className ? String(s.node.className).slice(0, 60) : String(s.node && s.node.nodeName)) }); }
    }).observe({ type: "layout-shift", buffered: true });
  } catch {}
})();`;

// ── Harness ───────────────────────────────────────────────────────────────────
let browser: Browser;
/** Contexts offline or closing (their failed requests — e.g. an unload beacon — are expected). */
const ctxOffline = new WeakSet<BrowserContext>();
const consoleProblems: string[] = [];

/** A 1×1 PNG for stubbed Why Board images. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

type OpenOpts = { timezoneId?: string; serviceWorkers?: "allow" | "block" };

async function open(vp: Vp, backend: Backend, opts: OpenOpts = {}): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    ...VIEWPORTS[vp],
    baseURL: BASE,
    reducedMotion: "no-preference",
    // Blocked by default so ctx.route sees every request (a worker would serve cached chunks —
    // e.g. the real Twilio SDK — around the fakes). The offline test opts in.
    serviceWorkers: opts.serviceWorkers ?? "block",
    ...(opts.timezoneId ? { timezoneId: opts.timezoneId } : {}),
  });
  await ctx.addCookies([{ name: "vs_admin_session", value: memberJwt(backend.me), url: BASE }]);
  // Signed-URL stand-ins (same origin, so the real CSP applies): the upload PUT and the image view.
  await ctx.route("**/__qa_upload/**", (r) => r.fulfill({ status: 200, body: "" }));
  await ctx.route("**/__qa_img/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await ctx.addInitScript(FAKE_TWILIO_INIT);
  const sdk = sdkChunk();
  await ctx.route(`**/_next/static/chunks/${sdk.file}`, (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: sdk.body }));
  await ctx.route("**/api/consultant/**", (r) => backend.handle(r));
  // Nothing may leave the machine: fonts / Twilio / anything external is aborted.
  await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  const page = await ctx.newPage();
  page.on("console", (msg) => {
    const text = msg.text();
    if (/^Failed to load resource/.test(text)) return; // reported precisely by the request hooks below
    // Offline on purpose: Next logs failed link prefetches, which is the expected degraded mode.
    if (ctxOffline.has(ctx) && /Failed to fetch RSC payload/.test(text)) return;
    if (msg.type() === "error" || /hydrat/i.test(text)) consoleProblems.push(`[${vp}] ${msg.type()}: ${text}`);
  });
  page.on("pageerror", (e) => consoleProblems.push(`[${vp}] pageerror: ${e.message}`));
  // Aborted external requests (web fonts) are expected offline; anything same-origin failing is not.
  page.on("requestfailed", (r) => {
    // Next aborts in-flight RSC prefetches when a navigation starts, and Chromium reports the
    // card-telemetry flush sent while the call page unmounts as ERR_ABORTED even though the
    // fake backend received it (the live-call test asserts every card event arrived).
    // ERR_ABORTED on a GET = the page cancelled it (navigation / unmount), not a failure.
    const benign = r.url().includes("_rsc=") || (r.failure()?.errorText === "net::ERR_ABORTED" && (r.method() === "GET" || /\/cards$/.test(r.url())));
    if (r.url().startsWith(BASE) && !ctxOffline.has(ctx) && !benign) consoleProblems.push(`[${vp}] requestfailed: ${r.method()} ${r.url().replace(BASE, "")} ${r.failure()?.errorText ?? ""}`);
  });
  page.on("response", (r) => {
    // /images/vs-logo.png: the ROOT layout's favicon is missing from public/ (pre-existing, not portal).
    if (r.url().startsWith(BASE) && r.status() >= 400 && !r.url().includes("/api/consultant/") && !r.url().endsWith("/images/vs-logo.png")) consoleProblems.push(`[${vp}] ${r.status()}: ${r.url().replace(BASE, "")}`);
  });
  return { ctx, page };
}

const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: false });

const SHOTS_W2 = process.env.E2E_SHOTS_W2 ?? join(SHOTS, "w2");
const shotW2 = (page: Page, name: string) => page.screenshot({ path: join(SHOTS_W2, `${name}.png`), fullPage: false });

/** Wait for the page to go quiet (data loaded, animations settled). */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600);
}

/** Cumulative layout shift of the current document (observer installed by FAKE_TWILIO_INIT). */
const clsOf = (page: Page) => page.evaluate(() => (window as unknown as { __cls: number }).__cls);

/**
 * Design rule (Decision 1): no amber anywhere. Every visible element's computed colours
 * (text, background, borders, outline, SVG fill/stroke, shadows, gradients) are converted to HSL;
 * any colour with hue 30–48° and saturation > 50% fails — except the deal-health yellow
 * (#FACC15) on an element that is (or sits inside) a "Watch" / medium-churn indicator.
 */
const AMBER_JS = String.raw`
    const out = [];
    const nums = (s) => {
      const res = [];
      for (const m of s.matchAll(/rgba?\(([^)]+)\)/g)) {
        const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
        if (p.length >= 3) res.push([p[0], p[1], p[2], p.length > 3 ? p[3] : 1]);
      }
      for (const m of s.matchAll(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/g)) {
        res.push([Number(m[1]) * 255, Number(m[2]) * 255, Number(m[3]) * 255, m[4] ? Number(m[4]) : 1]);
      }
      return res;
    };
    const hsl = (r, g, b) => {
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
      if (d === 0) return { h: 0, s: 0, l };
      const s = d / (1 - Math.abs(2 * l - 1));
      let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
      return { h, s, l };
    };
    const isHealthYellow = ([r, g, b]) => Math.abs(r - 250) <= 2 && Math.abs(g - 204) <= 2 && Math.abs(b - 21) <= 2;
    const healthContext = (el) => {
      let e = el;
      for (let i = 0; e && i < 5; i++, e = e.parentElement) {
        const t = (e.textContent || "") + " " + (e.getAttribute("aria-label") || "") + " " + (e.getAttribute("title") || "");
        if (/\bWatch\b|Medium churn/i.test(t)) return true;
      }
      return false;
    };
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      if (!el.getClientRects().length) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
      const props = [["color", cs.color], ["background-color", cs.backgroundColor], ["background-image", cs.backgroundImage], ["box-shadow", cs.boxShadow]];
      for (const side of ["top", "right", "bottom", "left"]) {
        if (parseFloat(cs.getPropertyValue("border-" + side + "-width")) > 0 && cs.getPropertyValue("border-" + side + "-style") !== "none") props.push(["border-" + side, cs.getPropertyValue("border-" + side + "-color")]);
      }
      if (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) props.push(["outline", cs.outlineColor]);
      if (el instanceof SVGElement) props.push(["fill", cs.fill], ["stroke", cs.stroke]);
      for (const [prop, value] of props) {
        for (const c of nums(value)) {
          if (c[3] < 0.05) continue;
          const { h, s } = hsl(c[0], c[1], c[2]);
          if (h >= 30 && h <= 48 && s > 0.5) {
            if (isHealthYellow(c) && healthContext(el)) continue;
            const label = el.tagName.toLowerCase() + "." + String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || "").slice(0, 50) + " " + prop + "=" + value.slice(0, 60) + " \"" + (el.textContent || "").trim().slice(0, 30) + "\"";
            out.push(label);
          }
        }
      }
    }
    return Array.from(new Set(out)).slice(0, 10);
  `;
/** Runs in the page as a plain string (tsx's keepNames helpers don't exist in the browser). */
const AMBER_SCAN = `(() => {${AMBER_JS}})()`;

async function assertNoAmber(page: Page, where: string): Promise<void> {
  const found = (await page.evaluate(AMBER_SCAN)) as string[];
  assert.deepEqual(found, [], `${where}: amber/orange colour found`);
}

/** Every wave-2 page gets the same three checks: no amber, CLS < 0.05, and a screenshot. */
async function checkPage(page: Page, vp: Vp, name: string): Promise<void> {
  await settle(page);
  await assertNoAmber(page, `${vp} ${name}`);
  const cls = await clsOf(page);
  assert.ok(cls < 0.05, `${vp} ${name}: CLS ${cls.toFixed(3)} ≥ 0.05 — ${JSON.stringify(await page.evaluate(() => (window as unknown as { __shifts: unknown }).__shifts))}`);
  await shotW2(page, `${vp}-${name}`);
}

/** A wave-2 lead: provenance, consent, score and deal included like GET leads/[id] returns. */
function w2Lead(i: number, stage: string, extra: Record<string, unknown> = {}) {
  return lead(i, stage, "yellow", {
    id: `eeeeeeee-0000-4000-8000-${String(i).padStart(12, "0")}`,
    clinicName: `W2 Clinic ${i}`,
    email: "reception@w2clinic.example",
    source: "public_scrape",
    sourceUrl: "https://maps.example/place/1",
    sourcedAt: iso(20 * DAY),
    messagingConsent: "none",
    score: { winProbability: 0.42, churnRisk: 0.48, churnBand: "medium", clv: 162_000, factors: [{ label: "Demo held", impact: 0.12 }, { label: "No contact in 9 days", impact: -0.08 }], model: "heuristic-v1" },
    deal: null,
    ...extra,
  });
}

/** Today's SAST calendar date shifted by `days` (YYYY-MM-DD). */
function sastDate(days = 0): string {
  return new Date(Date.now() + 2 * 3_600_000 + days * DAY).toISOString().slice(0, 10);
}

describe("Consultant Portal E2E", { skip: !SECRET && "E2E_JWT_SECRET not set" }, () => {
  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
    mkdirSync(SHOTS_W2, { recursive: true });
    browser = await pw.chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  });
  after(async () => {
    await browser?.close();
  });

  for (const vp of ["phone", "desktop"] as Vp[]) {
    test(`${vp}: Today, Pipeline, New lead validation`, async () => {
      const backend = new Backend();
      const { ctx, page } = await open(vp, backend);
      try {
        await page.goto("/consultant");
        await page.getByText("Call next").first().waitFor();
        await page.waitForLoadState("networkidle");
        await shot(page, `${vp}-today`);

        await page.goto("/consultant/pipeline");
        await page.getByText(backend.leads[3].clinicName).first().waitFor();
        if (vp === "desktop") {
          for (const label of ["New", "Contacted", "Proposal", "Won"]) assert.ok(await page.getByText(label, { exact: true }).first().isVisible(), `kanban column ${label}`);
        } else {
          const tabs = page.getByRole("tablist", { name: "Stage" });
          await tabs.waitFor();
          await tabs.getByRole("tab").nth(1).click();
        }
        await page.waitForTimeout(300);
        await shot(page, `${vp}-pipeline`);

        await page.goto("/consultant/leads/new");
        await page.getByLabel("Clinic name").waitFor();
        await page.getByRole("textbox", { name: /^Phone/ }).fill("12");
        await page.getByRole("button", { name: "Save clinic" }).click();
        await page.getByText("Enter a South African number (+27 or 0…)").first().waitFor();
        await page.getByText("Clinic name is required").first().waitFor();
        assert.equal(backend.requests.filter((r) => r.startsWith("POST /leads")).length, 0, "invalid form must not POST");
        if (vp === "phone") await shot(page, `${vp}-new-lead-validation`);
      } finally {
        ctxOffline.add(ctx);
        await ctx.close();
      }
    });

    test(`${vp}: Lead workspace — edit a note → "Edited by … · time" + History; offline note queues then syncs`, async () => {
      const backend = new Backend();
      const { ctx, page } = await open(vp, backend);
      const l = backend.leads[1];
      try {
        await page.goto(`/consultant/leads/${l.id}`);
        await page.getByText("Owner prefers WhatsApp").waitFor();
        await page.getByRole("button", { name: /Edit note from/ }).first().click();
        const editor = page.getByLabel("Edit note");
        await editor.fill("Owner prefers WhatsApp. Busy on Mondays. Demo booked for Thursday.");
        await page.getByRole("button", { name: "Save", exact: true }).click();
        await page.getByText(/Edited by/).first().waitFor();
        assert.match(await page.getByText(/Edited by/).first().innerText(), /Edited by Alice Consultant ·/);
        await page.getByText(/History/).first().click();
        await page.getByText("Owner prefers WhatsApp. Busy on Mondays.", { exact: true }).last().waitFor();
        await shot(page, `${vp}-lead-workspace`);

        // Offline: banner, note saved on the device, nothing sent; online → synced.
        await ctx.setOffline(true);
        ctxOffline.add(ctx);
        await page.getByText(/You're offline/).first().waitFor();
        await page.getByPlaceholder("Add a note…").fill("Left a voicemail — no signal in the parking lot.");
        await page.getByRole("button", { name: "Save offline" }).click();
        await page.getByText(/Waiting for signal|1 waiting/).first().waitFor();
        assert.equal(backend.noteCreates.length, 0, "no network write while offline");
        if (vp === "phone") await shot(page, `${vp}-offline-queued`);
        await ctx.setOffline(false);
        ctxOffline.delete(ctx);
        await page.waitForFunction(() => !document.body.innerText.includes("Waiting for signal"), undefined, { timeout: 10_000 });
        await page.getByText("Left a voicemail — no signal in the parking lot.").first().waitFor();
        assert.equal(backend.noteCreates.length, 1, "queued note synced exactly once");
        assert.ok(backend.noteCreates[0].clientId, "offline create carries a clientId for idempotent replay");
      } finally {
        ctxOffline.add(ctx);
        await ctx.close();
      }
    });

    test(`${vp}: live call — high-risk then stall cards with no layout shift; wrap-up`, async () => {
      const backend = new Backend();
      const { ctx, page } = await open(vp, backend);
      const l = backend.leads[0];
      try {
        await page.goto(`/consultant/leads/${l.id}`);
        const callBtn = page.getByRole("button", { name: /^Call$/ }).first();
        await callBtn.waitFor();
        await page.waitForTimeout(1800); // let the SDK warm-up fetch our fake chunk
        await callBtn.click();
        await page.waitForURL(/\/consultant\/call\//);
        const connectParams = await page.evaluate(() => (window as unknown as { __connectParams: unknown }).__connectParams);
        assert.deepEqual(Object.keys((connectParams as { params: object }).params), ["CallId"], "the browser sends only the CallId, never a number");
        assert.ok(!JSON.stringify(backend.requests).includes(l.phone), "the browser never sends the lead's number");

        backend.say("consultant", "Hi, it's Alice from Vantage Stack — have I caught you at a bad time?");
        backend.say("prospect", "Hello, speaking.");
        await page.waitForTimeout(1500);

        const bar = page.locator("header").first();
        const boxBefore = await bar.boundingBox();
        const hangBefore = await page.getByRole("button", { name: /Hang up/i }).first().boundingBox();
        const clsBefore = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);

        backend.say("prospect", "Honestly, that's too expensive for a small clinic like ours.");
        const card = page.getByText(/Too expensive/).first();
        await card.waitFor({ timeout: 8000 });
        await page.getByText("High risk").first().waitFor();
        await page.getByText(/Heard:/).first().waitFor();
        assert.match(await page.getByText(/Heard:/).first().innerText(), /too expensive/i);
        if (vp === "phone") {
          const tabs = page.getByRole("tablist", { name: "Coaching steps" });
          assert.deepEqual(await tabs.getByRole("tab").allInnerTexts(), ["Listen", "Ask", "Reframe", "Confirm"]);
          await tabs.getByRole("tab", { name: "Ask" }).click();
          assert.equal(await tabs.getByRole("tab", { name: "Ask" }).getAttribute("aria-selected"), "true");
          // Swipe left on the panel → next step (Reframe).
          const panel = page.getByRole("tabpanel").first();
          const pb = (await panel.boundingBox())!;
          await page.mouse.move(pb.x + pb.width * 0.8, pb.y + 60);
          await page.mouse.down();
          await page.mouse.move(pb.x + pb.width * 0.2, pb.y + 60, { steps: 8 });
          await page.mouse.up();
          await page.waitForTimeout(400);
          assert.equal(await tabs.getByRole("tab", { name: "Reframe" }).getAttribute("aria-selected"), "true", "swipe moves to the next step");
          await tabs.getByRole("tab", { name: "Listen" }).click();
        }
        await page.waitForTimeout(500);
        await shot(page, `${vp}-live-high-risk`);

        const boxAfter = await bar.boundingBox();
        const hangAfter = await page.getByRole("button", { name: /Hang up/i }).first().boundingBox();
        const clsAfter = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
        assert.deepEqual(boxAfter, boxBefore, "call bar did not move");
        assert.deepEqual(hangAfter, hangBefore, "hang-up button did not move");
        assert.ok(clsAfter - clsBefore < 0.01, `card arrival caused layout shift ${clsAfter - clsBefore}`);

        await page.getByRole("button", { name: /Used it/ }).first().click();
        backend.say("prospect", "Look, just send me some info and I'll have a look.");
        await page.getByText(/Send me some info/).first().waitFor({ timeout: 8000 });
        await page.getByText("Stall").first().waitFor();
        await page.waitForTimeout(500);
        await shot(page, `${vp}-live-stall`);
        const clsStall = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
        assert.ok(clsStall - clsBefore < 0.01, `stall card caused layout shift ${clsStall - clsBefore}`);

        // Hang up → wrap-up sheet.
        await page.getByRole("button", { name: /Hang up/i }).first().click();
        backend.callStatus = "completed";
        await page.getByRole("radiogroup", { name: "Outcome" }).waitFor();
        await page.getByText("Coach Alex is writing your summary…").first().waitFor();
        await page.waitForTimeout(400);
        await shot(page, `${vp}-wrap-up`);
        await page.getByRole("radiogroup", { name: "Outcome" }).getByText("Demo booked").click();
        const save = page.getByRole("button", { name: /^Save/ }).last();
        await save.click();
        await page.waitForURL((u) => !u.pathname.startsWith("/consultant/call/"), { timeout: 10_000 });
        assert.equal(backend.callPatches.length, 1);
        assert.equal(backend.callPatches[0].disposition, "demo_booked");
        // The unmount flush is a keepalive request that can land after the navigation; give it time.
        const want = ["obj-price:shown", "obj-price:used", "obj-send-info:shown"];
        for (let i = 0; i < 50 && !want.every((ev) => backend.cardEvents.includes(ev)); i++) await page.waitForTimeout(100);
        for (const ev of want) {
          assert.ok(backend.cardEvents.includes(ev), `card telemetry ${ev} delivered (got ${backend.cardEvents.join(",")})`);
        }
      } catch (e) {
        await shot(page, `${vp}-FAILED-live-call`).catch(() => undefined);
        console.error("requests:", backend.requests.join(" | "), "\nproblems:", consoleProblems.join(" | "));
        throw e;
      } finally {
        ctxOffline.add(ctx);
        await ctx.close();
      }
    });

    // ── Wave 2 ────────────────────────────────────────────────────────────────

    test(`${vp}: Why Board — create a goal with a picture (upload via signed URL)`, async () => {
      const backend = new Backend();
      const { ctx, page } = await open(vp, backend);
      try {
        await page.goto("/consultant/why");
        await page.getByRole("button", { name: /Add your first goal/ }).click();
        await page.getByLabel("What are you working toward?").fill("Deposit on our first home");
        await page.getByLabel("Why does it matter to you?").fill("So the kids grow up with a garden.");
        await page.locator('input[type="file"]').setInputFiles({ name: "house.png", mimeType: "image/png", buffer: PNG });
        await page.getByLabel("Target (R)").fill("60000");
        await page.getByLabel("Target date date").fill(sastDate(60));
        await page.getByRole("button", { name: "Add to my Why Board" }).click();
        await page.getByText("Deposit on our first home").first().waitFor();
        assert.equal(backend.uploadsIssued.length, 1, "one signed upload ticket");
        assert.match(backend.uploadsIssued[0], new RegExp(`^goal_image/${ME.memberId}/[0-9a-f-]{36}\\.png$`));
        const posted = backend.goals[0] as { imagePath: string; metric: string; targetValue: number };
        assert.equal(posted.imagePath, backend.uploadsIssued[0], "the goal carries the uploaded path, not a URL");
        assert.equal(posted.targetValue, 60000);
        const img = page.locator(`img[src*="__qa_img"]`).first();
        await img.waitFor();
        assert.ok(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), "goal picture rendered");
        await checkPage(page, vp, "why");
      } finally {
        ctxOffline.add(ctx);
        await ctx.close();
      }
    });

    test(`${vp}: Performance — funnel + calculator chain (goal → deals → answered → dials → per SA working day)`, async () => {
      const backend = new Backend();
      const { ctx, page } = await open(vp, backend);
      try {
        await page.goto("/consultant/performance");
        await page.getByText("Close ratio").first().waitFor();
        await page.getByText("What does it take?").first().waitFor();
        await page.getByLabel("Goal", { exact: true }).selectOption("commission");
        await page.getByLabel("Target", { exact: true }).fill("30000");
        await page.getByLabel("By date").fill("2026-12-31");
        const days = await page.getByLabel("Working days").inputValue();
        const { workingDaysUntil } = await import("../../../lib/consultant/server/workingDays");
        assert.equal(Number(days), workingDaysUntil("2026-12-31"), "working days = Mon–Fri SAST minus SA public holidays");
        await page.getByLabel("Working days").fill("20");
        const rates = page.locator("details", { hasText: "Your rates" });
        if ((await rates.getAttribute("open")) === null) await rates.locator("summary").click(); // open by default
        await page.getByRole("textbox", { name: "Average sale", exact: true }).fill("15000");
        await page.getByRole("textbox", { name: "Paid ÷ answered", exact: true }).fill("30");
        await page.getByRole("textbox", { name: "Answered ÷ dials", exact: true }).fill("25");
        await page.getByRole("textbox", { name: "Commission rate", exact: true }).fill("25");
        // R30 000 ÷ R3 750 = 8 deals → ⌈8 ÷ 0.3⌉ = 27 answered → ⌈27 ÷ 0.25⌉ = 108 dials → ⌈108 ÷ 20⌉ = 6 a day.
        for (const t of ["8 paid deals", "27 answered calls", "108 dials"]) await page.getByText(t, { exact: true }).first().waitFor();
        await page.getByText(/6 dials\s*·\s*2 answered\s*·\s*0\.40 paid deals/).first().waitFor();
        await checkPage(page, vp, "performance");
      } finally {
        ctxOffline.add(ctx);
        await ctx.close();
      }
    });

    test(`${vp}: Leaderboard — commission visible to a consultant, tier badges`, async () => {
      const backend = new Backend();
      const { ctx, page } = await open(vp, backend);
      try {
        await page.goto("/consultant/leaderboard");
        await page.getByText("Thando Mokoena").filter({ visible: true }).first().waitFor();
        await page.getByText(/Commission/i).filter({ visible: true }).first().waitFor();
        await page.getByText("R20 625").filter({ visible: true }).first().waitFor(); // 25% of R82 500, another consultant's row
        await page.getByText(/Monthly Achiever/).filter({ visible: true }).first().waitFor();
        await page.getByText(/High Performer/).filter({ visible: true }).first().waitFor();
        await checkPage(page, vp, "leaderboard");
      } finally {
        ctxOffline.add(ctx);
        await ctx.close();
      }
    });

    test(`${vp}: Training — sequential lock`, async () => {
      const backend = new Backend();
      const { ctx, page } = await open(vp, backend);
      try {
        await page.goto("/consultant/training");
        const mod = (title: string) => page.getByRole("button", { name: new RegExp(`^${title}`) });
        await mod("Your Why Board").waitFor();
        assert.equal(await mod("Call flow & NEPQ").isDisabled(), true, "module 3 locked until 2 is done");
        assert.equal(await mod("Demo to paid").isDisabled(), true);
        await page.getByText("Finish “Your Why Board” first").first().waitFor();
        if ((await mod("Your Why Board").getAttribute("aria-expanded")) !== "true") await mod("Your Why Board").click(); // the next module opens by default
        await page.getByText("Clip coming soon").first().waitFor();
        await page.getByRole("button", { name: /Mark as done/ }).click();
        await page.waitForFunction(() => {
          const b = Array.from(document.querySelectorAll("button")).find((x) => x.textContent?.includes("Call flow & NEPQ"));
          return !!b && !b.disabled;
        });
        assert.equal(await mod("Coach Alex on a live call").isDisabled(), true, "module 4 still locked");
        assert.deepEqual(backend.requests.filter((r) => r.includes("/complete")), ["POST /training/why-board/complete"]);
        await checkPage(page, vp, "training");
      } finally {
        ctxOffline.add(ctx);
        await ctx.close();
      }
    });

    test(`${vp}: Settings — calendar connect buttons are real OAuth navigations`, async () => {
      const backend = new Backend();
      const { ctx, page } = await open(vp, backend);
      try {
        await page.goto("/consultant/settings");
        await page.getByText("Calendars").first().waitFor();
        const links = page.getByRole("link", { name: "Connect" });
        await links.first().waitFor();
        const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
        assert.deepEqual(hrefs.sort(), ["/api/consultant/calendar/google/connect", "/api/consultant/calendar/microsoft/connect"]);
        await checkPage(page, vp, "settings");
      } finally {
        ctxOffline.add(ctx);
        await ctx.close();
      }
    });

    test(`${vp}: Lead workspace — consent chip, book a meeting in SAST from a New York device`, async () => {
      const backend = new Backend();
      const l = w2Lead(20, "contacted");
      backend.leads.push(l);
      const { ctx, page } = await open(vp, backend, { timezoneId: "America/New_York" });
      try {
        await page.goto(`/consultant/leads/${l.id}`);
        await page.getByText("WhatsApp: not yet").first().waitFor();
        await page.getByText(/Found via public listing/).first().waitFor();
        await page.getByText("Medium churn risk").first().waitFor();
        await page.getByRole("button", { name: /Schedule/ }).first().click();
        await page.getByText("Schedule a meeting").first().waitFor();
        const date = sastDate(1);
        await page.getByLabel("When date").fill(date);
        await page.getByLabel("When time").fill("10:00");
        await page.getByRole("button", { name: /^Book discovery/ }).click();
        await page.waitForFunction(() => !document.body.innerText.includes("Booking…"));
        assert.equal(backend.meetingPosts.length, 1);
        const startsAt = String(backend.meetingPosts[0].startsAt);
        assert.equal(new Date(startsAt).toISOString(), `${date}T08:00:00.000Z`, `10:00 SAST regardless of the device zone (got ${startsAt})`);
        await page.getByText(/10:00/).first().waitFor(); // shown back in SAST, not 04:00 New York
        await checkPage(page, vp, "lead-workspace");
      } finally {
        ctxOffline.add(ctx);
        await ctx.close();
      }
    });

    test(`${vp}: Manager confirms payment (amount, reference, SAST date) → paid + commission`, async () => {
      const backend = new Backend(ADMIN_ME);
      const l = w2Lead(21, "won", {
        consultantId: ME.memberId,
        consultantName: ME.displayName,
        deal: { id: randomUUID(), leadId: "", consultantId: ME.memberId, saleValue: 15000, status: "accepted", wonAt: iso(DAY), paidAt: null, paymentAmount: null, paymentReference: null, hasProof: false, confirmedByName: null, commissionRate: null, commissionAmount: null },
      });
      backend.leads.push(l);
      const { ctx, page } = await open(vp, backend);
      try {
        await page.goto(`/consultant/leads/${l.id}`);
        await page.getByText("Won — awaiting payment").first().waitFor();
        await page.getByRole("button", { name: /^Confirm payment$/ }).click();
        await page.getByLabel("Amount received (R)").fill("15000");
        await page.getByLabel("Payment reference").fill("EFT-QA-0001");
        const paidOn = sastDate(0);
        await page.getByLabel("Paid on date").fill(paidOn);
        await page.getByRole("button", { name: "Confirm payment received" }).click();
        await page.getByText("R3 750").first().waitFor(); // frozen 25% commission
        assert.equal(backend.payments.length, 1);
        assert.equal(backend.payments[0].amount, 15000);
        assert.equal(backend.payments[0].reference, "EFT-QA-0001");
        const sastDay = new Date(Date.parse(String(backend.payments[0].paidAt)) + 2 * 3_600_000).toISOString().slice(0, 10);
        assert.equal(sastDay, paidOn, "paid-on date is the SAST calendar day");
        await checkPage(page, vp, "lead-workspace-manager");
      } finally {
        ctxOffline.add(ctx);
        await ctx.close();
      }
    });

    test(`${vp}: New lead — source picker reveals Referred by / platform + handle`, async () => {
      const backend = new Backend();
      const { ctx, page } = await open(vp, backend);
      try {
        await page.goto("/consultant/leads/new");
        const source = page.getByLabel("How did this lead reach us?");
        await source.waitFor();
        assert.equal(await page.getByLabel("Referred by").count(), 0);
        await source.selectOption("referral");
        await page.getByLabel("Referred by").waitFor();
        assert.equal(await page.getByLabel("Platform").count(), 0);
        await source.selectOption("social_inbound");
        await page.getByLabel("Platform").waitFor();
        await page.getByLabel("Handle or profile link").waitFor();
        assert.equal(await page.getByLabel("Referred by").count(), 0);
        await page.getByLabel("Platform").selectOption("instagram");
        await page.getByLabel("Handle or profile link").fill("@glowclinic");
        await page.getByLabel("Clinic name").fill("Glow Social Clinic");
        await page.getByRole("textbox", { name: /^Phone/ }).fill("082 555 0199");
        await page.getByRole("button", { name: "Save clinic" }).click();
        await page.waitForURL(/\/consultant\/leads\/(?!new)/);
        const post = backend.requests.find((r) => r.startsWith("POST /leads"));
        assert.ok(post, "lead created");
        const created = backend.leads[backend.leads.length - 1] as Record<string, unknown>;
        assert.deepEqual([created.source, created.socialPlatform, created.socialHandle], ["social_inbound", "instagram", "@glowclinic"]);
        await page.goto("/consultant/leads/new");
        await page.getByLabel("How did this lead reach us?").selectOption("social_inbound");
        await checkPage(page, vp, "new-lead");
      } finally {
        ctxOffline.add(ctx);
        await ctx.close();
      }
    });

    test(`${vp}: Admin systems — health tiles + dead letters (real server shape) with retry`, async () => {
      const backend = new Backend(ADMIN_ME);
      const { ctx, page } = await open(vp, backend);
      try {
        await page.goto("/consultant/admin/systems");
        await page.getByText("Dead letters").first().waitFor();
        await page.getByText("deal.paid").first().waitFor();
        await page.getByText("lead_proposal_nudge").first().waitFor();
        await checkPage(page, vp, "admin-systems");
        await page.getByRole("button", { name: /Retry$/ }).first().click();
        await page.waitForFunction(() => !document.body.innerText.includes("deal.paid"));
        assert.deepEqual(backend.retried, ["event:dddddddd-0000-4000-8000-000000000001"]);
      } finally {
        ctxOffline.add(ctx);
        await ctx.close();
      }
    });

    test(`${vp}: wrap-up WhatsApp consent — shown for an outbound lead, hidden for an inbound one`, async () => {
      const backend = new Backend();
      const outbound = w2Lead(22, "contacted");
      const inbound = w2Lead(23, "contacted", { source: "social_inbound", socialPlatform: "instagram", socialHandle: "@in" });
      backend.leads.push(outbound, inbound);
      const { ctx, page } = await open(vp, backend);
      try {
        for (const [l, expectBox] of [[outbound, true], [inbound, false]] as const) {
          backend.callStatus = "in_progress";
          await page.goto(`/consultant/leads/${l.id}`);
          const callBtn = page.getByRole("button", { name: /^Call$/ }).first();
          await callBtn.waitFor();
          await page.waitForTimeout(1800);
          await callBtn.click();
          await page.waitForURL(/\/consultant\/call\//);
          await page.waitForTimeout(800);
          await page.getByRole("button", { name: /Hang up/i }).first().click();
          backend.callStatus = "completed";
          await page.getByRole("radiogroup", { name: "Outcome" }).waitFor();
          const box = page.getByLabel("Clinic agreed to WhatsApp follow-ups from VantageStack");
          assert.equal(await box.count(), expectBox ? 1 : 0, `${l.source}: consent checkbox ${expectBox ? "present" : "hidden"}`);
          if (!expectBox) await page.getByText(/this clinic contacted us first/).first().waitFor();
          else {
            await box.check();
            await page.getByRole("radiogroup", { name: "Outcome" }).getByText("Call back", { exact: true }).click();
            await page.getByRole("button", { name: /^Save/ }).last().click();
            await page.waitForURL((u) => !u.pathname.startsWith("/consultant/call/"), { timeout: 10_000 });
            assert.equal(backend.callPatches[backend.callPatches.length - 1].whatsappConsent, true);
          }
        }
      } finally {
        ctxOffline.add(ctx);
        await ctx.close();
      }
    });
  }

  test("desktop: service worker (scope /consultant) serves the shell offline; a note saved offline syncs exactly once", async () => {
    const backend = new Backend();
    const { ctx, page } = await open("desktop", backend, { serviceWorkers: "allow" });
    const l = backend.leads[2];
    try {
      await page.goto("/consultant");
      await page.getByText("Call next").first().waitFor();
      const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
      assert.equal(scope, `${BASE}/consultant`, "registered with scope /consultant (covers the dashboard itself)");
      // First load isn't controlled until the worker claims it; reload once so it is.
      if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) {
        await page.reload();
        await page.getByText("Call next").first().waitFor();
      }
      assert.equal(await page.evaluate(() => !!navigator.serviceWorker.controller), true, "page is controlled by the portal worker");
      await page.goto(`/consultant/leads/${l.id}`); // visited online → cached
      await page.getByText(l.clinicName).first().waitFor();
      await page.goto("/consultant");
      await page.getByText("Call next").first().waitFor();
      await settle(page);

      await ctx.setOffline(true);
      ctxOffline.add(ctx);
      await page.reload();
      await page.getByText(/You're offline/).first().waitFor({ timeout: 15_000 });
      await page.getByRole("link", { name: /Pipeline/ }).first().waitFor();
      const text = await page.evaluate(() => document.body.innerText);
      assert.ok(!/ERR_INTERNET_DISCONNECTED|No internet|This site can.t be reached/i.test(text), "cached shell, not the browser error page");
      await shotW2(page, "desktop-offline-shell");

      await page.goto(`/consultant/leads/${l.id}`);
      await page.getByPlaceholder("Add a note…").fill("Offline from the clinic car park — call back Thursday.");
      await page.getByRole("button", { name: "Save offline" }).click();
      await page.getByText(/Waiting for signal|1 waiting/).first().waitFor();
      assert.equal(backend.noteCreates.length, 0, "nothing sent while offline");
      await ctx.setOffline(false);
      ctxOffline.delete(ctx);
      await page.waitForFunction(() => !document.body.innerText.includes("Waiting for signal"), undefined, { timeout: 15_000 });
      await page.getByText("Offline from the clinic car park — call back Thursday.").first().waitFor();
      await page.waitForTimeout(1500);
      assert.equal(backend.noteCreates.length, 1, "synced exactly once");
      assert.ok(backend.noteCreates[0].clientId, "idempotent replay key");
    } catch (e) {
      await shotW2(page, "desktop-FAILED-offline").catch(() => undefined);
      throw e;
    } finally {
      ctxOffline.add(ctx);
      await ctx.close();
    }
  });

  test("no console errors or hydration warnings on any screen", () => {
    assert.deepEqual(consoleProblems, []);
  });
});
