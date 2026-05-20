"use client";

import { useMemo, useState } from "react";
import { BlueprintSubmitSchema, normalizeWebsiteUrl, parseMonthlyBudgetToInt, SERVICE_INTEREST_LABELS } from "../../lib/blueprint/schema";
import type { ServiceInterest } from "../../lib/blueprint/schema";
import { FormField } from "../ui/FormField";
import { ProgressBar } from "../ui/ProgressBar";
import { getCompetitorSuggestions } from "../../lib/crm/industry-data";

type FormState = {
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
  successGoals: string;
};

type FieldKey = keyof FormState;

const initial: FormState = {
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
  successGoals: "",
};

const steps: Array<{ title: string; fields: FieldKey[] }> = [
  { title: "Contact", fields: ["clientName", "email", "whatsapp", "websiteUrl"] },
  { title: "Business", fields: ["industry", "revenueRange", "monthlyBudget"] },
  { title: "Context", fields: ["challenges", "competitors", "currentMarketing", "toolsUsed", "successGoals"] },
];

const selectPresets: Partial<Record<FieldKey, string[]>> = {
  industry: ["E-commerce", "Professional services", "Healthcare", "Real estate", "Construction", "Education", "Hospitality", "Technology", "Financial services", "Retail", "Food & Beverage", "Marketing", "Other"],
  revenueRange: ["Under R50k/month", "R50k - R150k/month", "R150k - R500k/month", "R500k - R1m/month", "Over R1m/month", "Other"],
  currentMarketing: ["Referrals / word of mouth", "Google Ads", "Meta Ads", "Organic social media", "SEO / content", "Outbound sales", "Other"],
  monthlyBudget: ["Under R5k/month", "R5k - R15k/month", "R15k - R40k/month", "R40k - R100k/month", "Over R100k/month", "Other"],
};

const textareaTemplates: Partial<Record<FieldKey, string[]>> = {
  challenges: ["Lead quality is inconsistent", "Low conversion rates", "Slow follow-up with prospects", "Difficulty scaling marketing profitably", "Other"],
  toolsUsed: ["Google Ads", "Meta Ads", "HubSpot", "GoHighLevel", "WordPress", "Shopify", "Other"],
};

function fieldLabel(k: FieldKey): string {
  const labels: Record<FieldKey, string> = {
    clientName: "Client name / business name",
    email: "Email address",
    whatsapp: "WhatsApp number",
    websiteUrl: "Website URL (optional)",
    industry: "Industry / niche",
    revenueRange: "Current monthly revenue range",
    challenges: "Three biggest business challenges",
    competitors: "Top 2–3 competitors",
    currentMarketing: "How do you currently get clients?",
    toolsUsed: "Tools you're currently using",
    monthlyBudget: "Monthly marketing budget",
    successGoals: "What does success look like in 6 months?",
  };
  return labels[k];
}

function fieldHint(k: FieldKey): string | null {
  if (k === "whatsapp") return "Include country code if possible (e.g. +27…).";
  if (k === "websiteUrl") return "If provided, we'll validate it (https:// will be assumed).";
  if (k === "challenges") return "Add 3 items. One per line works well.";
  if (k === "competitors") return "Add 2–3 competitors. One per line works well.";
  if (k === "toolsUsed") return "Example: Google Ads, Meta Ads, HubSpot, WordPress, Shopify, etc.";
  if (k === "monthlyBudget") return "Example: 5000 or 5k.";
  return null;
}

function isTextarea(k: FieldKey) {
  return ["challenges", "competitors", "currentMarketing", "toolsUsed", "successGoals"].includes(k);
}

function validateField(key: FieldKey, next: string): string | null {
  if (key === "websiteUrl") {
    if (!next.trim()) return null;
    return normalizeWebsiteUrl(next) ? null : "Please enter a valid website URL (or leave blank).";
  }
  if (!next.trim()) return "This field is required.";
  if (key === "email") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.trim().toLowerCase()) ? null : "Please enter a valid email address.";
  }
  if (key === "whatsapp") {
    const digits = next.replace(/[^\d]/g, "");
    return digits.length >= 8 && digits.length <= 15 ? null : "Please enter a valid WhatsApp number.";
  }
  if (key === "monthlyBudget") {
    return parseMonthlyBudgetToInt(next) ? null : "Monthly budget must look like a number (e.g. 5000 or 5k).";
  }
  return null;
}

type Props = {
  serviceInterest: ServiceInterest;
  /** Heading shown above the form, defaults to the service label */
  heading?: string;
  /** Sub-copy shown below the heading */
  subCopy?: string;
};

