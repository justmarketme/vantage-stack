"use client";

import { useMemo, useState } from "react";
import { BlueprintSubmitSchema, normalizeWebsiteUrl, parseMonthlyBudgetToInt } from "../../lib/blueprint/schema";
import { FormField } from "../ui/FormField";
import { ProgressBar } from "../ui/ProgressBar";
import { getCompetitorSuggestions } from "../../lib/crm/industry-data";

export type BlueprintMode = "quick" | "detailed";

// ─── Quick-mode form state ────────────────────────────────────────────────────

type QuickFormState = {
  // Step 1
  clientName: string;
  industry: string;
  revenueRange: string;
  primaryIntent: string; // LEADS | PRESENCE | AUTOMATION | EXPLORE
  // Step 2 Path A
  enquiryVolume: string;
  followUpMethod: string;
  missedCallHandling: string;
  // Step 2 Path B
  currentWebsiteStatus: string;
  googleMapsStatus: string;
  websiteGoalArr: string[]; // multi-select
  serveArea: string;
  // Step 2 Path C
  biggestTimeWasteArr: string[]; // multi-select max 2
  toolsUsedArr: string[]; // multi-select
  teamSize: string;
  // Step 2 Path D
  biggestFrustration: string;
  packagePreference: string;
  // Shared
  clientAcquisition: string;
  monthlyBudget: string;
  // Step 3
  email: string;
  whatsapp: string;
  websiteUrl: string;
  preferredContactTime: string;
};

const quickInitial: QuickFormState = {
  clientName: "",
  industry: "",
  revenueRange: "",
  primaryIntent: "",
  enquiryVolume: "",
  followUpMethod: "",
  missedCallHandling: "",
  currentWebsiteStatus: "",
  googleMapsStatus: "",
  websiteGoalArr: [],
  serveArea: "",
  biggestTimeWasteArr: [],
  toolsUsedArr: [],
  teamSize: "",
  biggestFrustration: "",
  packagePreference: "",
  clientAcquisition: "",
  monthlyBudget: "",
  email: "",
  whatsapp: "",
  websiteUrl: "",
  preferredContactTime: "",
};

// ─── Detailed-mode form state (CRM manual entry — unchanged structure) ────────

type DetailedFormState = {
  clientName: string;
  email: string;
  whatsapp: string;
  websiteUrl: string;
  industry: string;
  revenueRange: string;
  challenges: string;
  competitors: string;
  currentMarketing: string;
  toolsUsed: string;
  monthlyBudget: string;
  packageIntent: string;
  successGoals: string;
  primaryIntent: string;
  socialInstagram: string;
  socialTiktok: string;
  socialFacebook: string;
  socialX: string;
  socialYoutube: string;
};

const detailedInitial: DetailedFormState = {
  clientName: "",
  email: "",
  whatsapp: "",
  websiteUrl: "",
  industry: "",
  revenueRange: "",
  challenges: "",
  competitors: "",
  currentMarketing: "",
  toolsUsed: "",
  monthlyBudget: "",
  packageIntent: "",
  successGoals: "",
  primaryIntent: "",
  socialInstagram: "",
  socialTiktok: "",
  socialFacebook: "",
  socialX: "",
  socialYoutube: "",
};

type DetailedFieldKey = keyof DetailedFormState;

// ─── Tap card components ───────────────────────────────────────────────────────

function TapCard({
  value,
  selected,
  onClick,
  label,
  sub,
}: {
  value: string;
  selected: boolean;
  onClick: () => void;
  label: string;
  sub?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-lg border px-4 py-3 transition-all ${
        selected
          ? "border-accent bg-accent/10 text-textPrimary"
          : "border-white/10 bg-white/3 text-textMuted hover:border-white/20 hover:bg-white/6 hover:text-textPrimary"
      }`}
    >
      <span className="text-sm font-medium">{label}</span>
      {sub && <span className="block text-xs text-textMuted/70 mt-0.5">{sub}</span>}
    </button>
  );
}

function MultiCard({
  value,
  selected,
  onClick,
  label,
  disabled,
}: {
  value: string;
  selected: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left rounded-lg border px-4 py-3 transition-all ${
        selected
          ? "border-accent bg-accent/10 text-textPrimary"
          : disabled
            ? "border-white/5 bg-white/2 text-textMuted/40 cursor-not-allowed"
            : "border-white/10 bg-white/3 text-textMuted hover:border-white/20 hover:bg-white/6 hover:text-textPrimary"
      }`}
    >
      <span className="text-sm">{selected ? "✓ " : ""}{label}</span>
    </button>
  );
}

// ─── Quick-mode step 2 label ──────────────────────────────────────────────────

function step2Label(intent: string): string {
  switch (intent) {
    case "LEADS": return "STEP 2 OF 3: YOUR LEADS";
    case "PRESENCE": return "STEP 2 OF 3: YOUR ONLINE PRESENCE";
    case "AUTOMATION": return "STEP 2 OF 3: YOUR CURRENT SETUP";
    case "EXPLORE": return "STEP 2 OF 3: QUICK CONTEXT";
    default: return "STEP 2 OF 3: GROWTH CONTEXT";
  }
}

function step2Intro(intent: string): string {
  switch (intent) {
    case "LEADS": return "Got it. Let's find out where things are slipping through.";
    case "PRESENCE": return "Perfect. Let's see where you're visible — and where you're not.";
    case "AUTOMATION": return "Good call. Let's figure out what's eating your time and where automation makes the most sense.";
    case "EXPLORE": return "No problem — let's keep it quick. Just a couple of things so we can point you in the right direction.";
    default: return "";
  }
}

