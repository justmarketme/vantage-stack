// Canonical, declarative descriptor of the Blueprint forms.
//
// This is the single source of truth for the *structure* and *validation* of
// both the public quick form (3-step branching) and the detailed /blueprint
// route (4 fixed steps). The XState form machine (./form-machine.ts) consumes a
// FormSchema; a future UI can render from the same descriptor so the form, the
// machine, and Isabel's voice layer never drift.
//
// Field keys are the *payload* keys (what `/api/blueprint/submit` receives), so
// `data` here maps 1:1 onto BlueprintSubmitSchema input. Multi-selects hold
// string[]; everything else holds string.

import { isValidWhatsapp, normalizeWebsiteUrl, parseMonthlyBudgetToInt } from "./schema";
import { getIndustryData } from "../crm/industry-data";

export type FormValue = string | string[];
export type FormData = Record<string, FormValue>;

export type OptionDef = string | { value: string; label: string };

export type FieldKind = "text" | "email" | "tel" | "url" | "select" | "cards" | "multi" | "textarea" | "checkbox";

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  /** Static options for select/cards/multi. */
  options?: OptionDef[];
  /** Dynamic options (e.g. sub-niche depends on the chosen industry). */
  getOptions?: (data: FormData) => OptionDef[];
  /** Cap for multi-select fields. */
  maxItems?: number;
  hint?: string;
  /** Field is only present/validated when this returns true. Default: always. */
  visibleWhen?: (data: FormData) => boolean;
  /** Required to advance the step. May depend on data. Default: false. */
  required?: boolean | ((data: FormData) => boolean);
  /** Message shown when a required field is empty. */
  requiredMessage?: string;
  /** Format validation; runs only when the field is visible and non-empty. */
  validate?: (value: FormValue, data: FormData) => string | null;
}

export interface StepDef {
  id: string;
  /** Step label may depend on data (quick step 2 branches on primaryIntent). */
  label: (data: FormData) => string;
  intro?: (data: FormData) => string;
  fields: FieldDef[];
}

export interface FormSchema {
  id: "quick" | "detailed";
  steps: StepDef[];
  /** Map collected data → the `/api/blueprint/submit` payload. */
  buildPayload: (data: FormData) => Record<string, unknown>;
}

// ─── value helpers ──────────────────────────────────────────────────────────

export const asString = (v: FormValue | undefined): string => (typeof v === "string" ? v : "");
export const asArray = (v: FormValue | undefined): string[] => (Array.isArray(v) ? v : []);
export const isNonEmpty = (v: FormValue | undefined): boolean =>
  Array.isArray(v) ? v.length > 0 : asString(v).trim().length > 0;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmailValue(v: FormValue): string | null {
  const s = asString(v).trim();
  if (!s) return "Email is required.";
  return EMAIL_RE.test(s.toLowerCase()) ? null : "Please enter a valid email address.";
}

export function validateWhatsappValue(v: FormValue): string | null {
  const s = asString(v).trim();
  if (!s) return "WhatsApp number is required.";
  return isValidWhatsapp(s) ? null : "Please enter a valid WhatsApp number.";
}

export function validateOptionalUrl(v: FormValue): string | null {
  const s = asString(v).trim();
  if (!s) return null;
  return normalizeWebsiteUrl(s) ? null : "Please enter a valid website URL (or leave blank).";
}

export function validateOptionalBudget(v: FormValue): string | null {
  const s = asString(v).trim();
  if (!s) return null;
  return parseMonthlyBudgetToInt(s) ? null : "Monthly budget must look like a number (e.g. 5000 or 5k).";
}

/** Compute validation errors for one step's currently-visible fields. */
export function validateStepData(step: StepDef, data: FormData): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of step.fields) {
    if (f.visibleWhen && !f.visibleWhen(data)) continue;
    const required = typeof f.required === "function" ? f.required(data) : Boolean(f.required);
    const value = data[f.key];
    if (required && !isNonEmpty(value)) {
      errors[f.key] = f.requiredMessage ?? "This field is required.";
      continue;
    }
    if (f.validate && isNonEmpty(value)) {
      const msg = f.validate(value as FormValue, data);
      if (msg) errors[f.key] = msg;
    }
  }
  return errors;
}

