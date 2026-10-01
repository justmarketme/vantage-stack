/**
 * Staging seed for the Consultant Portal (VantageStack Clinics vertical).
 *
 *   npm run consultant:seed-staging -- --dry-run      # prints what it would write, touches nothing
 *   npm run consultant:seed-staging                   # writes (idempotent)
 *   npm run consultant:seed-staging -- --no-events    # also drops the outbox events the seed caused
 *
 * SAFETY — refuses to run unless ALL of:
 *   - NODE_ENV is not "production";
 *   - CONSULTANT_SEED_ALLOWED_DB_MARKER (cfg.seed.allowedDbMarker) is set, and
 *   - the database URL this process will connect to contains that marker (use the staging
 *     BRANCH's project ref, so the production URL can never match). DATABASE_URL, if set, must
 *     contain it too.
 *
 * IDEMPOTENT — every row has a fixed UUID (prefix 5eed…) and is upserted, so re-running refreshes
 * the data (times are re-anchored to "now", SAST) without creating duplicates.
 *
 * WHAT IT CREATES — 3 consultants + 1 manager; one generic but realistic test clinic profile
 * ("Lumière Aesthetics & Skin Clinic", Cape Town) plus 16 more clinics across every stage
 * (incl. no_show and paid) and every lead source (public_scrape, landing_page, referral,
 * social_inbound, event, consultant_portal); calls with dispositions, short transcripts and Coach
 * Alex summaries; notes with revisions; discovery/demo meetings in the past and the next two
 * weeks (SAST working hours); deals with payments and 25% commission; Why Board goals; training
 * progress; a pending reward; Emma messages incl. one dead-lettered; consent rows (inbound
 * opt-ins, one call opt-in on a scraped lead, one STOP). Enough for Emma's n8n workflows to be
 * exercised end to end immediately.
 *
 * FICTIONAL DATA ONLY — people and clinics are invented; emails use the reserved `.example`
 * TLD (RFC 2606, undeliverable); phones use the +27 21 555 01xx pattern. ICASA publishes no
 * "drama" range, so these follow the 555-01xx convention: NEVER dial them from staging with a
 * live Twilio account — use Twilio test credentials or EMMA_DRY_RUN=true.
 *
 * Output: counts only. Never prints the connection string, names, phones or emails.
 */
import type { Sql } from "postgres";
import { consultantConfig, portalStatusValues } from "../lib/consultant/config";
import { connectCrmDb, getCrmDbUrl, resetSingletonPool } from "../lib/crm/db";
import { commissionFor, storedRate } from "../lib/consultant/metrics/commission";
import { ensureConsultantSchema } from "../lib/consultant/schema";
import { sastStartOfDay, sastWallClock } from "../lib/consultant/server/calendar/sast";
import { errorTag } from "../lib/consultant/server/http";
import { ensureImportColumns } from "../lib/consultant/server/repo/leadImport";
import { isWorkingDay } from "../lib/consultant/server/workingDays";
import { TRAINING_MODULES } from "../lib/consultant/training/modules";
import type {
  CallDisposition,
  CallSummary,
  GoalMetric,
  LeadSource,
  MeetingKind,
  MeetingStatus,
  SalesStage,
  SocialPlatform,
  Speaker,
} from "../lib/consultant/types";

// ── Deterministic ids ────────────────────────────────────────────────────────

const KIND = { member: 1, clinic: 2, call: 3, note: 4, meeting: 5, deal: 6, goal: 7, reward: 8, message: 9 } as const;