// ─── Validation helpers ───────────────────────────────────────────────────────

function validateEmail(v: string): string | null {
  if (!v.trim()) return "Email is required.";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim().toLowerCase()) ? null : "Please enter a valid email address.";
}

function validateWhatsapp(v: string): string | null {
  if (!v.trim()) return "WhatsApp number is required.";
  const digits = v.replace(/[^\d]/g, "");
  return digits.length >= 8 && digits.length <= 15 ? null : "Please enter a valid WhatsApp number.";
}

function validateWebsiteUrl(v: string): string | null {
  if (!v.trim()) return null;
  return normalizeWebsiteUrl(v) ? null : "Please enter a valid website URL (or leave blank).";
}

// ─── Main component ───────────────────────────────────────────────────────────

export function UnifiedBlueprintForm({ mode = "detailed" }: { mode?: BlueprintMode }) {
  if (mode === "quick") return <QuickForm />;
  return <DetailedForm />;
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUICK FORM — 3-step public-facing form with branching
// ═══════════════════════════════════════════════════════════════════════════════

function QuickForm() {
  const [step, setStep] = useState(0); // 0=Step1, 1=Step2, 2=Step3
  const [form, setForm] = useState<QuickFormState>(quickInitial);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ clientId: string } | null>(null);

  const progress = Math.round(((step + 1) / 3) * 100);

  function setField<K extends keyof QuickFormState>(key: K, value: QuickFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function toggleMulti(
    key: "websiteGoalArr" | "biggestTimeWasteArr" | "toolsUsedArr",
    val: string,
    maxItems?: number,
  ) {
    setForm((prev) => {
      const arr = prev[key] as string[];
      if (arr.includes(val)) return { ...prev, [key]: arr.filter((x) => x !== val) };
      if (maxItems && arr.length >= maxItems) return prev; // cap reached
      return { ...prev, [key]: [...arr, val] };
    });
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validateStep1(): boolean {
    const errs: Record<string, string> = {};
    if (!form.clientName.trim()) errs.clientName = "Name is required.";
    if (!form.industry) errs.industry = "Please select your industry.";
    if (!form.revenueRange) errs.revenueRange = "Please select your revenue range.";
    if (!form.primaryIntent) errs.primaryIntent = "Please pick an option so we can tailor the next questions.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function validateStep2(): boolean {
    const errs: Record<string, string> = {};
    const intent = form.primaryIntent;
    if (intent === "LEADS") {
      if (!form.enquiryVolume) errs.enquiryVolume = "Please select an option.";
      if (!form.followUpMethod) errs.followUpMethod = "Please select an option.";
      if (!form.missedCallHandling) errs.missedCallHandling = "Please select an option.";
      if (!form.clientAcquisition) errs.clientAcquisition = "Please select an option.";
    } else if (intent === "PRESENCE") {
      if (!form.currentWebsiteStatus) errs.currentWebsiteStatus = "Please select an option.";
      if (!form.googleMapsStatus) errs.googleMapsStatus = "Please select an option.";
      if (form.websiteGoalArr.length === 0) errs.websiteGoalArr = "Please select at least one option.";
      if (!form.serveArea) errs.serveArea = "Please select an option.";
      if (!form.clientAcquisition) errs.clientAcquisition = "Please select an option.";
    } else if (intent === "AUTOMATION") {
      if (form.biggestTimeWasteArr.length === 0) errs.biggestTimeWasteArr = "Please select at least one option.";
      if (form.toolsUsedArr.length === 0) errs.toolsUsedArr = "Please select at least one option.";
      if (!form.currentWebsiteStatus) errs.currentWebsiteStatus = "Please select an option.";
      if (!form.teamSize) errs.teamSize = "Please select an option.";
      if (!form.clientAcquisition) errs.clientAcquisition = "Please select an option.";
    } else if (intent === "EXPLORE") {
      if (!form.biggestFrustration) errs.biggestFrustration = "Please select an option.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function validateStep3(): boolean {
    const errs: Record<string, string> = {};
    const emailErr = validateEmail(form.email);
    if (emailErr) errs.email = emailErr;
    const waErr = validateWhatsapp(form.whatsapp);
    if (waErr) errs.whatsapp = waErr;
    const urlErr = validateWebsiteUrl(form.websiteUrl);
    if (urlErr) errs.websiteUrl = urlErr;
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function goNext() {
    const valid = step === 0 ? validateStep1() : step === 1 ? validateStep2() : true;
    if (valid) setStep((s) => s + 1);
  }

  async function handleSubmit() {
    if (!validateStep3()) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const intent = form.primaryIntent;
      const payload = {
        clientName: form.clientName.trim(),
        email: form.email.trim(),
        whatsapp: form.whatsapp.trim(),
        websiteUrl: form.websiteUrl.trim(),
        industry: form.industry,
        revenueRange: form.revenueRange,
        primaryIntent: intent,
        enquiryVolume: form.enquiryVolume,
        followUpMethod: form.followUpMethod,
        missedCallHandling: form.missedCallHandling,
        currentWebsiteStatus: form.currentWebsiteStatus,
        googleMapsStatus: form.googleMapsStatus,
        websiteGoal: form.websiteGoalArr,
        serveArea: form.serveArea,
        biggestTimeWaste: form.biggestTimeWasteArr,
        toolsUsed: form.toolsUsedArr,
        teamSize: form.teamSize,
        biggestFrustration: form.biggestFrustration,
        packagePreference: form.packagePreference,
        clientAcquisition: form.clientAcquisition,
        monthlyBudget: form.monthlyBudget,
        preferredContactTime: form.preferredContactTime,
        currentMarketing: form.clientAcquisition, // backward compat with CRM
      };

      const parsed = BlueprintSubmitSchema.safeParse(payload);
      if (!parsed.success) {
        const mapped: Record<string, string> = {};
        for (const i of parsed.error.issues) {
          const k = String(i.path?.[0] ?? "");
          if (k) mapped[k] = i.message;
        }
        setErrors(mapped);
        setSubmitError("Please fix the highlighted fields.");
        return;
      }

      const res = await fetch("/api/blueprint/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setSubmitError(String(json?.error || "Submission failed. Please try again."));
        return;
      }
      setSuccess({ clientId: String(json.clientId) });
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="vs-card">
        <div className="space-y-3">
          <p className="vs-section-heading">Blueprint submitted</p>
          <h2 className="font-heading text-2xl md:text-3xl">You're in.</h2>
          <p className="text-sm text-textMuted max-w-2xl">
            We'll review your answers and send a tailored breakdown within 1 business day. No generic responses — we
            actually look at your specific situation.
          </p>
          <p className="text-xs text-textMuted/60">Reference: {success.clientId}</p>
        </div>
      </div>
    );
  }

  const stepLabels = ["STEP 1 OF 3: YOUR BUSINESS", step2Label(form.primaryIntent), "STEP 3 OF 3: CONTACT"];

  return (
    <div className="vs-card">
      {/* Header */}
      <div className="mb-6 space-y-2">
        <p className="vs-section-heading">{stepLabels[step]}</p>
        {step === 0 && (
          <>
            <p className="text-xs text-textMuted/60 uppercase tracking-widest">Quick Blueprint — Under 2 minutes</p>
            <h2 className="font-heading text-xl md:text-2xl">Tell us about your business.</h2>
            <p className="text-sm text-textMuted max-w-2xl">
              Answer a few questions so we can point you to exactly what needs fixing — and what to prioritise first.
            </p>
          </>
        )}
        {step === 1 && (
          <p className="text-sm text-textMuted/80 italic">{step2Intro(form.primaryIntent)}</p>
        )}
        {step === 2 && (
          <>
            <h2 className="font-heading text-xl md:text-2xl">Almost done — where should we send your report?</h2>
            <p className="text-sm text-textMuted max-w-2xl">
              We'll review your answers and send a tailored breakdown within 1 business day. No generic responses — we
              actually look at your specific situation.
            </p>
          </>
        )}
      </div>

      <div className="mb-8">
        <ProgressBar value={progress} label={`Step ${step + 1} of 3`} />
      </div>

      <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
        {/* ── STEP 1 ── */}
        {step === 0 && (
          <>
            {/* Client name */}
            <FormField
              kind="input"
              label="Your name & business name"
              required
              value={form.clientName}
              onChange={(v) => setField("clientName", v)}
              placeholder="e.g. John — Apex Plumbing"
              error={errors.clientName}
              touched={!!errors.clientName}
              autoComplete="organization"
            />

            {/* Industry */}
            <div className="space-y-2">
              <label className="block text-sm text-textPrimary/90">
                What industry are you in? <span className="text-accent">*</span>
              </label>
              <select
                className="vs-input"
                value={form.industry}
                onChange={(e) => setField("industry", e.target.value)}
              >
                <option value="">Select an option</option>
                {[
                  "E-commerce","Professional services","Healthcare","Real estate","Construction",
                  "Education","Hospitality","Technology","Financial services","Retail",
                  "Food & Beverage","Marketing","Other",
                ].map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              {errors.industry && <p className="text-xs text-red-300">{errors.industry}</p>}
            </div>

            {/* Revenue range */}
            <div className="space-y-2">
              <label className="block text-sm text-textPrimary/90">
                Roughly, what's your current monthly revenue? <span className="text-accent">*</span>
              </label>
              <p className="text-xs text-textMuted/60">
                This helps us recommend the right starting point — not the most expensive one.
              </p>
              <select
                className="vs-input"
                value={form.revenueRange}
                onChange={(e) => setField("revenueRange", e.target.value)}
              >
                <option value="">Select an option</option>
                {[
                  "Prefer not to say","Under R50k/month","R50k – R150k/month",
                  "R150k – R500k/month","R500k – R1m/month","Over R1m/month",
                ].map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              {errors.revenueRange && <p className="text-xs text-red-300">{errors.revenueRange}</p>}
            </div>

            {/* Intent tap cards */}
            <div className="space-y-3">
              <label className="block text-sm text-textPrimary/90">
                What's the main reason you're here today? <span className="text-accent">*</span>
              </label>
              <p className="text-xs text-textMuted/60">
                Pick the one that fits best — we'll tailor the next questions around it.
              </p>
              <div className="grid gap-2">
                {[
                  { value: "LEADS", label: "I'm losing leads — enquiries come in but don't convert" },
                  { value: "PRESENCE", label: "I need a proper online presence — website and/or Google visibility" },
                  { value: "AUTOMATION", label: "I want to automate the admin and repetitive tasks" },
                  { value: "EXPLORE", label: "I'm not sure — just want to see what's possible" },
                ].map((opt) => (
                  <TapCard
                    key={opt.value}
                    value={opt.value}
                    label={opt.label}
                    selected={form.primaryIntent === opt.value}
                    onClick={() => setField("primaryIntent", opt.value)}
                  />
                ))}
              </div>
              {errors.primaryIntent && <p className="text-xs text-red-300">{errors.primaryIntent}</p>}
            </div>
          </>
        )}

        {/* ── STEP 2 PATH A: LEADS ── */}
        {step === 1 && form.primaryIntent === "LEADS" && (
          <>
            <TapCardGroup
              label="Roughly how many enquiries or leads do you get per week?"
              required
              value={form.enquiryVolume}
              onChange={(v) => setField("enquiryVolume", v)}
              error={errors.enquiryVolume}
              options={[
                "Fewer than 10","10 – 30","30 – 60","More than 60","I honestly don't know",
              ]}
            />
            <TapCardGroup
              label="How do you currently follow up with new enquiries?"
              required
              value={form.followUpMethod}
              onChange={(v) => setField("followUpMethod", v)}
              error={errors.followUpMethod}
              options={[
                "I call or WhatsApp them manually",
                "I use a spreadsheet or shared doc",
                "I have a CRM system",
                "Honestly, follow-up is inconsistent",
                "We don't really — they follow up with us",
              ]}
            />
            <TapCardGroup
              label="When someone calls and no one answers — what happens?"
              required
              value={form.missedCallHandling}
              onChange={(v) => setField("missedCallHandling", v)}
              error={errors.missedCallHandling}
              options={[
                "They usually call back",
                "We miss it and find out later",
                "We have voicemail but rarely check it",
                "Not sure",
              ]}
            />
            <TapCardGroup
              label="Where do most of your clients come from?"
              required
              value={form.clientAcquisition}
              onChange={(v) => setField("clientAcquisition", v)}
              error={errors.clientAcquisition}
              options={[
                "Referrals / word of mouth","Google Ads","Meta Ads (Facebook/Instagram)",
                "Organic social media","SEO / Google search","Outbound / cold outreach","Other",
              ]}
            />
            {/* Budget optional */}
            <div className="space-y-2">
              <label className="block text-sm text-textPrimary/90">Monthly marketing budget (optional)</label>
              <select
                className="vs-input"
                value={form.monthlyBudget}
                onChange={(e) => setField("monthlyBudget", e.target.value)}
              >
                <option value="">Prefer not to say</option>
                {["Under R2k/month","R2k – R5k/month","R5k – R15k/month","Over R15k/month"].map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* ── STEP 2 PATH B: PRESENCE ── */}
        {step === 1 && form.primaryIntent === "PRESENCE" && (
          <>
            <TapCardGroup
              label="Do you currently have a website?"
              required
              value={form.currentWebsiteStatus}
              onChange={(v) => setField("currentWebsiteStatus", v)}
              error={errors.currentWebsiteStatus}
              options={[
                "Yes — but it's outdated or not working well",
                "Yes — and it works fine",
                "No — I need one built from scratch",
                "I have a social media page but no website",
              ]}
            />
            <TapCardGroup
              label="Are you on Google Maps? (Google Business Profile)"
              required
              value={form.googleMapsStatus}
              onChange={(v) => setField("googleMapsStatus", v)}
              error={errors.googleMapsStatus}
              options={[
                "Yes — fully set up and verified",
                "Yes — but it's incomplete or unverified",
                "No — I'm not on there",
                "Not sure — I've never checked",
              ]}
            />
            {/* Website goal multi-select */}
            <div className="space-y-2">
              <label className="block text-sm text-textPrimary/90">
                When someone finds you online, what do you want them to do?{" "}
                <span className="text-accent">*</span>
              </label>
              <p className="text-xs text-textMuted/60">Select all that apply.</p>
              <div className="grid gap-2">
                {[
                  "Call me directly",
                  "Fill in a contact / enquiry form",
                  "Book an appointment themselves",
                  "Get a quote",
                  "Just find my business info",
                ].map((opt) => (
                  <MultiCard
                    key={opt}
                    value={opt}
                    label={opt}
                    selected={form.websiteGoalArr.includes(opt)}
                    onClick={() => toggleMulti("websiteGoalArr", opt)}
                  />
                ))}
              </div>
              {errors.websiteGoalArr && <p className="text-xs text-red-300">{errors.websiteGoalArr}</p>}
            </div>
            <TapCardGroup
              label="Who do you serve?"
              required
              value={form.serveArea}
              onChange={(v) => setField("serveArea", v)}
              error={errors.serveArea}
              options={["Clients in my local area / city","Clients across South Africa","Both local and national"]}
            />
            <TapCardGroup
              label="Currently, how do most clients find you?"
              required
              value={form.clientAcquisition}
              onChange={(v) => setField("clientAcquisition", v)}
              error={errors.clientAcquisition}
              options={[
                "Referrals / word of mouth","Google search","Social media",
                "Google Ads / Meta Ads","I'm not sure — I don't track it",
              ]}
            />
          </>
        )}

        {/* ── STEP 2 PATH C: AUTOMATION ── */}
        {step === 1 && form.primaryIntent === "AUTOMATION" && (
          <>
            {/* Biggest time waste multi-select max 2 */}
            <div className="space-y-2">
              <label className="block text-sm text-textPrimary/90">
                What takes up the most repetitive time in your business right now?{" "}
                <span className="text-accent">*</span>
              </label>
              <p className="text-xs text-textMuted/60">Pick up to 2.</p>
              <div className="grid gap-2">
                {[
                  "Replying to the same WhatsApp / enquiry messages",
                  "Following up with leads who went quiet",
                  "Booking or confirming appointments",
                  "Sending quotes manually",
                  "Admin, reporting, or data capturing",
                  "Onboarding new clients",
                ].map((opt) => (
                  <MultiCard
                    key={opt}
                    value={opt}
                    label={opt}
                    selected={form.biggestTimeWasteArr.includes(opt)}
                    disabled={!form.biggestTimeWasteArr.includes(opt) && form.biggestTimeWasteArr.length >= 2}
                    onClick={() => toggleMulti("biggestTimeWasteArr", opt, 2)}
                  />
                ))}
              </div>
              {errors.biggestTimeWasteArr && <p className="text-xs text-red-300">{errors.biggestTimeWasteArr}</p>}
            </div>
            {/* Tools used multi-select */}
            <div className="space-y-2">
              <label className="block text-sm text-textPrimary/90">
                What tools or systems do you already use? <span className="text-accent">*</span>
              </label>
              <p className="text-xs text-textMuted/60">Select all that apply.</p>
              <div className="grid gap-2">
                {[
                  "WhatsApp Business",
                  "A CRM (e.g. HubSpot, Zoho, Pipedrive)",
                  "Google Workspace (Gmail, Sheets, etc.)",
                  "Spreadsheets / Excel",
                  "Booking system (e.g. Calendly, SimplyBook)",
                  "Accounting software (e.g. Xero, Sage)",
                  "None — everything is manual",
                ].map((opt) => (
                  <MultiCard
                    key={opt}
                    value={opt}
                    label={opt}
                    selected={form.toolsUsedArr.includes(opt)}
                    onClick={() => toggleMulti("toolsUsedArr", opt)}
                  />
                ))}
              </div>
              {errors.toolsUsedArr && <p className="text-xs text-red-300">{errors.toolsUsedArr}</p>}
            </div>
            <TapCardGroup
              label="Do you have an existing website?"
              required
              value={form.currentWebsiteStatus}
              onChange={(v) => setField("currentWebsiteStatus", v)}
              error={errors.currentWebsiteStatus}
              options={["Yes","No","In progress"]}
            />
            <TapCardGroup
              label="How many people handle client enquiries at your business?"
              required
              value={form.teamSize}
              onChange={(v) => setField("teamSize", v)}
              error={errors.teamSize}
              options={["Just me","2 – 5 people","6 – 15 people","More than 15"]}
            />
            <TapCardGroup
              label="Where do most clients come from?"
              required
              value={form.clientAcquisition}
              onChange={(v) => setField("clientAcquisition", v)}
              error={errors.clientAcquisition}
              options={[
                "Referrals / word of mouth","Google Ads","Meta Ads (Facebook/Instagram)",
                "Organic social media","SEO / Google search","Outbound / cold outreach","Other",
              ]}
            />
          </>
        )}

        {/* ── STEP 2 PATH D: EXPLORE ── */}
        {step === 1 && form.primaryIntent === "EXPLORE" && (
          <>
            <TapCardGroup
              label="If you had to pick one — what's the biggest thing holding your business back right now?"
              required
              value={form.biggestFrustration}
              onChange={(v) => setField("biggestFrustration", v)}
              error={errors.biggestFrustration}
              options={[
                "Not enough leads / visibility",
                "Leads come in but don't convert",
                "Too much admin and manual work",
                "The business is growing but systems can't keep up",
                "I'm not sure yet",
              ]}
            />
            <TapCardGroup
              label="Of our three systems, which sounds closest to what you need? (optional)"
              required={false}
              value={form.packagePreference}
              onChange={(v) => setField("packagePreference", v)}
              options={[
                "The Foundation (website + lead capture)",
                "The Growth System (leads + follow-up automation)",
                "The Revenue System (full AI-assisted system)",
                "Not sure — recommend one for me",
              ]}
            />
          </>
        )}

        {/* ── STEP 3: CONTACT ── */}
        {step === 2 && (
          <>
            <FormField
              kind="input"
              label="Email address"
              required
              value={form.email}
              onChange={(v) => setField("email", v)}
              error={errors.email}
              touched={!!errors.email}
              type="email"
              autoComplete="email"
            />
            <FormField
              kind="input"
              label="WhatsApp number"
              required
              value={form.whatsapp}
              onChange={(v) => setField("whatsapp", v)}
              hint="We'll send your report here too — and use this to follow up. Include your country code (e.g. +27...)."
              error={errors.whatsapp}
              touched={!!errors.whatsapp}
              type="tel"
              autoComplete="tel"
            />
            <FormField
              kind="input"
              label="Your website (optional)"
              required={false}
              value={form.websiteUrl}
              onChange={(v) => setField("websiteUrl", v)}
              hint="If you have one, we'll take a look before we reach out."
              error={errors.websiteUrl}
              touched={!!errors.websiteUrl}
              type="url"
              placeholder="https://example.com"
              autoComplete="url"
            />
            <TapCardGroup
              label="When's the best time to reach you on WhatsApp? (optional)"
              required={false}
              value={form.preferredContactTime}
              onChange={(v) => setField("preferredContactTime", v)}
              hint="We'll message you then — not randomly."
              options={[
                "Morning (8am – 12pm)","Afternoon (12pm – 5pm)","Evening (after 5pm)","Anytime is fine",
              ]}
            />
          </>
        )}
      </form>

      {submitError && <p className="mt-6 text-sm text-red-300">{submitError}</p>}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          className="vs-button-ghost text-sm disabled:opacity-40"
          disabled={step === 0 || submitting}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          Back
        </button>

        {step < 2 ? (
          <button
            type="button"
            className="vs-button-primary text-sm disabled:opacity-40"
            disabled={submitting}
            onClick={goNext}
          >
            Next →
          </button>
        ) : (
          <button
            type="button"
            className="vs-button-primary text-sm disabled:opacity-40"
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting ? "Sending…" : "Send my Blueprint →"}
          </button>
        )}
      </div>

      {step === 2 && (
        <p className="mt-4 text-xs text-textMuted/60 text-center">
          We review every submission personally. You'll hear from us within 1 business day.
        </p>
      )}
    </div>
  );
}

// ─── Reusable tap-card group for single-select fields ─────────────────────────

function TapCardGroup({
  label,
  required,
  value,
  onChange,
  options,
  error,
  hint,
}: {
  label: string;
  required: boolean;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  error?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm text-textPrimary/90">
        {label}
        {required && <span className="text-accent"> *</span>}
      </label>
      {hint && <p className="text-xs text-textMuted/60">{hint}</p>}
      <div className="grid gap-2">
        {options.map((opt) => (
          <TapCard
            key={opt}
            value={opt}
            label={opt}
            selected={value === opt}
            onClick={() => onChange(opt)}
          />
        ))}
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DETAILED FORM — CRM manual entry, unchanged structure
// ═══════════════════════════════════════════════════════════════════════════════

const detailedSteps: Array<{ title: string; fields: DetailedFieldKey[] }> = [
  { title: "Contact", fields: ["clientName", "email", "whatsapp", "websiteUrl"] },
  { title: "Social media", fields: ["socialInstagram", "socialTiktok", "socialFacebook", "socialX", "socialYoutube"] },
  { title: "Business", fields: ["industry", "revenueRange", "monthlyBudget"] },
  {
    title: "Growth context",
    fields: ["challenges", "competitors", "currentMarketing", "toolsUsed", "successGoals", "packageIntent"],
  },
];

const DETAILED_OPTIONAL: ReadonlySet<DetailedFieldKey> = new Set<DetailedFieldKey>([
  "websiteUrl","monthlyBudget","packageIntent","competitors","toolsUsed","successGoals","primaryIntent",
  "socialInstagram","socialTiktok","socialFacebook","socialX","socialYoutube",
]);

const detailedSelectPresets: Partial<Record<DetailedFieldKey, string[]>> = {
  industry: [
    "E-commerce","Professional services","Healthcare","Real estate","Construction",
    "Education","Hospitality","Technology","Financial services","Retail","Food & Beverage","Marketing","Other",
  ],
  revenueRange: [
    "Prefer not to say","Under R50k/month","R50k - R150k/month","R150k - R500k/month",
    "R500k - R1m/month","Over R1m/month","Other",
  ],
  currentMarketing: [
    "Referrals / word of mouth","Google Ads","Meta Ads","Organic social media",
    "SEO / content","Outbound sales","Other",
  ],
  monthlyBudget: [
    "Under R5k/month","R5k - R15k/month","R15k - R40k/month","R40k - R100k/month","Over R100k/month","Other",
  ],
};

const packageOptions = [
  { value: "Foundation", label: "The Foundation" },
  { value: "Growth", label: "The Growth System" },
  { value: "Revenue", label: "The Revenue System" },
];

const textareaTemplates: Partial<Record<DetailedFieldKey, string[]>> = {
  challenges: [
    "Lead quality is inconsistent","Low conversion rates","Slow follow-up with prospects",
    "Difficulty scaling marketing profitably","Other",
  ],
  toolsUsed: ["Google Ads","Meta Ads","HubSpot","GoHighLevel","WordPress","Shopify","Other"],
};

function detailedFieldLabel(k: DetailedFieldKey): string {
  switch (k) {
    case "clientName": return "Client name / business name";
    case "email": return "Email address";
    case "whatsapp": return "WhatsApp number";
    case "websiteUrl": return "Website URL (optional)";
    case "industry": return "Industry / niche";
    case "revenueRange": return "Current monthly revenue range";
    case "challenges": return "Biggest business challenges";
    case "competitors": return "Top 2–3 competitors (optional)";
    case "currentMarketing": return "How do you currently get clients?";
    case "toolsUsed": return "Tools you're currently using (optional)";
    case "monthlyBudget": return "Monthly marketing budget (optional)";
    case "packageIntent": return "Which system looks best? (optional)";
    case "successGoals": return "What does success look like in 6 months? (optional)";
    case "primaryIntent": return "Main intent";
    case "socialInstagram": return "Instagram profile URL (optional)";
    case "socialTiktok": return "TikTok profile URL (optional)";
    case "socialFacebook": return "Facebook page URL (optional)";
    case "socialX": return "X (Twitter) profile URL (optional)";
    case "socialYoutube": return "YouTube channel URL (optional)";
  }
}

function detailedFieldHint(k: DetailedFieldKey): string | null {
  switch (k) {
    case "whatsapp": return "Include country code if possible (e.g. +27…).";
    case "websiteUrl": return "If provided, we'll validate it (https:// will be assumed).";
    case "challenges": return "Add one or more. One per line works well.";
    case "competitors": return "Add 2–3 competitors. One per line works well.";
    case "toolsUsed": return "Example: Google Ads, Meta Ads, HubSpot, WordPress, Shopify, etc.";
    case "monthlyBudget": return "Example: 5000 or 5k.";
    default: return null;
  }
}

function isDetailedTextarea(k: DetailedFieldKey) {
  return ["challenges", "competitors", "toolsUsed", "successGoals"].includes(k);
}

function validateDetailedField(key: DetailedFieldKey, value: string): string | null {
  const optional = DETAILED_OPTIONAL.has(key);
  const empty = !value.trim();
  if (key === "websiteUrl") {
    if (empty) return null;
    return normalizeWebsiteUrl(value) ? null : "Please enter a valid website URL (or leave blank).";
  }
  if (key === "monthlyBudget") {
    if (empty) return null;
    return parseMonthlyBudgetToInt(value) ? null : "Monthly budget must look like a number (e.g. 5000 or 5k).";
  }
  if (empty) return optional ? null : "This field is required.";
  if (key === "email") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase()) ? null : "Please enter a valid email address.";
  }
  if (key === "whatsapp") {
    const digits = value.replace(/[^\d]/g, "");
    return digits.length >= 8 && digits.length <= 15 ? null : "Please enter a valid WhatsApp number.";
  }
  return null;
}

function DetailedForm() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<DetailedFormState>(detailedInitial);
  const [touched, setTouched] = useState<Partial<Record<DetailedFieldKey, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<DetailedFieldKey, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ clientId: string } | null>(null);
  const [otherEnabled, setOtherEnabled] = useState<Partial<Record<DetailedFieldKey, boolean>>>({});

  const progress = useMemo(() => Math.round(((step + 1) / detailedSteps.length) * 100), [step]);
  const stepFields = detailedSteps[step]!.fields;

  function setField(key: DetailedFieldKey, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (touched[key]) {
      const err = validateDetailedField(key, value);
      setErrors((prev) => ({ ...prev, [key]: err || undefined }));
    }
  }

  function appendLineValue(key: DetailedFieldKey, line: string) {
    const normalized = line.trim();
    if (!normalized) return;
    const currentLines = form[key].split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (currentLines.some((l) => l.toLowerCase() === normalized.toLowerCase())) return;
    const next = [...currentLines, normalized].join("\n");
    setField(key, next);
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  function touchField(key: DetailedFieldKey) {
    setTouched((prev) => ({ ...prev, [key]: true }));
    const err = validateDetailedField(key, form[key]);
    setErrors((prev) => ({ ...prev, [key]: err || undefined }));
  }

  function validateFields(fields: DetailedFieldKey[]): boolean {
    const nextErrors: Partial<Record<DetailedFieldKey, string>> = {};
    for (const f of fields) {
      setTouched((prev) => ({ ...prev, [f]: true }));
      const err = validateDetailedField(f, form[f]);
      if (err) nextErrors[f] = err;
    }
    setErrors((prev) => ({ ...prev, ...nextErrors }));
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const payload = {
        clientName: form.clientName.trim(),
        email: form.email.trim().toLowerCase(),
        whatsapp: form.whatsapp.trim(),
        websiteUrl: form.websiteUrl.trim(),
        industry: form.industry.trim(),
        revenueRange: form.revenueRange.trim(),
        challenges: form.challenges,
        competitors: form.competitors,
        currentMarketing: form.currentMarketing.trim(),
        toolsUsed: form.toolsUsed,
        monthlyBudget: form.monthlyBudget.trim(),
        packageIntent: form.packageIntent.trim(),
        successGoals: form.successGoals.trim(),
        primaryIntent: form.primaryIntent.trim(),
        socialInstagram: form.socialInstagram.trim(),
        socialTiktok: form.socialTiktok.trim(),
        socialFacebook: form.socialFacebook.trim(),
        socialX: form.socialX.trim(),
        socialYoutube: form.socialYoutube.trim(),
      };

      const parsed = BlueprintSubmitSchema.safeParse(payload);
      if (!parsed.success) {
        const mapped: Partial<Record<DetailedFieldKey, string>> = {};
        for (const i of parsed.error.issues) {
          const k = i.path?.[0];
          if (typeof k === "string" && k in form) mapped[k as DetailedFieldKey] = i.message;
        }
        setErrors((prev) => ({ ...prev, ...mapped }));
        setSubmitError("Please fix the highlighted fields.");
        return;
      }

      const res = await fetch("/api/blueprint/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setSubmitError(String(json?.error || "Submission failed. Please try again."));
        return;
      }
      setSuccess({ clientId: String(json.clientId) });
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="vs-card">
        <div className="space-y-3">
          <p className="vs-section-heading">Blueprint submitted</p>
          <h2 className="font-heading text-2xl md:text-3xl">You're in.</h2>
          <p className="text-sm text-textMuted max-w-2xl">
            We'll review your answers and send a tailored breakdown within 1 business day.
          </p>
          <p className="text-xs text-textMuted/80">Reference: {success.clientId}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="vs-card">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <p className="vs-section-heading">Quick 3-minute questionnaire</p>
          <h2 className="font-heading text-xl md:text-2xl">Tell us about your business.</h2>
        </div>
        <div className="text-xs text-textMuted">
          <div className="vs-badge">
            Step {step + 1} of {detailedSteps.length}: {detailedSteps[step]!.title}
          </div>
        </div>
      </div>

      <div className="mb-8">
        <ProgressBar value={progress} label={`Step ${step + 1} of ${detailedSteps.length}`} />
      </div>

      <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
        {stepFields.map((key) => {
          const label = detailedFieldLabel(key);
          const hint = detailedFieldHint(key);
          const err = errors[key] ?? null;
          const required = !DETAILED_OPTIONAL.has(key);

          if (key === "packageIntent") {
            return (
              <div key={key} className="space-y-2">
                <label className="block text-sm text-textPrimary/90">{label}</label>
                <select className="vs-input" value={form.packageIntent} onChange={(e) => setField("packageIntent", e.target.value)}>
                  <option value="">Not sure / Recommend one</option>
                  {packageOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            );
          }

          if (isDetailedTextarea(key)) {
            const chips: string[] =
              key === "competitors"
                ? getCompetitorSuggestions(form.industry)
                : (textareaTemplates[key] ?? []);
            return (
              <div key={key} className="space-y-3">
                {chips.length > 0 && (
                  <div>
                    {key === "competitors" && (
                      <p className="text-xs text-textMuted/60 mb-2">
                        {form.industry
                          ? `Known competitors in ${form.industry} — click to add:`
                          : "Select your industry first to see competitor suggestions"}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {chips.map((preset) => {
                        const alreadyAdded = form[key].split(/\r?\n/).map((s) => s.trim().toLowerCase()).includes(preset.toLowerCase());
                        return (
                          <button
                            type="button"
                            key={`${key}-${preset}`}
                            disabled={alreadyAdded || preset === "Other"}
                            className={`rounded-full border px-3 py-1 text-xs transition ${
                              alreadyAdded
                                ? "border-accent/30 bg-accent/10 text-accent cursor-default"
                                : "border-white/10 bg-white/5 text-textMuted hover:bg-white/10 hover:text-textPrimary"
                            }`}
                            onClick={() => { if (preset === "Other" || alreadyAdded) return; appendLineValue(key, preset); }}
                          >
                            {alreadyAdded ? `✓ ${preset}` : `+ ${preset}`}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <FormField
                  kind="textarea"
                  label={label}
                  required={required}
                  value={form[key]}
                  onChange={(v) => setField(key, v)}
                  onBlur={() => touchField(key)}
                  hint={hint}
                  error={err}
                  touched={touched[key]}
                  placeholder={
                    key === "challenges" ? "1) …\n2) …\n3) …"
                    : key === "competitors" ? "Competitor 1\nCompetitor 2\nCompetitor 3"
                    : key === "toolsUsed" ? "Tool 1\nTool 2\nTool 3"
                    : ""
                  }
                />
              </div>
            );
          }

          if (detailedSelectPresets[key]?.length) {
            const options = detailedSelectPresets[key]!;
            const isOther = Boolean(otherEnabled[key]);
            const currentValue = form[key];
            const matchesPreset = options.includes(currentValue) && currentValue !== "Other";
            return (
              <div key={key} className="space-y-2">
                <label className="block text-sm text-textPrimary/90">
                  {label}{required ? <span className="text-accent"> *</span> : null}
                </label>
                <select
                  className="vs-input"
                  value={isOther ? "Other" : matchesPreset ? currentValue : ""}
                  onChange={(e) => {
                    const choice = e.target.value;
                    if (!choice) { setField(key, ""); setOtherEnabled((prev) => ({ ...prev, [key]: false })); return; }
                    if (choice === "Other") { setField(key, ""); setOtherEnabled((prev) => ({ ...prev, [key]: true })); setTouched((prev) => ({ ...prev, [key]: true })); return; }
                    setField(key, choice);
                    setOtherEnabled((prev) => ({ ...prev, [key]: false }));
                  }}
                  onBlur={() => touchField(key)}
                >
                  <option value="">Select an option</option>
                  {options.map((option) => <option key={`${key}-${option}`} value={option}>{option}</option>)}
                </select>
                {isOther ? (
                  <FormField kind="input" label={`Other: ${label}`} required={required} value={form[key]} onChange={(v) => setField(key, v)} onBlur={() => touchField(key)} hint="Add your own custom answer." error={err} touched={touched[key]} type="text" autoComplete="off" />
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-[11px] text-textMuted/80">{hint}</p>
                    <p className="text-[11px] text-red-300">{touched[key] && err ? err : ""}</p>
                  </div>
                )}
              </div>
            );
          }

          return (
            <FormField
              key={key}
              kind="input"
              label={label}
              required={required}
              value={form[key]}
              onChange={(v) => setField(key, v)}
              onBlur={() => touchField(key)}
              hint={hint}
              error={err}
              touched={touched[key]}
              placeholder={key === "websiteUrl" ? "https://example.com" : ""}
              type={key === "email" ? "email" : key === "whatsapp" ? "tel" : key === "websiteUrl" ? "url" : "text"}
              inputMode={key === "whatsapp" || key === "monthlyBudget" ? "numeric" : "text"}
              autoComplete={
                key === "email" ? "email"
                : key === "clientName" ? "organization"
                : key === "whatsapp" ? "tel"
                : key === "websiteUrl" ? "url"
                : "off"
              }
            />
          );
        })}
      </form>

      {submitError && <p className="mt-6 text-sm text-red-300">{submitError}</p>}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          className="vs-button-ghost text-sm disabled:opacity-40"
          disabled={step === 0 || submitting}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          Back
        </button>
        {step < detailedSteps.length - 1 ? (
          <button
            type="button"
            className="vs-button-primary text-sm disabled:opacity-40"
            disabled={submitting}
            onClick={() => { if (!validateFields(stepFields)) return; setStep((s) => Math.min(detailedSteps.length - 1, s + 1)); }}
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            className="vs-button-primary text-sm disabled:opacity-40"
            disabled={submitting}
            onClick={async () => {
              const allFields = detailedSteps.flatMap((s) => s.fields);
              if (!validateFields(allFields)) { setSubmitError("Please fix the highlighted fields."); return; }
              await handleSubmit();
            }}
          >
            {submitting ? "Submitting…" : "Submit blueprint"}
          </button>
        )}
      </div>
    </div>
  );
}
