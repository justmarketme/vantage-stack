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
 *   E2E_SHOTS=/tmp/qa-shots \
 *   npx tsx --test tests/e2e/consultant/portal.pw.ts
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

const ME = { memberId: "11111111-2222-4333-8444-555555555555", username: "alice", displayName: "Alice Consultant", role: "sales_consultant", isManager: false, canCall: true };

const VIEWPORTS = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const;
type Vp = keyof typeof VIEWPORTS;

// ── Session cookie (same HS256 CRM JWT the login route issues) ────────────────
function memberJwt(): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = `${b64({ alg: "HS256" })}.${b64({ typ: "crm", role: ME.role, un: ME.username, sv: 0, sub: ME.memberId, iat: now, exp: now + 3600 })}`;
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

  async handle(route: Route): Promise<void> {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api\/consultant/, "");
    const method = req.method();
    this.requests.push(`${method} ${path}${url.search}`);
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    const bodyJson = () => (req.postData() ? JSON.parse(req.postData()!) : {});
    let m: RegExpMatchArray | null;

    if (path === "/me") return json(ME);
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

async function open(vp: Vp, backend: Backend): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ ...VIEWPORTS[vp], baseURL: BASE, reducedMotion: "no-preference" });
  await ctx.addCookies([{ name: "vs_admin_session", value: memberJwt(), url: BASE }]);
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
    if (msg.type() === "error" || /hydrat/i.test(text)) consoleProblems.push(`[${vp}] ${msg.type()}: ${text}`);
  });
  page.on("pageerror", (e) => consoleProblems.push(`[${vp}] pageerror: ${e.message}`));
  // Aborted external requests (web fonts) are expected offline; anything same-origin failing is not.
  page.on("requestfailed", (r) => {
    // Next aborts in-flight RSC prefetches when a navigation starts, and Chromium reports the
    // card-telemetry flush sent while the call page unmounts as ERR_ABORTED even though the
    // fake backend received it (the live-call test asserts every card event arrived).
    const benign = r.url().includes("_rsc=") || (/\/cards$/.test(r.url()) && r.failure()?.errorText === "net::ERR_ABORTED");
    if (r.url().startsWith(BASE) && !ctxOffline.has(ctx) && !benign) consoleProblems.push(`[${vp}] requestfailed: ${r.method()} ${r.url().replace(BASE, "")} ${r.failure()?.errorText ?? ""}`);
  });
  page.on("response", (r) => {
    // /images/vs-logo.png: the ROOT layout's favicon is missing from public/ (pre-existing, not portal).
    if (r.url().startsWith(BASE) && r.status() >= 400 && !r.url().includes("/api/consultant/") && !r.url().endsWith("/images/vs-logo.png")) consoleProblems.push(`[${vp}] ${r.status()}: ${r.url().replace(BASE, "")}`);
  });
  return { ctx, page };
}

const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: false });

describe("Consultant Portal E2E", { skip: !SECRET && "E2E_JWT_SECRET not set" }, () => {
  before(async () => {
    mkdirSync(SHOTS, { recursive: true });
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
        await page.getByText("Enter a valid phone number").first().waitFor();
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
        await page.waitForTimeout(500);
        for (const ev of ["obj-price:shown", "obj-price:used", "obj-send-info:shown"]) {
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
  }

  test("no console errors or hydration warnings on any screen", () => {
    assert.deepEqual(consoleProblems, []);
  });
});
