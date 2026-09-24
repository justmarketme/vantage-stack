import { z } from "zod";
import { isValidWhatsapp, normalizeWebsiteUrl } from "../blueprint/schema";

/**
 * Clinic Revenue Blueprint — intake schema.
 *
 * Deliberately separate from `BlueprintSubmitSchema`: the clinic funnel asks
 * clinic-shaped questions (chair/room utilisation, no-show rate, reception
 * load) that have no analogue in the general VantageStack intake, and we do not
 * want the two schemas fighting each other as either evolves.
 *
 * Question wording follows NEPQ ordering — situation, then problem awareness,
 * then consequence — so the form reads as a diagnostic rather than a pitch.
 * Nothing here asks about patients' health, conditions, or treatment: the
 * system is an operations layer, and the intake must not imply otherwise.
 */

/** Practice type. Broad enough to cover SA private practice without listing procedures. */
export const CLINIC_TYPES = [
  "Dental",
  "Aesthetic / skin",
  "Physiotherapy / rehab",
  "Optometry",
  "Dermatology",
  "Multi-disciplinary practice",
  "Other private practice",
] as const;

export const ENQUIRY_VOLUME_BANDS = [
  "Under 20 a month",
  "20–50 a month",
  "50–150 a month",
  "150–400 a month",
  "400+ a month",
  "Honestly, nobody counts",
] as const;

export const RESPONSE_SPEED_BANDS = [
  "Within a few minutes",
  "Within the hour",
  "Same day",
  "Next working day",
  "Depends who is on reception",
] as const;

export const AFTER_HOURS_HANDLING = [
  "Goes to voicemail",
  "Rings out",
  "Answering service",
  "A staff member's personal phone",
  "We do not know",
] as const;

export const RECALL_HANDLING = [
  "Nothing systematic",
  "Reception calls when they have time",
  "A spreadsheet reminder",
  "Practice-management software reminders",
  "A dedicated recall campaign",
] as const;

export const TIMELINE_BANDS = [
  "We are losing money now — this quarter",
  "Next quarter",
  "Planning for the next financial year",
  "Gathering information",
] as const;

const optionalText = z.string().trim().max(120).optional().default("");

export const ClinicBlueprintSchema = z.object({
  // ── Step 1 · Situation ────────────────────────────────────────────
  // Miner: open on neutral, factual ground. Nothing here is a leading question.
  practiceName: z.string().trim().min(1, "Practice name is required.").max(160),
  clinicType: z.string().trim().min(1, "Please tell us what kind of practice this is.").max(80),
  clinicTypeOther: z.string().trim().max(120).optional().default(""),
  locations: z.coerce
    .number()
    .int()
    .min(1, "A practice has at least one location.")
    .max(200, "That is more locations than we can size from a form — let us talk instead."),
  practitioners: z.coerce
    .number()
    .int()
    .min(1, "At least one practitioner.")
    .max(500, "That is enterprise scale — let us talk instead."),

  // ── Step 2 · Problem awareness ────────────────────────────────────
  // The prospect discovers the gap by answering. We are not asserting it.
  enquiryVolume: z.string().trim().min(1, "Roughly how many enquiries reach you?").max(80),
  responseSpeed: z.string().trim().min(1, "How quickly does a new enquiry get a reply?").max(80),
  afterHours: z.string().trim().min(1, "What happens to an after-hours enquiry?").max(80),
  recallHandling: z.string().trim().min(1, "How are returning patients brought back?").max(80),

  // ── Step 3 · Consequence ──────────────────────────────────────────
  // Hormozi: name the cost of the problem in the prospect's own numbers.
  avgAppointmentValue: z.coerce
    .number()
    .min(0, "Value cannot be negative.")
    .max(1_000_000, "That looks like a typo."),
  noShowRate: z.coerce
    .number()
    .min(0, "Cannot be below 0%.")
    .max(100, "Cannot be above 100%."),
  timeline: z.string().trim().min(1, "When do you want this solved?").max(80),

  // What the calculator showed them at the moment they submitted. Captured so a
  // follow-up conversation starts from the same numbers the prospect saw,
  // rather than a recomputed figure that may have drifted.
  roiSnapshot: z
    .object({
      recoveredRevenueMonthly: z.number().optional(),
      paybackMonths: z.number().nullable().optional(),
      assumedRecaptureRate: z.number().optional(),
    })
    .partial()
    .optional(),

  // ── Step 4 · Contact ──────────────────────────────────────────────
  contactName: z.string().trim().min(1, "Your name is required.").max(120),
  role: optionalText,
  email: z.string().trim().toLowerCase().max(200).email("Please enter a valid email address."),
  whatsapp: z
    .string()
    .trim()
    .max(40)
    .min(1, "A WhatsApp number is required — it is how we send the blueprint.")
    .refine(isValidWhatsapp, "Please include the country code, e.g. +27 82 123 4567."),
  websiteUrl: z
    .string()
    .trim()
    .max(300)
    .optional()
    .default("")
    .refine((v) => (v ? Boolean(normalizeWebsiteUrl(v)) : true), "Please enter a valid website URL (or leave it blank)."),

  // POPIA: explicit, un-prechecked, captured at submit time.
  consent: z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || v === "true")
    .refine((v) => v === true, "We need your permission before we contact you."),
});

