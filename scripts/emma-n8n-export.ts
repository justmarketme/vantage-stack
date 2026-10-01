/**
 * Generates importable n8n workflows for the Consultant Portal from the app's own config, so
 * n8n can never drift from the rules the app enforces.
 *
 *   npm run emma:n8n-export        → writes n8n/*.workflow.json
 *
 * Workflows:
 *  1. vantage-emma-sequences  — receives every signed platform event, plans Emma's follow-up
 *     steps from ai-configs/emma/sequences.ts, waits until each step is due, then asks the app
 *     to send it (the app re-checks consent + stop conditions at send time).
 *  2. vantage-emma-digest     — weekday 17:30 SAST: asks Jono's EMMA to send the daily digest.
 *  3. vantage-lead-prospecting-serper — weekly Serper Maps search for aesthetic clinics in SA
 *     cities → signed `leads.import` into the Clinics pool (template for Apollo/Tavily/Exa too).
 *
 * n8n needs (Settings → environment of the n8n instance):
 *   N8N_SIGNING_SECRET  same value as the portal's N8N_SIGNING_SECRET (HMAC both directions)
 *   VANTAGE_APP_URL     e.g. https://vantagestack.co.za (no trailing slash)
 *   EMMA_URL            e.g. https://emmadoesit.cloud
 *   N8N_TRIGGER_SECRET  same value as EMMA's N8N_TRIGGER_SECRET
 *   NODE_FUNCTION_ALLOW_BUILTIN=crypto and N8N_BLOCK_ENV_ACCESS_IN_NODE=false
 *     (the Code nodes sign/verify with Node's crypto and read the secret from env —
 *      n8n Code nodes cannot read stored credentials)
 * The Serper API key is an n8n "Header Auth" credential (header X-API-KEY), never in the app.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EMMA_SEQUENCES } from "../ai-configs/emma/sequences";

const OUT = join(process.cwd(), "n8n");

// ── Shared JS snippets that run INSIDE n8n Code nodes ───────────────────────

/** HMAC helpers — identical scheme to lib/consultant/auth/signing.ts. */
const SIGNING_JS = `
const crypto = require('crypto');
const SECRET = $env.N8N_SIGNING_SECRET;
if (!SECRET) throw new Error('N8N_SIGNING_SECRET is not set in the n8n environment');
function sign(raw) {
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac('sha256', SECRET).update(t + '.' + raw).digest('hex');
  return 't=' + t + ',v1=' + v1;
}
function verify(raw, header, toleranceSec) {
  if (!header) return false;
  const parts = Object.fromEntries(String(header).split(',').map((p) => p.trim().split('=')));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', SECRET).update(t + '.' + raw).digest('hex');
  const got = String(header).split(',').filter((p) => p.trim().startsWith('v1=')).map((p) => p.trim().slice(3));
  return got.some((g) => g.length === expected.length && crypto.timingSafeEqual(Buffer.from(g), Buffer.from(expected)));
}
`;

function node(name: string, type: string, typeVersion: number, position: [number, number], parameters: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { id: cryptoId(name), name, type, typeVersion, position, parameters, ...extra };
}

function cryptoId(name: string): string {
  // Stable ids so re-imports diff cleanly.
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hex = h.toString(16).padStart(8, "0");
  return `${hex}-0000-4000-8000-${hex}${hex.slice(0, 4)}`;
}

function signedIngressRequest(name: string, position: [number, number]) {
  return node(name, "n8n-nodes-base.httpRequest", 4.2, position, {
    method: "POST",
    url: "={{ $env.VANTAGE_APP_URL }}/api/webhooks/n8n-ingress",
    sendHeaders: true,
    headerParameters: { parameters: [{ name: "X-VS-Signature", value: "={{ $json.signature }}" }] },
    sendBody: true,
    contentType: "raw",
    rawContentType: "application/json",
    body: "={{ $json.body }}",
    options: { timeout: 15000 },
  }, { retryOnFail: true, maxTries: 4, waitBetweenTries: 5000 });
}

// ── 1. Emma sequences ───────────────────────────────────────────────────────