/** The first visible field of a step — drives the `fieldHighlighted` event. */
export function firstVisibleField(step: StepDef, data: FormData): string | null {
  for (const f of step.fields) {
    if (f.visibleWhen && !f.visibleWhen(data)) continue;
    return f.key;
  }
  return null;
}

// ─── shared option sets ─────────────────────────────────────────────────────

const INDUSTRIES: string[] = [
  "E-commerce", "Professional services", "Healthcare", "Real estate", "Construction",
  "Education", "Hospitality", "Technology", "Financial services", "Retail",
  "Food & Beverage", "Marketing", "Other",
];

const REVENUE_RANGES: string[] = [
  "Prefer not to say", "Under R50k/month", "R50k – R150k/month",
  "R150k – R500k/month", "R500k – R1m/month", "Over R1m/month",
];

const WEBSITE_EXISTS: string[] = ["Yes — it's live", "In progress / being built", "No — I need one built"];

const INTENTS: OptionDef[] = [
  { value: "LEADS", label: "I'm losing leads — enquiries come in but don't convert" },
  { value: "PRESENCE", label: "I need a proper online presence — website and/or Google visibility" },
  { value: "AUTOMATION", label: "I want to automate the admin and repetitive tasks" },
  { value: "EXPLORE", label: "I'm not sure — just want to see what's possible" },
];

const VENDOR_EXP: string[] = [
  "Digital marketing or SEO agency",
  "Web design or development studio",
  "Social media manager",
  "CRM or automation consultant",
  "AI solutions or tech solutions provider",
  "Business or growth consultant",
  "None yet — first time exploring this",
];

const isIntent = (intent: string) => (d: FormData) => asString(d.primaryIntent) === intent;
const hasLiveSite = (d: FormData) => asString(d.websiteExists) === "Yes — it's live";

// ─── QUICK FORM ─────────────────────────────────────────────────────────────

const STEP2_LABELS: Record<string, string> = {
  LEADS: "STEP 2 OF 3: YOUR LEADS",
  PRESENCE: "STEP 2 OF 3: YOUR ONLINE PRESENCE",
  AUTOMATION: "STEP 2 OF 3: YOUR CURRENT SETUP",
  EXPLORE: "STEP 2 OF 3: QUICK CONTEXT",
};

const STEP2_INTROS: Record<string, string> = {
  LEADS: "Got it. Let's find out where things are slipping through.",
  PRESENCE: "Perfect. Let's see where you're visible — and where you're not.",
  AUTOMATION: "Good call. Let's figure out what's eating your time and where automation makes the most sense.",
  EXPLORE: "No problem — let's keep it quick. Just a couple of things so we can point you in the right direction.",
};