export type ClinicBlueprint = z.infer<typeof ClinicBlueprintSchema>;

/**
 * Shared ROI model — imported by BOTH the calculator UI and the API, so the
 * number a prospect sees on the page and the number stored against their record
 * can never disagree. Changing an assumption changes both at once.
 */
export const ROI_ASSUMPTIONS = {
  /**
   * Share of currently-lost enquiries a fast-response system recovers.
   *
   * ── WHAT THE HEADLINE STUDY SAYS ──
   * Oldroyd / MIT Sloan with InsideSales (2007): 3 years of data, 6 companies,
   * ~15,000 web leads, 100,000+ call attempts, OLS with robust standard errors.
   * Leads contacted within 5 minutes had ~21x the ODDS of qualifying versus 30
   * minutes, and ~100x the odds of being reached.
   *
   * ATTRIBUTION: this is routinely miscredited to Harvard. It is Oldroyd/MIT.
   * HBR's separate 2011 audit of 2,241 firms is where the 42-hour average first
   * response and "23% never respond at all" figures come from.
   *
   * ── WHY WE DO NOT BUILD THE MODEL ON IT ──
   * Two objections, both of which survive scrutiny:
   *
   * 1. CONFOUNDING. Firms that respond in five minutes are not otherwise
   *    identical to firms that take thirty. They tend to have better-trained
   *    staff, better CRM tooling and more motivated teams. The study controls
   *    for some of this but cannot isolate response time as the sole cause, so
   *    the 21x is an upper bound on a causal reading, not the causal effect.
   *
   * 2. IT IS A MULTIPLIER ON A TINY BASE. If the 30-minute qualification rate
   *    is 0.1%, then 21x lands at ~2.1%. Still ~2%. Quoting "21x" as though it
   *    were a revenue multiple is the single most common abuse of this study.
   *
   * A third point cuts the other way and is worth stating: clinic enquiries are
   * high-intent INBOUND contacts from someone who already wants an appointment,
   * not cold B2B web leads. Baseline conversion is far higher, so the available
   * multiplier is much smaller — but the intent is real.
   *
   * ── WHAT WE ACTUALLY REST ON ──
   * The defensible floor, not the multiplier: an enquiry that rings out after
   * hours and is never returned converts at approximately zero. Recovering some
   * share of those is arithmetic, not extrapolation. That is why the default is
   * 30% and why the calculator exposes it as a slider the prospect can drag to
   * 10%. A number the clinic owner sets themselves cannot be an overclaim.
   */
  defaultRecaptureRate: 0.3,
  recaptureRateMin: 0.1,
  recaptureRateMax: 0.5,

  /**
   * Relative reduction in no-shows from structured reminders.
   *
   * ── THE EVIDENCE ──
   * Cochrane (Gurol-Urganci et al., CD007458, 2013): mobile text reminders vs
   * no reminders, RR 1.14 for attendance (95% CI 1.03-1.26), 7 studies, 5,841
   * participants, MODERATE quality. Text reminders performed about the same as
   * phone calls (RR 0.99) at 55-65% of the cost.
   *
   * ── A CORRECTION TO THE OBVIOUS DERIVATION ──
   * The widely quoted "67.8% vs 78.6% attendance" pair are the raw POOLED
   * group rates, not a controlled contrast — they are not the effect estimate
   * and should not be subtracted from one another to produce one. The controlled
   * result is the risk ratio.
   *
   * Applying RR to an 18% no-show baseline (82% attendance):
   *   point estimate 1.14 -> attendance 93.5% -> no-shows fall ~64% relative
   *   CI lower bound 1.03 -> attendance 84.5% -> no-shows fall ~14% relative
   *
   * We use 33%: comfortably inside that interval and well below the point
   * estimate, which is the correct direction to be wrong in when the number is
   * going in front of a buyer.
   *
   * ── WHY THE MECHANISM TRANSFERS TO SOUTH AFRICA ──
   * SA research finds the single most common reason patients miss a doctor's
   * appointment is simply FORGETTING (second: being out of town). Forgetting is
   * precisely the failure a reminder addresses, which is why this intervention
   * transfers better than most. One SA regional hospital has reported
   * non-attendance up to 40% across outpatient clinics.
   */
  noShowRecoveryRate: 0.33,

  /**
   * Share of no-shows that would have rebooked anyway, without any system.
   *
   * Without this discount the model treats every prevented no-show as wholly
   * new revenue, which is false: a meaningful portion of patients who miss an
   * appointment simply rebook later, so preventing the miss brings the revenue
   * FORWARD rather than creating it. Left uncorrected, no-show recovery
   * dominates the entire result and produces a payback figure no clinic owner
   * would believe - and would be right not to.
   *
   * Held at half as a deliberately conservative midpoint. The genuine gain from
   * preventing the other half is real (the slot is not left empty on the day,
   * and it is not resold at short notice), which is what the model keeps.
   */
  noShowRescheduleRate: 0.5,
} as const;