function sequencesWorkflow() {
  const plan = `${SIGNING_JS}
// Generated from ai-configs/emma/sequences.ts — do not edit here; re-run npm run emma:n8n-export.
const SEQUENCES = ${JSON.stringify(EMMA_SEQUENCES)};

// 1) Verify the portal's signature over the RAW body (X-VS-Signature).
const item = $input.first();
const headers = item.json.headers || {};
let raw;
try { raw = (await this.helpers.getBinaryDataBuffer(0, 'data')).toString('utf8'); }
catch (e) { raw = JSON.stringify(item.json.body); }
if (!verify(raw, headers['x-vs-signature'], 300)) throw new Error('Invalid X-VS-Signature — event ignored');
const ev = JSON.parse(raw);

// 2) Which sequences does this event start?
const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const matches = SEQUENCES.filter((s) => s.trigger === ev.type &&
  Object.entries(s.when || {}).every(([k, v]) => (k.includes('.') ? get(ev, k) : get(ev, 'data.' + k)) === v));

// 3) Variables, formatted the South African way (SAST, ZAR).
const sast = (iso, withDay) => new Intl.DateTimeFormat('en-ZA', withDay
  ? { timeZone: 'Africa/Johannesburg', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }
  : { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
const zar = (n) => 'R' + Math.round(Number(n)).toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, ' ');
function fill(spec) {
  const out = {};
  for (const [name, rule] of Object.entries(spec || {})) {
    const m = /^data\\.(\\w+)/.exec(rule);
    const value = m ? ev.data && ev.data[m[1]] : undefined;
    if (value == null) continue;
    if (rule.includes('SAST')) out[name] = sast(value, rule.includes('ddd'));
    else if (rule.includes("'R")) out[name] = zar(value);
    else out[name] = String(value);
  }
  return out;
}

// 4) One item per step, with the absolute time it is due. Past-due reminders are dropped
//    (e.g. a "24h before" reminder for a meeting booked 3 hours ahead).
const now = Date.now();
const steps = [];
for (const s of matches) {
  for (const step of s.steps) {
    const anchor = step.anchor === 'startsAt' && ev.data && ev.data.startsAt ? Date.parse(ev.data.startsAt) : Date.parse(ev.occurredAt);
    const due = anchor + step.delayMinutes * 60000;
    if (due < now - 5 * 60000) continue;
    const idempotencyKey = ev.id + ':' + s.id + ':' + step.id;
    const variables = fill(step.variables);
    const payload = s.audience === 'consultant'
      ? (ev.consultant ? { action: 'emma.notify_consultant', idempotencyKey, consultantId: ev.consultant.id, template: step.template, variables } : null)
      : (ev.lead ? { action: 'emma.send', idempotencyKey, leadId: ev.lead.id, template: step.template, variables, channel: step.channel, sinceEventId: ev.id, stopIf: step.stopIf } : null);
    if (payload) steps.push({ json: { resumeAt: new Date(Math.max(due, now)).toISOString(), sequence: s.id, step: step.id, payload } });
  }
}
steps.sort((a, b) => a.json.resumeAt.localeCompare(b.json.resumeAt));
return steps;`;

  const sign = `${SIGNING_JS}
const body = JSON.stringify($json.payload);
return [{ json: { body, signature: sign(body), sequence: $json.sequence, step: $json.step } }];`;

  const nodes = [
    node("Portal event (signed)", "n8n-nodes-base.webhook", 2, [0, 0], {
      httpMethod: "POST",
      path: "vantage-events",
      responseMode: "onReceived",
      options: { rawBody: true },
    }, { webhookId: cryptoId("vantage-events-webhook") }),
    node("Verify + plan steps", "n8n-nodes-base.code", 2, [260, 0], { mode: "runOnceForAllItems", jsCode: plan }),
    node("One step at a time", "n8n-nodes-base.splitInBatches", 3, [520, 0], { batchSize: 1, options: {} }),
    node("Wait until due", "n8n-nodes-base.wait", 1.1, [780, 0], { resume: "specificTime", dateTime: "={{ $json.resumeAt }}" }, { webhookId: cryptoId("vantage-wait") }),
    node("Sign request", "n8n-nodes-base.code", 2, [1040, 0], { mode: "runOnceForEachItem", jsCode: sign }),
    signedIngressRequest("Ask the app to send", [1300, 0]),
  ];
  const connections = {
    "Portal event (signed)": { main: [[{ node: "Verify + plan steps", type: "main", index: 0 }]] },
    "Verify + plan steps": { main: [[{ node: "One step at a time", type: "main", index: 0 }]] },
    // splitInBatches v3: output 0 = done, output 1 = loop.
    "One step at a time": { main: [[], [{ node: "Wait until due", type: "main", index: 0 }]] },
    "Wait until due": { main: [[{ node: "Sign request", type: "main", index: 0 }]] },
    "Sign request": { main: [[{ node: "Ask the app to send", type: "main", index: 0 }]] },
    "Ask the app to send": { main: [[{ node: "One step at a time", type: "main", index: 0 }]] },
  };
  return { name: "VantageStack · Emma follow-up sequences", nodes, connections, settings: { timezone: "Africa/Johannesburg", executionOrder: "v1" }, pinData: {}, active: false };
}

// ── 2. EMMA daily digest ────────────────────────────────────────────────────