/** `5eed00KK-0000-4000-8000-00000000NNNN` — stable across runs, recognisably seed data. */
export function seedId(kind: keyof typeof KIND, n: number): string {
  return `5eed${String(KIND[kind]).padStart(4, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

// ── Guard ────────────────────────────────────────────────────────────────────

export function seedGuard(env: { nodeEnv: string | undefined; marker: string; effectiveUrl: string | null; databaseUrl: string | undefined }):
  | { ok: true }
  | { ok: false; reason: string } {
  if (env.nodeEnv === "production") return { ok: false, reason: "NODE_ENV is production" };
  if (!env.marker) return { ok: false, reason: "CONSULTANT_SEED_ALLOWED_DB_MARKER is not set" };
  if (!env.effectiveUrl) return { ok: false, reason: "no database URL configured" };
  if (!env.effectiveUrl.includes(env.marker)) return { ok: false, reason: "the database URL does not contain the allowed marker" };
  if (env.databaseUrl && !env.databaseUrl.includes(env.marker)) return { ok: false, reason: "DATABASE_URL does not contain the allowed marker" };
  return { ok: true };
}

// ── Plan types ───────────────────────────────────────────────────────────────

type MemberKey = "thando" | "megan" | "sipho" | "ayesha";

type SeedMember = { key: MemberKey; id: string; username: string; email: string; fullName: string; role: string };

type SeedClinic = {
  id: string;
  name: string;
  city: string;
  address: string;
  contactName: string;
  contactRole: string;
  phone: string;
  email: string | null; // null → CRM placeholder email
  website: string | null;
  leadSource: LeadSource;
  provider: string | null; // clients.source for public_scrape leads
  sourceUrl: string | null;
  referredBy: string | null;
  socialPlatform: SocialPlatform | null;
  socialHandle: string | null;
  owner: MemberKey | null;
  stage: SalesStage;
  createdAt: Date;
  stageChangedAt: Date;
  nextAction: string | null;
  nextActionAt: Date | null;
  lostReason: string | null;
};

type SeedCall = {
  id: string;
  clinicId: string;
  consultant: MemberKey;
  toNumber: string;
  startedAt: Date;
  talkSec: number; // 0 → not answered
  disposition: CallDisposition;
  transcript: [Speaker, string][];
  summary: CallSummary | null;
};

type SeedNote = {
  id: string;
  clinicId: string;
  callId: string | null;
  kind: "manual" | "ai_summary";
  author: MemberKey | "coach";
  versions: { body: string; editor: MemberKey | "coach"; at: Date }[];
};

type SeedMeeting = {
  id: string;
  clinicId: string;
  consultant: MemberKey;
  kind: MeetingKind;
  status: MeetingStatus;
  startsAt: Date;
  durationMin: number;
  invite: boolean;
  notes: string | null;
};

type SeedDeal = {
  id: string;
  clinicId: string;
  consultant: MemberKey;
  value: number;
  status: "sent" | "accepted";
  sentAt: Date;
  wonAt: Date | null;
  paidAt: Date | null;
  amount: number | null;
  reference: string | null;
};

type SeedGoal = { id: string; consultant: MemberKey; title: string; why: string; targetDate: string; metric: GoalMetric; targetValue: number; createdAt: Date };

type SeedMessage = {
  id: string;
  audience: "lead" | "consultant" | "owner";
  clinicId: string | null;
  consultant: MemberKey | null;
  template: string;
  variables: Record<string, string>;
  status: "queued" | "sent" | "delivered" | "read" | "dead";
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  sentAt: Date | null;
};

type SeedConsent = { clinicId: string; optedInAt: Date | null; optedOutAt: Date | null; source: string; callId: string | null };

export type SeedPlan = {
  members: SeedMember[];
  clinics: SeedClinic[];
  calls: SeedCall[];
  notes: SeedNote[];
  meetings: SeedMeeting[];
  deals: SeedDeal[];
  goals: SeedGoal[];
  training: { consultant: MemberKey; moduleId: string; completedAt: Date }[];
  rewards: { id: string; consultant: MemberKey; tier: string; periodKey: string; reward: string; achievedAt: Date }[];
  messages: SeedMessage[];
  consent: SeedConsent[];
};

// ── Time helpers (SAST) ──────────────────────────────────────────────────────

function makeClock(now: Date) {
  const today = sastStartOfDay(now).getTime();
  const DAY = 86_400_000;
  /** SAST wall-clock time `days` from today (negative = past). */
  const at = (days: number, hh = 9, mm = 0) => new Date(today + days * DAY + (hh * 60 + mm) * 60_000);
  /** Like `at`, but moved to the nearest SA working day in the same direction (meetings). */
  const workAt = (days: number, hh: number, mm = 0) => {
    let d = days;
    const step = days < 0 ? -1 : 1;
    while (!isWorkingDay(sastWallClock(at(d)).slice(0, 10))) d += step;
    return at(d, hh, mm);
  };
  const dateKey = (days: number) => sastWallClock(at(days, 12)).slice(0, 10);
  return { at, workAt, dateKey };
}

// ── The plan ─────────────────────────────────────────────────────────────────

const DOMAIN = "staging.example";
const phone = (n: number) => `+2721555${String(100 + n).padStart(4, "0")}`; // +27 21 555 01xx

function summary(o: Partial<CallSummary> & Pick<CallSummary, "summary">): CallSummary {
  return {
    keyPoints: [],
    objections: [],
    nepqStages: [],
    nextSteps: [],
    recommendedStage: null,
    recommendedDisposition: null,
    sentiment: "neutral",
    coachingTips: [],
    extracted: { email: null, website: null, decisionMaker: null, painPoints: [] },
    ...o,
  };
}

export function buildSeedPlan(now: Date = new Date()): SeedPlan {
  const { at, workAt, dateKey } = makeClock(now);

  const members: SeedMember[] = [
    { key: "thando", id: seedId("member", 1), username: "seed.thando", email: `thando.nkosi@${DOMAIN}`, fullName: "Thando Nkosi", role: "sales_consultant" },
    { key: "megan", id: seedId("member", 2), username: "seed.megan", email: `megan.vdmerwe@${DOMAIN}`, fullName: "Megan van der Merwe", role: "sales_consultant" },
    { key: "sipho", id: seedId("member", 3), username: "seed.sipho", email: `sipho.mahlangu@${DOMAIN}`, fullName: "Sipho Mahlangu", role: "sales_consultant" },
    { key: "ayesha", id: seedId("member", 4), username: "seed.ayesha", email: `ayesha.patel@${DOMAIN}`, fullName: "Ayesha Patel", role: "agent_manager" },
  ];

  let clinicN = 0;
  const clinic = (o: Partial<SeedClinic> & Pick<SeedClinic, "name" | "city" | "contactName" | "contactRole" | "stage" | "leadSource" | "owner">, createdDaysAgo: number, stageDaysAgo: number): SeedClinic => {
    clinicN++;
    const slug = o.name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return {
      id: seedId("clinic", clinicN),
      address: `${o.city}, South Africa`,
      phone: phone(clinicN),
      email: `info@${slug}.example`,
      website: `https://www.${slug}.example`,
      provider: null,
      sourceUrl: null,
      referredBy: null,
      socialPlatform: null,
      socialHandle: null,
      createdAt: at(-createdDaysAgo, 8, 30),
      stageChangedAt: at(-stageDaysAgo, 11, 0),
      nextAction: null,
      nextActionAt: null,
      lostReason: null,
      ...o,
    };
  };
  const scraped = (placeN: number) => ({
    leadSource: "public_scrape" as const,
    provider: "google_places",
    sourceUrl: `https://maps.google.com/?cid=5eed${placeN}`,
    email: null,
  });

  // 1 — THE test clinic profile (generic but realistic). Inbound via the landing page → Emma may message.
  const lumiere = clinic(
    {
      name: "Lumière Aesthetics & Skin Clinic",
      city: "Cape Town",
      address: "12 Kildare Road, Newlands, Cape Town, 7700",
      contactName: "Dr Naledi Dlamini",
      contactRole: "Owner & Medical Director",
      email: "naledi@lumiere-aesthetics.example",
      website: "https://www.lumiere-aesthetics.example",
      leadSource: "landing_page",
      owner: "thando",
      stage: "discovery_booked",
      nextAction: "Discovery call with Dr Dlamini and Chantelle (practice manager)",
    },
    12,
    2,
  );
  const glow = clinic({ name: "Glow Skin Studio", city: "Durban", contactName: "Front desk", contactRole: "Reception", stage: "new", owner: null, ...scraped(2) }, 3, 3);
  const renew = clinic({ name: "Skin Renew Clinic Sandton", city: "Johannesburg", contactName: "Front desk", contactRole: "Reception", stage: "new", owner: null, ...scraped(3) }, 2, 2);
  const radiance = clinic({ name: "Radiance Medispa", city: "Pretoria", contactName: "Lerato Molefe", contactRole: "Practice Manager", stage: "contacted", owner: "megan", ...scraped(4) }, 9, 4);
  const aura = clinic({ name: "Aura Aesthetics Stellenbosch", city: "Stellenbosch", contactName: "Front desk", contactRole: "Reception", stage: "contacted", owner: "sipho", ...scraped(5) }, 8, 5);
  const skinBar = clinic(
    { name: "The Skin Bar Umhlanga", city: "Umhlanga", contactName: "Priya Naidoo", contactRole: "Owner", stage: "discovery_booked", owner: "megan", leadSource: "referral", referredBy: "Dr Mokoena, Glow Skin Pretoria" },
    6,
    1,
  );
  const velvet = clinic({ name: "Velvet Laser & Skin", city: "Bloemfontein", contactName: "Anri Botha", contactRole: "Owner", stage: "no_show", owner: "thando", leadSource: "consultant_portal" }, 15, 3);
  const bellezza = clinic(
    { name: "Bellezza Aesthetic Clinic", city: "Gqeberha", contactName: "Zanele Mthembu", contactRole: "Practice Manager", stage: "no_show", owner: "sipho", leadSource: "social_inbound", socialPlatform: "instagram", socialHandle: "@bellezza.aesthetics.example" },
    11,
    2,
  );
  const pure = clinic({ name: "Pure Dermal Clinic Rosebank", city: "Johannesburg", contactName: "Dr Karabo Sithole", contactRole: "Medical Director", stage: "demo_done", owner: "thando", leadSource: "landing_page" }, 21, 4);
  const serene = clinic({ name: "Serene Skin & Body", city: "George", contactName: "Marelize Steyn", contactRole: "Owner", stage: "demo_done", owner: "megan", leadSource: "event" }, 25, 6);
  const eden = clinic({ name: "Eden Aesthetics Centurion", city: "Centurion", contactName: "Dr Tshepo Maseko", contactRole: "Owner", stage: "proposal", owner: "sipho", leadSource: "consultant_portal" }, 30, 5);
  const luxe = clinic({ name: "Luxe Medi-Aesthetics Fourways", city: "Johannesburg", contactName: "Nicole Fourie", contactRole: "Practice Manager", stage: "proposal", owner: "thando", leadSource: "referral", referredBy: "Pure Dermal Clinic Rosebank" }, 28, 3);
  const contour = clinic({ name: "Contour Clinic Sea Point", city: "Cape Town", contactName: "Dr Aisha Jacobs", contactRole: "Owner", stage: "won", owner: "megan", leadSource: "landing_page" }, 35, 2);
  const nova = clinic({ name: "Nova Skin Institute Menlyn", city: "Pretoria", contactName: "Dr Pieter Venter", contactRole: "Medical Director", stage: "paid", owner: "thando", leadSource: "consultant_portal" }, 40, 6);
  const ivory = clinic({ name: "Ivory Aesthetics Ballito", city: "Ballito", contactName: "Samantha Govender", contactRole: "Owner", stage: "paid", owner: "sipho", leadSource: "landing_page" }, 45, 12);
  const bloom = clinic({ name: "Bloom Skin Clinic", city: "Kimberley", contactName: "Front desk", contactRole: "Reception", stage: "lost", owner: "megan", leadSource: "consultant_portal", lostReason: "Signed a 12-month contract with another provider" }, 20, 7);
  const halo = clinic({ name: "Halo Aesthetics Midrand", city: "Midrand", contactName: "Front desk", contactRole: "Reception", stage: "new", owner: "sipho", ...scraped(17) }, 1, 1);

  radiance.nextAction = "Call back Lerato after her Thursday clinic day";
  radiance.nextActionAt = workAt(1, 10);
  velvet.nextAction = "Reschedule the missed discovery";
  velvet.nextActionAt = workAt(1, 9, 30);
  luxe.nextAction = "Chase proposal sign-off";
  luxe.nextActionAt = workAt(2, 11);
  lumiere.nextActionAt = null;

  const clinics = [lumiere, glow, renew, radiance, aura, skinBar, velvet, bellezza, pure, serene, eden, luxe, contour, nova, ivory, bloom, halo];

  // ── Calls ──
  let callN = 0;
  const calls: SeedCall[] = [];
  const call = (c: SeedClinic, consultant: MemberKey, startedAt: Date, talkSec: number, disposition: CallDisposition, transcript: [Speaker, string][] = [], s: CallSummary | null = null) => {
    callN++;
    const row: SeedCall = { id: seedId("call", callN), clinicId: c.id, consultant, toNumber: c.phone, startedAt, talkSec, disposition, transcript, summary: s };
    calls.push(row);
    return row;
  };

  // Lumière: gatekeeper → owner conversation that booked the discovery.
  call(lumiere, "thando", at(-10, 10, 5), 0, "no_answer");
  call(lumiere, "thando", at(-7, 14, 20), 95, "gatekeeper", [
    ["consultant", "Hi, is that Lumière? It's Thando from VantageStack."],
    ["prospect", "Yes, this is Chantelle, the practice manager. Dr Dlamini is with a patient."],
    ["consultant", "No problem. Quick one — what happens to calls that come in while you're both busy?"],
    ["prospect", "Honestly they go to voicemail and we try to call back at lunch."],
    ["consultant", "When's a good time to catch Dr Dlamini for ten minutes?"],
    ["prospect", "Try Thursday after two."],
  ]);
  const lumiereBooked = call(
    lumiere,
    "thando",
    at(-2, 14, 10),
    412,
    "discovery_booked",
    [
      ["consultant", "Dr Dlamini, thanks for making time. Chantelle mentioned calls go to voicemail when you're both with patients?"],
      ["prospect", "That's right. Saturdays are the worst, we're fully booked and the phone never stops."],
      ["consultant", "What happens to those people when nobody answers?"],
      ["prospect", "Some leave a message, most don't. They probably book somewhere else."],
      ["consultant", "If you had to guess, how many bookings a month do you think that costs you?"],
      ["prospect", "Maybe fifteen, twenty. At an average of around R2 500 a treatment that adds up."],
      ["prospect", "We already have a receptionist though, I'm not sure we need a robot."],
      ["consultant", "That makes sense. What would need to be true for it to feel like help for Chantelle rather than a replacement?"],
      ["prospect", "If it only took the overflow and after-hours, and booked straight into our diary."],
      ["consultant", "Would it be worth a proper look next week with Chantelle on the call too?"],
      ["prospect", "Yes, let's do that."],
    ],
    summary({
      summary: "Reached the owner. After-hours and Saturday overflow calls go unanswered; she estimates 15–20 lost bookings a month. Agreed to a discovery session with the practice manager.",
      keyPoints: ["Saturdays fully booked, phone unanswered", "Average treatment about R2 500", "Practice manager Chantelle manages the diary"],
      objections: [{ objection: "Already have a receptionist", handled: true, quote: "We already have a receptionist though", betterResponse: null }],
      nepqStages: [
        { stage: "connection", reached: true, note: null },
        { stage: "situation", reached: true, note: "Call handling when busy" },
        { stage: "problem_awareness", reached: true, note: "Unanswered Saturday calls" },
        { stage: "consequence", reached: true, note: "15–20 lost bookings a month" },
        { stage: "commitment", reached: true, note: "Discovery booked" },
      ],
      nextSteps: ["Send calendar invite to Dr Dlamini and Chantelle", "Prepare an overflow-only demo flow"],
      recommendedStage: "discovery_booked",
      recommendedDisposition: "discovery_booked",
      sentiment: "positive",
      coachingTips: ["Great consequence question — next time let her put the rand figure on it herself before you move on."],
      extracted: { email: null, website: null, decisionMaker: "Dr Naledi Dlamini (owner)", painPoints: ["Missed Saturday calls", "Callbacks only at lunch"] },
    }),
  );

  call(glow, "megan", at(-1, 9, 15), 0, "no_answer");
  const radianceOptIn = call(
    radiance,
    "megan",
    at(-4, 11, 40),
    188,
    "callback",
    [
      ["consultant", "Hi Lerato, it's Megan from VantageStack — I found Radiance on Google Maps. Is now a bad time?"],
      ["prospect", "It's quite busy, what is it about?"],
      ["consultant", "We help clinics catch the calls and WhatsApps that come in while you're with patients. Can I send you a short WhatsApp with the details and call back Thursday?"],
      ["prospect", "Ja, WhatsApp is fine. Thursday afternoon."],
    ],
    summary({
      summary: "Practice manager was busy; agreed to receive a WhatsApp and a callback on Thursday afternoon. Told where we found the clinic's details.",
      nextSteps: ["WhatsApp intro (consent given on the call)", "Callback Thursday afternoon"],
      recommendedStage: "contacted",
      recommendedDisposition: "callback",
      sentiment: "neutral",
      extracted: { email: null, website: null, decisionMaker: null, painPoints: [] },
    }),
  );
  call(aura, "sipho", at(-5, 15, 0), 42, "gatekeeper", [
    ["consultant", "Morning, could I speak to the owner please?"],
    ["prospect", "She's not in today, can I take a message?"],
  ]);
  call(skinBar, "megan", at(-1, 10, 30), 305, "discovery_booked", [
    ["consultant", "Priya, Dr Mokoena said you've been struggling with after-hours enquiries?"],
    ["prospect", "Yes, Instagram DMs and WhatsApps at night. By morning they've gone elsewhere."],
    ["consultant", "What would it mean if those were booked before you woke up?"],
    ["prospect", "Honestly? Probably another full day a week."],
  ]);
  call(velvet, "thando", at(-8, 12, 0), 240, "discovery_booked");
  call(velvet, "thando", at(-3, 10, 5), 0, "voicemail");
  call(bellezza, "sipho", at(-6, 9, 45), 200, "discovery_booked");
  call(pure, "thando", at(-12, 13, 0), 380, "discovery_booked");
  call(pure, "thando", at(-4, 16, 10), 150, "demo_booked");
  call(serene, "megan", at(-14, 11, 0), 260, "demo_booked");
  call(eden, "sipho", at(-15, 10, 0), 330, "demo_booked");
  call(luxe, "thando", at(-9, 14, 45), 290, "demo_booked");
  call(contour, "megan", at(-20, 9, 30), 410, "demo_booked");
  call(nova, "thando", at(-30, 11, 20), 360, "demo_booked");
  call(ivory, "sipho", at(-40, 10, 10), 300, "demo_booked");
  call(bloom, "megan", at(-18, 15, 30), 120, "not_interested", [
    ["prospect", "We've just signed with another company for a year, sorry."],
    ["consultant", "Totally understand. Would it be okay if I checked in closer to renewal?"],
    ["prospect", "Sure."],
  ]);
  // Extra dials so the funnel, leaderboard and calculator have real rates (not all answered).
  const dialDispositions: CallDisposition[] = ["no_answer", "voicemail", "no_answer", "gatekeeper", "callback", "no_answer", "wrong_number", "voicemail"];
  const dialTargets = [glow, renew, aura, halo, radiance, bloom];
  (["thando", "megan", "sipho"] as const).forEach((who, wi) => {
    for (let i = 0; i < 14; i++) {
      const d = dialDispositions[(i + wi) % dialDispositions.length];
      const answered = d === "gatekeeper" || d === "callback" || d === "wrong_number";
      call(dialTargets[(i + wi) % dialTargets.length], who, at(-(i % 10) - 1, 9 + (i % 7), (i * 7) % 60), answered ? 35 + i * 3 : 0, d);
    }
  });

  // ── Notes (one AI summary note per summarised call + manual notes with revisions) ──
  let noteN = 0;
  const notes: SeedNote[] = [];
  for (const c of calls.filter((k) => k.summary)) {
    noteN++;
    notes.push({
      id: seedId("note", noteN),
      clinicId: c.clinicId,
      callId: c.id,
      kind: "ai_summary",
      author: "coach",
      versions: [{ body: `## Summary\n${c.summary!.summary}`, editor: "coach", at: new Date(c.startedAt.getTime() + (c.talkSec + 60) * 1000) }],
    });
  }
  // Lumière: the AI note was corrected by Thando (a revision).
  const lumiereAi = notes.find((n) => n.callId === lumiereBooked.id)!;
  lumiereAi.versions.push({
    body: `${lumiereAi.versions[0].body}\n\nCorrection (Thando): Chantelle runs the diary on Saturdays too — invite her to every session.`,
    editor: "thando",
    at: at(-2, 15, 5),
  });
  noteN++;
  notes.push({
    id: seedId("note", noteN),
    clinicId: lumiere.id,
    callId: null,
    kind: "manual",
    author: "thando",
    versions: [
      { body: "Two practitioners, one receptionist. Uses a paper diary + Google Calendar.", editor: "thando", at: at(-7, 14, 40) },
      { body: "Two practitioners, one receptionist (Chantelle). Diary is Google Calendar; paper backup on Saturdays.", editor: "thando", at: at(-2, 14, 30) },
      { body: "Two practitioners, one receptionist (Chantelle). Diary is Google Calendar; paper backup on Saturdays. Manager note: prioritise — strong fit.", editor: "ayesha", at: at(-1, 8, 15) },
    ],
  });
  noteN++;
  notes.push({ id: seedId("note", noteN), clinicId: velvet.id, callId: null, kind: "manual", author: "thando", versions: [{ body: "Missed the discovery — owner was called into a procedure. Try a Monday morning slot.", editor: "thando", at: at(-3, 10, 20) }] });
  noteN++;
  notes.push({ id: seedId("note", noteN), clinicId: bloom.id, callId: null, kind: "manual", author: "megan", versions: [{ body: "Contract with competitor ends in about 11 months. Revisit then.", editor: "megan", at: at(-18, 15, 40) }] });

  // ── Meetings (SAST working hours; past + next 2 weeks) ──
  let meetingN = 0;
  const meeting = (c: SeedClinic, consultant: MemberKey, kind: MeetingKind, status: MeetingStatus, startsAt: Date, notesText: string | null = null, durationMin = 30): SeedMeeting => {
    meetingN++;
    const m: SeedMeeting = { id: seedId("meeting", meetingN), clinicId: c.id, consultant, kind, status, startsAt, durationMin, invite: true, notes: notesText };
    meetings.push(m);
    return m;
  };
  const meetings: SeedMeeting[] = [];
  meeting(lumiere, "thando", "discovery", "scheduled", workAt(2, 10), "Owner + practice manager. Focus: Saturday overflow.", 45);
  meeting(skinBar, "megan", "discovery", "scheduled", workAt(5, 14));
  meeting(radiance, "megan", "discovery", "scheduled", workAt(12, 11, 30));
  meeting(velvet, "thando", "discovery", "no_show", workAt(-3, 9));
  meeting(bellezza, "sipho", "discovery", "no_show", workAt(-2, 15));
  meeting(pure, "thando", "discovery", "held", workAt(-10, 10));
  meeting(pure, "thando", "demo", "held", workAt(-4, 11), null, 45);
  meeting(pure, "thando", "follow_up", "scheduled", workAt(8, 9, 30));
  meeting(serene, "megan", "demo", "held", workAt(-6, 13), null, 45);
  meeting(eden, "sipho", "demo", "held", workAt(-9, 10), null, 45);
  meeting(luxe, "thando", "demo", "held", workAt(-5, 15), null, 45);
  meeting(luxe, "thando", "follow_up", "scheduled", workAt(3, 16));
  meeting(contour, "megan", "demo", "held", workAt(-12, 10), null, 45);
  meeting(nova, "thando", "demo", "held", workAt(-22, 11), null, 45);
  meeting(ivory, "sipho", "demo", "held", workAt(-30, 9, 30), null, 45);
  meeting(eden, "sipho", "follow_up", "cancelled", workAt(-2, 12));
  meeting(bellezza, "sipho", "discovery", "scheduled", workAt(9, 10));

  // ── Deals (won → paid with 25% commission on the amount paid) ──
  const deals: SeedDeal[] = [
    { id: seedId("deal", 1), clinicId: eden.id, consultant: "sipho", value: 18500, status: "sent", sentAt: at(-5, 12), wonAt: null, paidAt: null, amount: null, reference: null },
    { id: seedId("deal", 2), clinicId: luxe.id, consultant: "thando", value: 22000, status: "sent", sentAt: at(-3, 10), wonAt: null, paidAt: null, amount: null, reference: null },
    { id: seedId("deal", 3), clinicId: contour.id, consultant: "megan", value: 15000, status: "accepted", sentAt: at(-8, 9), wonAt: at(-2, 16), paidAt: null, amount: null, reference: null },
    { id: seedId("deal", 4), clinicId: nova.id, consultant: "thando", value: 24500, status: "accepted", sentAt: at(-15, 9), wonAt: at(-9, 12), paidAt: at(-6, 10), amount: 24500, reference: "EFT NOVA-0001" },
    { id: seedId("deal", 5), clinicId: ivory.id, consultant: "sipho", value: 12500, status: "accepted", sentAt: at(-25, 9), wonAt: at(-16, 11), paidAt: at(-12, 9), amount: 12500, reference: "EFT IVORY-0001" },
  ];

  // ── Why Board goals ──
  const goals: SeedGoal[] = [
    { id: seedId("goal", 1), consultant: "thando", title: "Deposit on my first car", why: "So I can visit clinics outside Joburg without Ubers eating my commission.", targetDate: dateKey(75), metric: "commission", targetValue: 30000, createdAt: at(-20, 8) },
    { id: seedId("goal", 2), consultant: "megan", title: "Take Mom to Mauritius", why: "She's never been on a plane.", targetDate: dateKey(120), metric: "revenue", targetValue: 150000, createdAt: at(-14, 8) },
    { id: seedId("goal", 3), consultant: "sipho", title: "400 dials this month", why: "Build the habit — the deals follow the dials.", targetDate: dateKey(25), metric: "dials", targetValue: 400, createdAt: at(-6, 8) },
    { id: seedId("goal", 4), consultant: "sipho", title: "Five paid clinics by year end", why: "Top-3 quarter finish and the VantageStack jacket.", targetDate: dateKey(90), metric: "deals_paid", targetValue: 5, createdAt: at(-30, 8) },
  ];

  // ── Training progress ──
  const mods = [...TRAINING_MODULES].sort((a, b) => a.order - b.order);
  const training = [
    ...mods.slice(0, 6).map((m, i) => ({ consultant: "megan" as const, moduleId: m.id, completedAt: at(-20 + i, 9) })),
    ...mods.slice(0, 3).map((m, i) => ({ consultant: "thando" as const, moduleId: m.id, completedAt: at(-10 + i, 9) })),
    ...mods.slice(0, 1).map((m) => ({ consultant: "sipho" as const, moduleId: m.id, completedAt: at(-3, 9) })),
  ];

  // ── A pending reward (unfulfilled) ──
  const cfg = consultantConfig();
  const monthKey = sastWallClock(now).slice(0, 7);
  const rewards = [
    { id: seedId("reward", 1), consultant: "thando" as const, tier: "tier1_monthly_achiever", periodKey: monthKey, reward: cfg.gamificationDefaults.tier1.reward, achievedAt: at(-6, 10, 5) },
  ];

  // ── Emma messages (incl. one dead-lettered) ──
  const messages: SeedMessage[] = [
    { id: seedId("message", 1), audience: "lead", clinicId: lumiere.id, consultant: "thando", template: "lead_discovery_reminder", variables: { meetingTime: "Mon 10:00" }, status: "delivered", attempts: 1, lastError: null, createdAt: at(-1, 10), sentAt: at(-1, 10, 1) },
    { id: seedId("message", 2), audience: "lead", clinicId: velvet.id, consultant: "thando", template: "lead_no_show_reengage", variables: {}, status: "read", attempts: 1, lastError: null, createdAt: at(-3, 11), sentAt: at(-3, 11, 1) },
    { id: seedId("message", 3), audience: "lead", clinicId: bellezza.id, consultant: "sipho", template: "lead_no_show_reengage", variables: {}, status: "dead", attempts: 5, lastError: "Message could not be delivered after several attempts.", createdAt: at(-2, 17), sentAt: null },
    { id: seedId("message", 4), audience: "lead", clinicId: nova.id, consultant: "thando", template: "lead_payment_thank_you", variables: { amount: "R24 500" }, status: "delivered", attempts: 1, lastError: null, createdAt: at(-6, 10, 10), sentAt: at(-6, 10, 11) },
    { id: seedId("message", 5), audience: "consultant", clinicId: skinBar.id, consultant: "megan", template: "consultant_new_lead_assigned", variables: {}, status: "sent", attempts: 1, lastError: null, createdAt: at(-6, 9), sentAt: at(-6, 9, 1) },
    { id: seedId("message", 6), audience: "lead", clinicId: radiance.id, consultant: "megan", template: "lead_discovery_reminder", variables: { meetingTime: "11:30" }, status: "queued", attempts: 0, lastError: null, createdAt: at(0, 7), sentAt: null },
  ];

  // ── Messaging consent (POPIA s.69) ──
  const consent: SeedConsent[] = [
    { clinicId: lumiere.id, optedInAt: lumiere.createdAt, optedOutAt: null, source: "landing_page", callId: null },
    { clinicId: radiance.id, optedInAt: new Date(radianceOptIn.startedAt.getTime() + 200_000), optedOutAt: null, source: "call", callId: radianceOptIn.id },
    { clinicId: ivory.id, optedInAt: ivory.createdAt, optedOutAt: at(-5, 19, 12), source: "whatsapp_stop", callId: null },
  ];

  return { members, clinics, calls, notes, meetings, deals, goals, training, rewards, messages, consent };
}