/**
 * Commercial defaults, kept separate from the evidence-backed constants above
 * because they are BUSINESS FACTS, not researched ones.
 *
 * ⚠️ Jono: set these to real VantageStack clinic pricing. They are exposed as
 * editable inputs in the calculator, so a wrong default is visible and
 * correctable rather than silently baked into the payback maths — but the
 * default is what most visitors will see.
 */
export const PRICING_DEFAULTS = {
  monthlyCostZar: 9_500,
  setupCostZar: 35_000,
} as const;

/**
 * Evidence-backed defaults for the practice-shaped inputs.
 *
 * No-show baseline SOURCE: across 105 studies the mean no-show rate was 23%
 * (range 4–79%); other pooled analyses put the mean at 15.2% / median 12.9%.
 * By specialty: dentistry ~15%, optometry ~25%, dermatology ~30%. A ~18%
 * national-average default sits sensibly inside that spread.
 *
 * Appointment value SOURCE: SA private dental examination fees run roughly
 * R300–R800 (Cape Town R400–R800). Average revenue PER APPOINTMENT across a
 * real book is higher than a bare consult because treatment appointments pull
 * the mean up, so R1,500 is used as a blended default rather than the consult
 * fee itself. Prices are not regulated in SA and vary widely by practice.
 */
export const PRACTICE_DEFAULTS = {
  noShowRatePct: 18,
  avgAppointmentValueZar: 1_500,
  enquiriesPerMonth: 120,
  /**
   * Share of enquiries currently lost to response gaps. Conservative default:
   * this is the number the prospect is most likely to dispute, so it opens low
   * and they raise it if it matches their reality.
   */
  leakRatePct: 25,
  appointmentsPerMonth: 260,
} as const;

export type RoiInputs = {
  enquiriesPerMonth: number;
  /** Share of enquiries that currently never convert because of response gaps (0–1). */
  leakRate: number;
  avgAppointmentValue: number;
  /** Baseline no-show rate as a PERCENTAGE (0–100), as the practice reports it. */
  noShowRate: number;
  appointmentsPerMonth: number;
  /** Recapture rate (0–1) — surfaced as a slider, so it is an input, not a constant. */
  recaptureRate: number;
  monthlyCost: number;
  setupCost: number;
};

export type RoiResult = {
  lostEnquiriesMonthly: number;
  recoveredEnquiriesMonthly: number;
  recoveredEnquiryRevenue: number;
  noShowsMonthly: number;
  recoveredNoShows: number;
  recoveredNoShowRevenue: number;
  recoveredRevenueMonthly: number;
  monthlyCost: number;
  netMonthlyGain: number;
  /** null when the system does not pay for itself under these inputs. */
  paybackMonths: number | null;
  firstYearNet: number;
};

/**
 * Transparent by construction: every line below is a multiplication the
 * prospect can redo on paper. No blended "uplift factor", no undisclosed
 * multiplier. If a number cannot be defended out loud, it does not belong here.
 */
export function computeRoi(inputs: RoiInputs): RoiResult {
  const {
    enquiriesPerMonth,
    leakRate,
    avgAppointmentValue,
    noShowRate,
    appointmentsPerMonth,
    recaptureRate,
    monthlyCost,
    setupCost,
  } = inputs;

  const lostEnquiriesMonthly = enquiriesPerMonth * leakRate;
  const recoveredEnquiriesMonthly = lostEnquiriesMonthly * recaptureRate;
  const recoveredEnquiryRevenue = recoveredEnquiriesMonthly * avgAppointmentValue;

  const noShowsMonthly = appointmentsPerMonth * (noShowRate / 100);
  const recoveredNoShows = noShowsMonthly * ROI_ASSUMPTIONS.noShowRecoveryRate;
  // Only the share that would NOT have rebooked on its own counts as new
  // revenue. See `noShowRescheduleRate` for why this discount exists.
  const recoveredNoShowRevenue =
    recoveredNoShows * avgAppointmentValue * (1 - ROI_ASSUMPTIONS.noShowRescheduleRate);

  const recoveredRevenueMonthly = recoveredEnquiryRevenue + recoveredNoShowRevenue;
  const netMonthlyGain = recoveredRevenueMonthly - monthlyCost;

  // null when the system does not pay for itself. The calculator renders this
  // as an explicit "does not pay back at these numbers" rather than hiding the
  // case or clamping it to something flattering.
  const paybackMonths = netMonthlyGain > 0 ? setupCost / netMonthlyGain : null;

  const firstYearNet = netMonthlyGain * 12 - setupCost;

  return {
    lostEnquiriesMonthly,
    recoveredEnquiriesMonthly,
    recoveredEnquiryRevenue,
    noShowsMonthly,
    recoveredNoShows,
    recoveredNoShowRevenue,
    recoveredRevenueMonthly,
    monthlyCost,
    netMonthlyGain,
    paybackMonths,
    firstYearNet,
  };
}