function digestWorkflow() {
  const nodes = [
    node("Weekdays 17:30 SAST", "n8n-nodes-base.scheduleTrigger", 1.2, [0, 0], {
      rule: { interval: [{ field: "cronExpression", expression: "30 17 * * 1-5" }] },
    }),
    node("Ask EMMA for the digest", "n8n-nodes-base.httpRequest", 4.2, [260, 0], {
      method: "POST",
      url: "={{ $env.EMMA_URL }}/trigger/vantage-digest",
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "X-Trigger-Secret", value: "={{ $env.N8N_TRIGGER_SECRET }}" }] },
      options: { timeout: 60000 },
    }, { retryOnFail: true, maxTries: 3, waitBetweenTries: 30000 }),
  ];
  const connections = { "Weekdays 17:30 SAST": { main: [[{ node: "Ask EMMA for the digest", type: "main", index: 0 }]] } };
  return { name: "VantageStack · EMMA daily digest", nodes, connections, settings: { timezone: "Africa/Johannesburg", executionOrder: "v1" }, pinData: {}, active: false };
}

// ── 3. Lead prospecting (Serper Maps → Clinics pool) ────────────────────────

function prospectingWorkflow() {
  const queries = `// Edit the search list freely — every result lands in the Clinics pool, deduped by +27 phone / place id.
const cities = ['Cape Town', 'Johannesburg', 'Sandton', 'Pretoria', 'Durban', 'Umhlanga', 'Stellenbosch', 'Port Elizabeth', 'Bloemfontein'];
const kinds = ['aesthetic clinic', 'medical spa', 'skin clinic', 'botox and fillers'];
return cities.flatMap((c) => kinds.map((k) => ({ json: { q: k + ' ' + c, gl: 'za', hl: 'en' } })));`;

  const toImport = `${SIGNING_JS}
// Serper Maps results → ScrapedLeadImport (provider "serper"). Business fields only (POPIA).
const day = new Date().toISOString().slice(0, 10);
const out = [];
for (const item of $input.all()) {
  const q = item.json.searchParameters ? item.json.searchParameters.q : 'serper';
  const leads = (item.json.places || []).filter((p) => p.title && p.phoneNumber).map((p) => ({
    businessName: p.title,
    phone: p.phoneNumber || null,
    email: null,
    website: p.website || null,
    address: p.address || null,
    placeId: p.placeId || p.cid || null,
    ownerName: null,
    sourceUrl: p.placeId ? 'https://www.google.com/maps/place/?q=place_id:' + p.placeId : (p.website || null),
  }));
  if (!leads.length) continue;
  const payload = { action: 'leads.import', idempotencyKey: 'serper:' + day + ':' + q, batch: { provider: 'serper', leads } };
  const body = JSON.stringify(payload);
  out.push({ json: { body, signature: sign(body), query: q, count: leads.length } });
}
return out;`;

  const nodes = [
    node("Mondays 07:00 SAST", "n8n-nodes-base.scheduleTrigger", 1.2, [0, 0], {
      rule: { interval: [{ field: "cronExpression", expression: "0 7 * * 1" }] },
    }),
    node("Searches", "n8n-nodes-base.code", 2, [260, 0], { mode: "runOnceForAllItems", jsCode: queries }),
    node("Serper Maps", "n8n-nodes-base.httpRequest", 4.2, [520, 0], {
      method: "POST",
      url: "https://google.serper.dev/maps",
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendBody: true,
      specifyBody: "json",
      jsonBody: "={{ JSON.stringify($json) }}",
      options: { batching: { batch: { batchSize: 1, batchInterval: 1200 } } },
    }, { credentials: { httpHeaderAuth: { id: "", name: "Serper API key (X-API-KEY)" } } }),
    node("Map to Clinics import + sign", "n8n-nodes-base.code", 2, [780, 0], { mode: "runOnceForAllItems", jsCode: toImport }),
    signedIngressRequest("Import into the Clinics pool", [1040, 0]),
  ];
  const connections = {
    "Mondays 07:00 SAST": { main: [[{ node: "Searches", type: "main", index: 0 }]] },
    Searches: { main: [[{ node: "Serper Maps", type: "main", index: 0 }]] },
    "Serper Maps": { main: [[{ node: "Map to Clinics import + sign", type: "main", index: 0 }]] },
    "Map to Clinics import + sign": { main: [[{ node: "Import into the Clinics pool", type: "main", index: 0 }]] },
  };
  return { name: "VantageStack · Lead prospecting (Serper → Clinics pool)", nodes, connections, settings: { timezone: "Africa/Johannesburg", executionOrder: "v1" }, pinData: {}, active: false };
}

// ── Write ───────────────────────────────────────────────────────────────────

export function buildWorkflows() {
  return {
    "vantage-emma-sequences.workflow.json": sequencesWorkflow(),
    "vantage-emma-digest.workflow.json": digestWorkflow(),
    "vantage-lead-prospecting-serper.workflow.json": prospectingWorkflow(),
  };
}

if (process.argv[1] && /emma-n8n-export\.ts$/.test(process.argv[1])) {
  mkdirSync(OUT, { recursive: true });
  for (const [file, wf] of Object.entries(buildWorkflows())) {
    writeFileSync(join(OUT, file), JSON.stringify(wf, null, 2) + "\n");
    console.log(`wrote n8n/${file}`);
  }
}