export const quickFormSchema: FormSchema = {
  id: "quick",
  steps: [
    {
      id: "business",
      label: () => "STEP 1 OF 3: YOUR BUSINESS",
      fields: [
        { key: "clientName", label: "Your name & business name", kind: "text", required: true, requiredMessage: "Name is required." },
        { key: "industry", label: "What industry are you in?", kind: "select", options: INDUSTRIES, required: true, requiredMessage: "Please select your industry." },
        {
          key: "industryCustomDescription",
          label: "Describe your industry or type of business",
          kind: "text",
          visibleWhen: (d) => asString(d.industry) === "Other",
          required: (d) => asString(d.industry) === "Other",
          requiredMessage: "Please describe your industry.",
          validate: (v) => (asString(v).length > 100 ? "Keep it under 100 characters." : null),
        },
        {
          key: "subNiche",
          label: "Which best describes your area of focus?",
          kind: "cards",
          visibleWhen: (d) => Boolean(asString(d.industry)) && asString(d.industry) !== "Other",
          getOptions: (d) => {
            try { return getIndustryData(asString(d.industry)).subNiches ?? []; } catch { return []; }
          },
        },
        { key: "websiteExists", label: "Do you currently have a website?", kind: "cards", options: WEBSITE_EXISTS, required: true, requiredMessage: "Please select an option." },
        { key: "revenueRange", label: "Roughly, what's your current monthly revenue?", kind: "select", options: REVENUE_RANGES, required: true, requiredMessage: "Please select your revenue range." },
        { key: "primaryIntent", label: "What's the main reason you're here today?", kind: "cards", options: INTENTS, required: true, requiredMessage: "Please pick an option so we can tailor the next questions." },
        {
          key: "previousVendorExp",
          label: "Have you worked with any of these before to grow your business?",
          kind: "multi",
          options: VENDOR_EXP,
          visibleWhen: (d) => Boolean(asString(d.primaryIntent)),
        },
      ],
    },
    {
      id: "context",
      label: (d) => STEP2_LABELS[asString(d.primaryIntent)] ?? "STEP 2 OF 3: GROWTH CONTEXT",
      intro: (d) => STEP2_INTROS[asString(d.primaryIntent)] ?? "",
      fields: [
        // ── LEADS ──
        { key: "enquiryVolume", label: "Roughly how many enquiries or leads do you get per week?", kind: "cards", visibleWhen: isIntent("LEADS"), required: isIntent("LEADS"), requiredMessage: "Please select an option.", options: ["Fewer than 10", "10 – 30", "30 – 60", "More than 60", "I honestly don't know"] },
        { key: "followUpMethod", label: "How do you currently follow up with new enquiries?", kind: "cards", visibleWhen: isIntent("LEADS"), required: isIntent("LEADS"), requiredMessage: "Please select an option.", options: ["I call or WhatsApp them manually", "I use a spreadsheet or shared doc", "I have a CRM system", "Honestly, follow-up is inconsistent", "We don't really — they follow up with us"] },
        { key: "missedCallHandling", label: "When someone calls and no one answers — what happens?", kind: "cards", visibleWhen: isIntent("LEADS"), required: isIntent("LEADS"), requiredMessage: "Please select an option.", options: ["They usually call back", "We miss it and find out later", "We have voicemail but rarely check it", "Not sure"] },
        { key: "conversionRate", label: "Of every 10 enquiries you get, roughly how many become paying clients?", kind: "cards", visibleWhen: isIntent("LEADS"), options: ["1–2", "3–4", "5–6", "7 or more", "I don't track this"] },
        { key: "speedToContact", label: "How quickly do you typically respond to a new enquiry?", kind: "cards", visibleWhen: isIntent("LEADS"), options: ["Within 5 minutes", "Within the hour", "Same day", "It varies", "Next day or later"] },
        { key: "monthlyBudget", label: "Monthly marketing budget (optional)", kind: "select", visibleWhen: isIntent("LEADS"), options: ["Under R2k/month", "R2k – R5k/month", "R5k – R15k/month", "Over R15k/month"] },
        // ── PRESENCE ──
        { key: "currentWebsiteStatus", label: "How is your current website performing?", kind: "cards", visibleWhen: (d) => isIntent("PRESENCE")(d) && hasLiveSite(d), required: (d) => isIntent("PRESENCE")(d) && hasLiveSite(d), requiredMessage: "Please select an option.", options: ["It's outdated or not working well", "It works fine but could be better", "It works great — I just want more visibility"] },
        { key: "googleMapsStatus", label: "Are you on Google Maps? (Google Business Profile)", kind: "cards", visibleWhen: isIntent("PRESENCE"), required: isIntent("PRESENCE"), requiredMessage: "Please select an option.", options: ["Yes — fully set up and verified", "Yes — but it's incomplete or unverified", "No — I'm not on there", "Not sure — I've never checked"] },
        { key: "websiteGoal", label: "When someone finds you online, what do you want them to do?", kind: "multi", visibleWhen: isIntent("PRESENCE"), required: isIntent("PRESENCE"), requiredMessage: "Please select at least one option.", options: ["Call me directly", "Fill in a contact / enquiry form", "Book an appointment themselves", "Get a quote", "Just find my business info"] },
        { key: "serveArea", label: "Who do you serve?", kind: "cards", visibleWhen: isIntent("PRESENCE"), required: isIntent("PRESENCE"), requiredMessage: "Please select an option.", options: ["Clients in my local area / city", "Clients across South Africa", "Both local and national"] },
        { key: "clientAcquisition", label: "Currently, how do most clients find you?", kind: "cards", visibleWhen: isIntent("PRESENCE"), required: isIntent("PRESENCE"), requiredMessage: "Please select an option.", options: ["Referrals / word of mouth", "Google search", "Social media", "Google Ads / Meta Ads", "I'm not sure — I don't track it"] },
        { key: "siteConversionStatus", label: "Are you currently getting enquiries through your website?", kind: "cards", visibleWhen: (d) => isIntent("PRESENCE")(d) && hasLiveSite(d), options: ["Yes, regularly", "Occasionally", "Rarely or never", "No idea — I don't track it"] },
        // ── AUTOMATION ──
        { key: "biggestTimeWaste", label: "What takes up the most repetitive time in your business right now?", kind: "multi", maxItems: 2, visibleWhen: isIntent("AUTOMATION"), required: isIntent("AUTOMATION"), requiredMessage: "Please select at least one option.", options: ["Replying to the same WhatsApp / enquiry messages", "Following up with leads who went quiet", "Booking or confirming appointments", "Sending quotes manually", "Admin, reporting, or data capturing", "Onboarding new clients"] },
        { key: "toolsUsed", label: "What tools or systems do you already use?", kind: "multi", visibleWhen: isIntent("AUTOMATION"), required: isIntent("AUTOMATION"), requiredMessage: "Please select at least one option.", options: ["WhatsApp Business", "A CRM (e.g. HubSpot, Zoho, Pipedrive)", "Google Workspace (Gmail, Sheets, etc.)", "Spreadsheets / Excel", "Booking system (e.g. Calendly, SimplyBook)", "Accounting software (e.g. Xero, Sage)", "None — everything is manual"] },
        { key: "teamSize", label: "How many people handle client enquiries at your business?", kind: "cards", visibleWhen: isIntent("AUTOMATION"), required: isIntent("AUTOMATION"), requiredMessage: "Please select an option.", options: ["Just me", "2 – 5 people", "6 – 15 people", "More than 15"] },
        { key: "hoursLostPerWeek", label: "Roughly how many hours per week does your team lose to these tasks?", kind: "cards", visibleWhen: isIntent("AUTOMATION"), options: ["1–3 hrs", "3–6 hrs", "6–10 hrs", "10+ hours"] },
        // ── EXPLORE ──
        { key: "biggestFrustration", label: "If you had to pick one — what's the biggest thing holding your business back right now?", kind: "cards", visibleWhen: isIntent("EXPLORE"), required: isIntent("EXPLORE"), requiredMessage: "Please select an option.", options: ["Not enough leads / visibility", "Leads come in but don't convert", "Too much admin and manual work", "The business is growing but systems can't keep up", "I'm not sure yet"] },
        { key: "packagePreference", label: "Of our three systems, which sounds closest to what you need?", kind: "cards", visibleWhen: isIntent("EXPLORE"), options: ["Starter System (AI call handler + CRM + follow-up)", "Growth System (full website + multi-channel automation)", "Revenue System (full AI build — calls, CRM, 3 buyer flows)", "Not sure — recommend one for me"] },
      ],
    },
    {
      id: "contact",
      label: () => "STEP 3 OF 3: CONTACT",
      fields: [
        { key: "email", label: "Email address", kind: "email", required: true, requiredMessage: "Email is required.", validate: validateEmailValue },
        { key: "whatsapp", label: "WhatsApp number", kind: "tel", required: true, requiredMessage: "WhatsApp number is required.", validate: validateWhatsappValue, hint: "Include country code if possible (e.g. +27…)." },
        { key: "websiteUrl", label: "Website URL (optional)", kind: "url", validate: validateOptionalUrl },
        { key: "urgencyTimeline", label: "When are you looking to get started? (optional)", kind: "cards", options: ["ASAP — I need this now", "Within the next month", "Just exploring for now"] },
        { key: "primarySocialHandle", label: "Your most active social profile (optional)", kind: "text", hint: "@yourbusiness or paste a profile link" },
        { key: "preferredContactTime", label: "Best time to reach you (optional)", kind: "text" },
        {
          key: "whatsappConsent",
          label:
            "I agree to VantageStack contacting me on WhatsApp about my blueprint. I can opt out any time by replying STOP. (POPIA)",
          kind: "checkbox",
          required: true,
          requiredMessage: "Please tick to consent to WhatsApp contact so we can send your blueprint.",
        },
      ],
    },
  ],
  buildPayload: (data) => {
    const websiteExists = asString(data.websiteExists);
    const currentWebsiteStatus =
      websiteExists === "Yes — it's live"
        ? asString(data.currentWebsiteStatus)
        : websiteExists === "No — I need one built"
          ? "No — I need one built from scratch"
          : websiteExists === "In progress / being built"
            ? "In progress / being built"
            : asString(data.currentWebsiteStatus);
    return {
      clientName: asString(data.clientName).trim(),
      email: asString(data.email).trim(),
      whatsapp: asString(data.whatsapp).trim(),
      websiteUrl: asString(data.websiteUrl).trim(),
      industry: asString(data.industry),
      subNiche: asString(data.subNiche),
      industryCustomDescription: asString(data.industryCustomDescription),
      websiteExists,
      revenueRange: asString(data.revenueRange),
      primaryIntent: asString(data.primaryIntent),
      previousVendorExp: asArray(data.previousVendorExp),
      enquiryVolume: asString(data.enquiryVolume),
      followUpMethod: asString(data.followUpMethod),
      missedCallHandling: asString(data.missedCallHandling),
      conversionRate: asString(data.conversionRate),
      speedToContact: asString(data.speedToContact),
      currentWebsiteStatus,
      googleMapsStatus: asString(data.googleMapsStatus),
      websiteGoal: asArray(data.websiteGoal),
      serveArea: asString(data.serveArea),
      siteConversionStatus: asString(data.siteConversionStatus),
      biggestTimeWaste: asArray(data.biggestTimeWaste),
      toolsUsed: asArray(data.toolsUsed),
      teamSize: asString(data.teamSize),
      hoursLostPerWeek: asString(data.hoursLostPerWeek),
      biggestFrustration: asString(data.biggestFrustration),
      packagePreference: asString(data.packagePreference),
      clientAcquisition: asString(data.clientAcquisition),
      monthlyBudget: asString(data.monthlyBudget),
      preferredContactTime: asString(data.preferredContactTime),
      urgencyTimeline: asString(data.urgencyTimeline),
      primarySocialHandle: asString(data.primarySocialHandle),
      whatsappConsent: asString(data.whatsappConsent) === "true",
      currentMarketing: asString(data.clientAcquisition), // backward-compat with CRM
    };
  },
};