export function planCounts(p: SeedPlan): Record<string, number> {
  return {
    members: p.members.length,
    clinics: p.clinics.length,
    calls: p.calls.length,
    transcriptSegments: p.calls.reduce((n, c) => n + c.transcript.length, 0),
    notes: p.notes.length,
    noteRevisions: p.notes.reduce((n, x) => n + (x.versions.length > 1 ? x.versions.length : 0), 0),
    meetings: p.meetings.length,
    deals: p.deals.length,
    paidDeals: p.deals.filter((d) => d.paidAt).length,
    goals: p.goals.length,
    trainingProgress: p.training.length,
    rewards: p.rewards.length,
    emmaMessages: p.messages.length,
    deadLettered: p.messages.filter((m) => m.status === "dead").length,
    consentRows: p.consent.length,
  };
}

// ── Writer ───────────────────────────────────────────────────────────────────

/** Apply the plan (one transaction). Safe to run repeatedly. Returns planned counts. */
export async function applySeed(db: Sql, plan: SeedPlan, opts: { dropEvents?: boolean } = {}): Promise<Record<string, number>> {
  const cfg = consultantConfig();
  await ensureImportColumns(db);
  const mid = (k: MemberKey | "coach") => (k === "coach" ? null : plan.members.find((m) => m.key === k)!.id);
  const mname = (k: MemberKey | "coach") => (k === "coach" ? "Coach Alex" : plan.members.find((m) => m.key === k)!.fullName);
  const muser = (k: MemberKey) => plan.members.find((m) => m.key === k)!.username;
  const startedAt = new Date();

  await db.begin(async (tx) => {
    const t = tx as unknown as Sql;

    for (const m of plan.members) {
      await t`
        insert into public.team_members (id, username, email, role, full_name, status)
        values (${m.id}::uuid, ${m.username}, ${m.email}, ${m.role}, ${m.fullName}, 'active')
        on conflict (id) do update set username = excluded.username, email = excluded.email, role = excluded.role,
          full_name = excluded.full_name, status = 'active'
      `;
    }

    for (const c of plan.clinics) {
      const email = c.email ?? `clinic+${c.id}@${"internal.vantagestack"}`;
      const status = c.stage === "proposal" ? cfg.pipeline.statusOnProposal : c.stage === "won" || c.stage === "paid" ? cfg.pipeline.statusOnWon : cfg.pipeline.newLeadStatus;
      const owner = c.owner ? mid(c.owner) : null;
      await t`
        insert into public.clients (
          id, name, company, email, website_url, city, address, contact_name, contact_role, phone,
          lead_source, source, source_url, sourced_at, referred_by, social_platform, social_handle,
          vertical, sales_stage, sales_stage_changed_at, status, consultant_id, assigned_to, created_by,
          next_action, next_action_at, lost_reason, created_at, updated_at
        ) values (
          ${c.id}::uuid, ${c.name}, ${c.name}, ${email}, ${c.website}, ${c.city}, ${c.address}, ${c.contactName}, ${c.contactRole}, ${c.phone},
          ${c.leadSource}, ${c.provider}, ${c.sourceUrl}, ${c.leadSource === "public_scrape" ? c.createdAt : null},
          ${c.referredBy}, ${c.socialPlatform}, ${c.socialHandle},
          'clinics', ${c.stage}, ${c.stageChangedAt}, ${status}, ${owner}::uuid, ${c.owner ? muser(c.owner) : null}, 'seed',
          ${c.nextAction}, ${c.nextActionAt}, ${c.lostReason}, ${c.createdAt}, now()
        )
        on conflict (id) do update set
          name = excluded.name, company = excluded.company, email = excluded.email, website_url = excluded.website_url,
          city = excluded.city, address = excluded.address, contact_name = excluded.contact_name, contact_role = excluded.contact_role,
          phone = excluded.phone, lead_source = excluded.lead_source, source = excluded.source, source_url = excluded.source_url,
          sourced_at = excluded.sourced_at, referred_by = excluded.referred_by, social_platform = excluded.social_platform,
          social_handle = excluded.social_handle, vertical = 'clinics', sales_stage = excluded.sales_stage,
          sales_stage_changed_at = excluded.sales_stage_changed_at, status = excluded.status, consultant_id = excluded.consultant_id,
          assigned_to = excluded.assigned_to, next_action = excluded.next_action, next_action_at = excluded.next_action_at,
          lost_reason = excluded.lost_reason, created_at = excluded.created_at, updated_at = now()
      `;
    }

    for (const c of plan.calls) {
      const answered = c.talkSec > 0;
      const answeredAt = answered ? new Date(c.startedAt.getTime() + 12_000) : null;
      const endedAt = new Date(c.startedAt.getTime() + (answered ? 12_000 + c.talkSec * 1000 : 30_000));
      // Summaries exist only where the plan has one; everything else is "skipped" so the sweep
      // never calls Claude for seed calls (which have no real transcript/recording).
      const summaryStatus = c.summary ? "ready" : "skipped";
      await t`
        insert into public.consultant_calls (
          id, client_id, consultant_id, to_number, status, started_at, answered_at, ended_at, duration_sec,
          disposition, summary_status, summary, summary_attempts, created_at, updated_at
        ) values (
          ${c.id}::uuid, ${c.clinicId}::uuid, ${mid(c.consultant)}::uuid, ${c.toNumber}, 'completed', ${c.startedAt}, ${answeredAt}, ${endedAt},
          ${Math.round((endedAt.getTime() - c.startedAt.getTime()) / 1000)}, ${c.disposition}, ${summaryStatus},
          ${c.summary ? t.json(c.summary as never) : null}, ${c.summary ? 1 : 0}, ${c.startedAt}, now()
        )
        on conflict (id) do update set
          client_id = excluded.client_id, consultant_id = excluded.consultant_id, to_number = excluded.to_number,
          started_at = excluded.started_at, answered_at = excluded.answered_at, ended_at = excluded.ended_at,
          duration_sec = excluded.duration_sec, disposition = excluded.disposition, summary_status = excluded.summary_status,
          summary = excluded.summary, updated_at = now()
      `;
      await t`delete from public.consultant_call_segments where call_id = ${c.id}::uuid`;
      let seq = 0;
      for (const [speaker, text] of c.transcript) {
        seq++;
        await t`
          insert into public.consultant_call_segments (call_id, seq, speaker, text, at)
          values (${c.id}::uuid, ${seq}, ${speaker}, ${text}, ${new Date((answeredAt ?? c.startedAt).getTime() + seq * 20_000)})
        `;
      }
    }

    for (const n of plan.notes) {
      const first = n.versions[0];
      const last = n.versions[n.versions.length - 1];
      const edited = n.versions.length > 1;
      await t`
        insert into public.consultant_notes (
          id, client_id, call_id, kind, body, version, created_by, created_by_name, created_at, updated_by, updated_by_name, updated_at
        ) values (
          ${n.id}::uuid, ${n.clinicId}::uuid, ${n.callId}::uuid, ${n.kind}, ${last.body}, ${n.versions.length},
          ${mid(n.author)}::uuid, ${mname(n.author)}, ${first.at},
          ${edited ? mid(last.editor) : null}::uuid, ${edited ? mname(last.editor) : null}, ${edited ? last.at : null}
        )
        on conflict (id) do update set body = excluded.body, version = excluded.version, updated_by = excluded.updated_by,
          updated_by_name = excluded.updated_by_name, updated_at = excluded.updated_at, created_at = excluded.created_at
      `;
      await t`delete from public.consultant_note_revisions where note_id = ${n.id}::uuid`;
      if (edited) {
        let v = 0;
        for (const ver of n.versions) {
          v++;
          await t`
            insert into public.consultant_note_revisions (note_id, version, body, edited_by, edited_by_name, edited_at)
            values (${n.id}::uuid, ${v}, ${ver.body}, ${mid(ver.editor)}::uuid, ${mname(ver.editor)}, ${ver.at})
          `;
        }
      }
    }

    for (const m of plan.meetings) {
      const endsAt = new Date(m.startsAt.getTime() + m.durationMin * 60_000);
      await t`
        insert into public.consultant_meetings (id, client_id, consultant_id, kind, status, starts_at, ends_at, invite_clinic, notes, status_changed_at, created_at, updated_at)
        values (${m.id}::uuid, ${m.clinicId}::uuid, ${mid(m.consultant)}::uuid, ${m.kind}, ${m.status}, ${m.startsAt}, ${endsAt},
          ${m.invite}, ${m.notes}, ${m.status === "scheduled" ? null : endsAt}, ${new Date(m.startsAt.getTime() - 3 * 86_400_000)}, now())
        on conflict (id) do update set client_id = excluded.client_id, consultant_id = excluded.consultant_id, kind = excluded.kind,
          status = excluded.status, starts_at = excluded.starts_at, ends_at = excluded.ends_at, invite_clinic = excluded.invite_clinic,
          notes = excluded.notes, status_changed_at = excluded.status_changed_at, updated_at = now()
      `;
    }

    const manager = plan.members.find((m) => m.role === "agent_manager")!;
    for (const d of plan.deals) {
      const rate = d.paidAt ? storedRate(cfg.commission.rate) : null;
      const commission = d.paidAt && d.amount ? commissionFor(d.amount, cfg.commission.rate) : null;
      await t`
        insert into public.deals (
          id, client_id, proposal_status, deal_value, service_type, vertical, consultant_id, sent_at, accepted_at,
          won_at, paid_at, payment_amount, payment_reference, payment_confirmed_by, payment_confirmed_at, commission_rate, commission_amount
        ) values (
          ${d.id}::uuid, ${d.clinicId}::uuid, ${d.status}, ${d.value}, ${cfg.pipeline.dealServiceType}, 'clinics', ${mid(d.consultant)}::uuid,
          ${d.sentAt}, ${d.wonAt}, ${d.wonAt}, ${d.paidAt}, ${d.amount}, ${d.reference},
          ${d.paidAt ? manager.id : null}::uuid, ${d.paidAt}, ${rate}, ${commission}
        )
        on conflict (id) do update set proposal_status = excluded.proposal_status, deal_value = excluded.deal_value,
          consultant_id = excluded.consultant_id, sent_at = excluded.sent_at, accepted_at = excluded.accepted_at,
          won_at = excluded.won_at, paid_at = excluded.paid_at, payment_amount = excluded.payment_amount,
          payment_reference = excluded.payment_reference, payment_confirmed_by = excluded.payment_confirmed_by,
          payment_confirmed_at = excluded.payment_confirmed_at, commission_rate = excluded.commission_rate,
          commission_amount = excluded.commission_amount
      `;
    }

    for (const g of plan.goals) {
      await t`
        insert into public.consultant_goals (id, consultant_id, title, why, target_date, metric, target_value, image_path, created_at)
        values (${g.id}::uuid, ${mid(g.consultant)}::uuid, ${g.title}, ${g.why}, ${g.targetDate}::date, ${g.metric}, ${g.targetValue}, null, ${g.createdAt})
        on conflict (id) do update set title = excluded.title, why = excluded.why, target_date = excluded.target_date,
          metric = excluded.metric, target_value = excluded.target_value, created_at = excluded.created_at
      `;
    }

    for (const p of plan.training) {
      await t`
        insert into public.consultant_training_progress (consultant_id, module_id, completed_at)
        values (${mid(p.consultant)}::uuid, ${p.moduleId}, ${p.completedAt})
        on conflict (consultant_id, module_id) do update set completed_at = excluded.completed_at
      `;
    }

    for (const r of plan.rewards) {
      // Unique on (consultant, tier, period): a re-run in the same month keeps the existing row.
      await t`
        insert into public.consultant_rewards (id, consultant_id, tier, period_key, reward, achieved_at, fulfilled_at, fulfilled_by)
        values (${r.id}::uuid, ${mid(r.consultant)}::uuid, ${r.tier}, ${r.periodKey}, ${r.reward}, ${r.achievedAt}, null, null)
        on conflict do nothing
      `;
    }

    for (const m of plan.messages) {
      await t`
        insert into public.consultant_messages (
          id, audience, client_id, consultant_id, channel, template, variables, idempotency_key, status, attempts,
          next_attempt_at, last_error, created_at, sent_at, updated_at
        ) values (
          ${m.id}::uuid, ${m.audience}, ${m.clinicId}::uuid, ${m.consultant ? mid(m.consultant) : null}::uuid, 'whatsapp', ${m.template},
          ${t.json(m.variables as never)}, ${`seed:${m.id}`}, ${m.status}, ${m.attempts}, ${m.createdAt}, ${m.lastError},
          ${m.createdAt}, ${m.sentAt}, now()
        )
        on conflict (id) do update set status = excluded.status, attempts = excluded.attempts, last_error = excluded.last_error,
          variables = excluded.variables, created_at = excluded.created_at, sent_at = excluded.sent_at,
          next_attempt_at = excluded.next_attempt_at, updated_at = now()
      `;
    }

    for (const c of plan.consent) {
      await t`
        insert into public.consultant_contact_consent (client_id, opted_in_at, opted_out_at, source, opted_in_call_id, updated_at)
        values (${c.clinicId}::uuid, ${c.optedInAt}, ${c.optedOutAt}, ${c.source}, ${c.callId}::uuid, now())
        on conflict (client_id) do update set opted_in_at = excluded.opted_in_at, opted_out_at = excluded.opted_out_at,
          source = excluded.source, opted_in_call_id = excluded.opted_in_call_id, updated_at = now()
      `;
    }

    if (opts.dropEvents) {
      // Outbox rows the triggers wrote for seed rows during THIS run (deliveries cascade).
      await t`
        delete from public.consultant_events
        where occurred_at >= ${startedAt}
          and (client_id = any(${plan.clinics.map((c) => c.id)}::uuid[]) or consultant_id = any(${plan.members.map((m) => m.id)}::uuid[]))
      `;
    }
  });

  return planCounts(plan);
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function printCounts(title: string, counts: Record<string, number>): void {
  console.log(title);
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(20)} ${v}`);
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const dropEvents = process.argv.includes("--no-events");
  const cfg = consultantConfig();
  const guard = seedGuard({
    nodeEnv: process.env.NODE_ENV,
    marker: cfg.seed.allowedDbMarker,
    effectiveUrl: getCrmDbUrl(),
    databaseUrl: process.env.DATABASE_URL?.trim() || undefined,
  });
  if (!guard.ok) {
    console.error(`Refusing to seed: ${guard.reason}.`);
    process.exit(2);
  }

  const plan = buildSeedPlan(new Date());
  if (dryRun) {
    printCounts("Dry run — would upsert (no database connection made):", planCounts(plan));
    return;
  }

  const db = await connectCrmDb();
  if (!db) {
    console.error("No database URL configured.");
    process.exit(2);
  }
  try {
    await ensureConsultantSchema(db, portalStatusValues());
    printCounts(`Seeded staging${dropEvents ? " (seed events dropped)" : ""}:`, await applySeed(db, plan, { dropEvents }));
  } catch (e) {
    console.error("Seed failed:", errorTag(e));
    process.exitCode = 1;
  } finally {
    await resetSingletonPool(); // close via the pool owner (never `.end()` the shared singleton directly)
  }
}

// Run only when executed directly (tests import the plan/writer).
if (process.argv[1] && /consultant-seed-staging\.[cm]?[jt]s$/.test(process.argv[1])) {
  void main();
}