export function ServiceIntakeForm({ serviceInterest, heading, subCopy }: Props) {
  const serviceLabel = SERVICE_INTEREST_LABELS[serviceInterest];
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(initial);
  const [touched, setTouched] = useState<Record<FieldKey, boolean>>(
    Object.fromEntries(Object.keys(initial).map((k) => [k, false])) as Record<FieldKey, boolean>,
  );
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [otherEnabled, setOtherEnabled] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ clientId: string } | null>(null);

  const progress = useMemo(() => Math.round(((step + 1) / steps.length) * 100), [step]);
  const stepFields = steps[step]!.fields;

  function setField(key: FieldKey, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (touched[key]) {
      const err = validateField(key, value);
      setErrors((prev) => ({ ...prev, [key]: err || undefined }));
    }
  }

  function appendLineValue(key: FieldKey, line: string) {
    const normalized = line.trim();
    if (!normalized) return;
    const currentLines = form[key].split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (currentLines.some((l) => l.toLowerCase() === normalized.toLowerCase())) return;
    const next = [...currentLines, normalized].join("\n");
    setField(key, next);
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  function touchField(key: FieldKey) {
    setTouched((prev) => ({ ...prev, [key]: true }));
    const err = validateField(key, form[key]);
    setErrors((prev) => ({ ...prev, [key]: err || undefined }));
  }

  function validateStep(): boolean {
    const nextErrors: Partial<Record<FieldKey, string>> = {};
    for (const f of stepFields) {
      setTouched((prev) => ({ ...prev, [f]: true }));
      const err = validateField(f, form[f]);
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
        successGoals: form.successGoals.trim(),
        serviceInterest,
      };

      const parsed = BlueprintSubmitSchema.safeParse(payload);
      if (!parsed.success) {
        const mapped: Partial<Record<FieldKey, string>> = {};
        for (const i of parsed.error.issues) {
          const k = i.path?.[0];
          if (typeof k === "string" && k in form) mapped[k as FieldKey] = i.message;
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
        const issue0 = Array.isArray(json?.issues) && json.issues.length ? json.issues[0] : null;
        if (issue0?.path?.[0] && issue0?.message) {
          const k = String(issue0.path[0]) as FieldKey;
          setErrors((prev) => ({ ...prev, [k]: String(issue0.message) }));
        }
        setSubmitError(String(json?.error || "Submission failed. Please try again."));
        return;
      }

      setSuccess({ clientId: String(json.clientId) });
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="vs-card">
        <div className="space-y-3">
          <p className="vs-section-heading">{serviceLabel} — request received</p>
          <h1 className="font-heading text-2xl md:text-3xl">You're in.</h1>
          <p className="text-sm text-textMuted max-w-2xl">
            Thanks — we'll review your details and reach out within 24 hours to discuss next steps for your {serviceLabel.toLowerCase()} setup.
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
          <p className="vs-section-heading">{serviceLabel}</p>
          <h1 className="font-heading text-xl md:text-2xl">{heading ?? `Get started with ${serviceLabel}`}</h1>
          {subCopy ? (
            <p className="text-sm text-textMuted max-w-2xl">{subCopy}</p>
          ) : null}
        </div>
        <div className="text-xs text-textMuted">
          <div className="vs-badge">Step {step + 1} of {steps.length}: {steps[step]!.title}</div>
        </div>
      </div>

      <div className="mb-8">
        <ProgressBar value={progress} label={`Step ${step + 1} of ${steps.length}`} />
      </div>

      <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
        {stepFields.map((key) => {
          const label = fieldLabel(key);
          const hint = fieldHint(key);
          const err = errors[key] ?? null;
          const required = key !== "websiteUrl";

          if (isTextarea(key)) {
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
                        {form.industry ? `Known competitors in ${form.industry} — click to add:` : "Select your industry first to see competitor suggestions"}
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
                            className={`rounded-full border px-3 py-1 text-xs transition ${alreadyAdded ? "border-accent/30 bg-accent/10 text-accent cursor-default" : "border-white/10 bg-white/5 text-textMuted hover:bg-white/10 hover:text-textPrimary"}`}
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
                  placeholder={key === "challenges" ? "1) …\n2) …\n3) …" : key === "competitors" ? "Competitor 1\nCompetitor 2" : key === "toolsUsed" ? "Tool 1\nTool 2" : ""}
                />
              </div>
            );
          }

          if (selectPresets[key]?.length) {
            const options = selectPresets[key]!;
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
                    if (!choice) { setField(key, ""); setOtherEnabled((p) => ({ ...p, [key]: false })); return; }
                    if (choice === "Other") { setField(key, ""); setOtherEnabled((p) => ({ ...p, [key]: true })); setTouched((p) => ({ ...p, [key]: true })); return; }
                    setField(key, choice);
                    setOtherEnabled((p) => ({ ...p, [key]: false }));
                  }}
                  onBlur={() => touchField(key)}
                >
                  <option value="">Select an option</option>
                  {options.map((opt) => <option key={`${key}-${opt}`} value={opt}>{opt}</option>)}
                </select>
                {isOther ? (
                  <FormField kind="input" label={`Other: ${label}`} required={required} value={form[key]} onChange={(v) => setField(key, v)} onBlur={() => touchField(key)} hint="Add your own answer." error={err} touched={touched[key]} type="text" autoComplete="off" />
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
              autoComplete={key === "email" ? "email" : key === "clientName" ? "organization" : key === "whatsapp" ? "tel" : key === "websiteUrl" ? "url" : "off"}
            />
          );
        })}
      </form>

      {submitError && <p className="mt-6 text-sm text-red-300">{submitError}</p>}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" className="vs-button-ghost text-sm disabled:opacity-40" disabled={step === 0 || submitting} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          Back
        </button>

        {step < steps.length - 1 ? (
          <button type="button" className="vs-button-primary text-sm disabled:opacity-40" disabled={submitting} onClick={() => { if (!validateStep()) return; setStep((s) => Math.min(steps.length - 1, s + 1)); }}>
            Next
          </button>
        ) : (
          <button
            type="button"
            className="vs-button-primary text-sm disabled:opacity-40"
            disabled={submitting}
            onClick={async () => {
              const allFields = steps.flatMap((s) => s.fields);
              const nextErrors: Partial<Record<FieldKey, string>> = {};
              for (const f of allFields) {
                setTouched((prev) => ({ ...prev, [f]: true }));
                const err = validateField(f, form[f]);
                if (err) nextErrors[f] = err;
              }
              setErrors((prev) => ({ ...prev, ...nextErrors }));
              if (Object.keys(nextErrors).length) { setSubmitError("Please fix the highlighted fields."); return; }
              await handleSubmit();
            }}
          >
            {submitting ? "Submitting…" : "Submit request"}
          </button>
        )}
      </div>
    </div>
  );
}