// ─── DETAILED FORM ──────────────────────────────────────────────────────────

const DETAILED_INDUSTRIES = INDUSTRIES;
const DETAILED_REVENUE = ["Prefer not to say", "Under R50k/month", "R50k - R150k/month", "R150k - R500k/month", "R500k - R1m/month", "Over R1m/month", "Other"];
const DETAILED_BUDGET = ["Under R5k/month", "R5k - R15k/month", "R15k - R40k/month", "R40k - R100k/month", "Over R100k/month", "Other"];

export const detailedFormSchema: FormSchema = {
  id: "detailed",
  steps: [
    {
      id: "contact",
      label: () => "Contact",
      fields: [
        { key: "clientName", label: "Client name / business name", kind: "text", required: true, requiredMessage: "This field is required." },
        { key: "email", label: "Email address", kind: "email", required: true, requiredMessage: "Email is required.", validate: validateEmailValue },
        { key: "whatsapp", label: "WhatsApp number", kind: "tel", required: true, requiredMessage: "WhatsApp number is required.", validate: validateWhatsappValue, hint: "Include country code if possible (e.g. +27…)." },
        { key: "websiteUrl", label: "Website URL (optional)", kind: "url", validate: validateOptionalUrl },
      ],
    },
    {
      id: "social",
      label: () => "Social media",
      fields: [
        { key: "socialInstagram", label: "Instagram profile URL (optional)", kind: "url", validate: validateOptionalUrl },
        { key: "socialTiktok", label: "TikTok profile URL (optional)", kind: "url", validate: validateOptionalUrl },
        { key: "socialFacebook", label: "Facebook page URL (optional)", kind: "url", validate: validateOptionalUrl },
        { key: "socialX", label: "X (Twitter) profile URL (optional)", kind: "url", validate: validateOptionalUrl },
        { key: "socialYoutube", label: "YouTube channel URL (optional)", kind: "url", validate: validateOptionalUrl },
      ],
    },
    {
      id: "business",
      label: () => "Business",
      fields: [
        { key: "industry", label: "Industry / niche", kind: "select", options: DETAILED_INDUSTRIES, required: true, requiredMessage: "This field is required." },
        { key: "revenueRange", label: "Current monthly revenue range", kind: "select", options: DETAILED_REVENUE, required: true, requiredMessage: "This field is required." },
        { key: "monthlyBudget", label: "Monthly marketing budget (optional)", kind: "select", options: DETAILED_BUDGET, validate: validateOptionalBudget },
      ],
    },
    {
      id: "growth",
      label: () => "Growth context",
      fields: [
        { key: "challenges", label: "Biggest business challenges", kind: "textarea", required: true, requiredMessage: "This field is required." },
        { key: "competitors", label: "Top 2–3 competitors (optional)", kind: "textarea" },
        { key: "currentMarketing", label: "How do you currently get clients?", kind: "select", options: ["Referrals / word of mouth", "Google Ads", "Meta Ads", "Organic social media", "SEO / content", "Outbound sales", "Other"], required: true, requiredMessage: "This field is required." },
        { key: "toolsUsed", label: "Tools you're currently using (optional)", kind: "textarea" },
        { key: "successGoals", label: "What does success look like in 6 months? (optional)", kind: "textarea" },
        { key: "packageIntent", label: "Which system looks best? (optional)", kind: "select", options: [{ value: "Starter", label: "Starter System" }, { value: "Growth", label: "Growth System" }, { value: "Revenue", label: "Revenue System™" }] },
        {
          key: "whatsappConsent",
          label:
            "I agree to VantageStack contacting me on WhatsApp about my blueprint. I can opt out any time by replying STOP. (POPIA)",
          kind: "checkbox",
          required: true,
          requiredMessage: "Please tick to consent to WhatsApp contact so we can send your blueprint.",
        },
      ],
    },
  ],
  buildPayload: (data) => ({
    clientName: asString(data.clientName).trim(),
    email: asString(data.email).trim(),
    whatsapp: asString(data.whatsapp).trim(),
    websiteUrl: asString(data.websiteUrl).trim(),
    socialInstagram: asString(data.socialInstagram).trim(),
    socialTiktok: asString(data.socialTiktok).trim(),
    socialFacebook: asString(data.socialFacebook).trim(),
    socialX: asString(data.socialX).trim(),
    socialYoutube: asString(data.socialYoutube).trim(),
    industry: asString(data.industry),
    revenueRange: asString(data.revenueRange),
    monthlyBudget: asString(data.monthlyBudget),
    challenges: asString(data.challenges),
    competitors: asString(data.competitors),
    currentMarketing: asString(data.currentMarketing),
    toolsUsed: asString(data.toolsUsed),
    successGoals: asString(data.successGoals),
    packageIntent: asString(data.packageIntent),
    whatsappConsent: asString(data.whatsappConsent) === "true",
  }),
};

export const FORM_SCHEMAS: Record<"quick" | "detailed", FormSchema> = {
  quick: quickFormSchema,
  detailed: detailedFormSchema,
};
