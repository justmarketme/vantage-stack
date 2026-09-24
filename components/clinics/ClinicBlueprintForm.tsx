"use client";

import { useMemo, useState } from "react";
import {
  AFTER_HOURS_HANDLING,
  CLINIC_TYPES,
  ENQUIRY_VOLUME_BANDS,
  RECALL_HANDLING,
  RESPONSE_SPEED_BANDS,
  TIMELINE_BANDS,
  type RoiResult,
} from "../../lib/clinics/schema";

/**
 * The Clinic Revenue Blueprint — the page's only real conversion point.
 *
 * Structured as an NEPQ progression rather than a lead form: situation, then
 * problem awareness, then consequence, then contact. Contact details are asked
 * LAST, once the visitor has already worked something out about their own
 * practice. Asking for an email first would make everything after it feel like
 * the price of a download.
 *
 * Question wording is deliberately low-pressure — "what happens to" rather than
 * "are you losing" — because the prospect reaching the conclusion themselves is
 * the entire mechanism. Nothing here asks about patient health.
 */

type StepKey = 0 | 1 | 2 | 3;

const STEP_TITLES = [
  "Your practice",
  "How enquiries move today",
  "What it is worth",
  "Where to send it",
] as const;

type FormState = {
  practiceName: string;
  clinicType: string;
  clinicTypeOther: string;
  locations: string;
  practitioners: string;
  enquiryVolume: string;
  responseSpeed: string;
  afterHours: string;
  recallHandling: string;
  avgAppointmentValue: string;
  noShowRate: string;
  timeline: string;
  contactName: string;
  role: string;
  email: string;
  whatsapp: string;
  websiteUrl: string;
  consent: boolean;
};

const EMPTY: FormState = {
  practiceName: "",
  clinicType: "",
  clinicTypeOther: "",
  locations: "1",
  practitioners: "1",
  enquiryVolume: "",
  responseSpeed: "",
  afterHours: "",
  recallHandling: "",
  avgAppointmentValue: "",
  noShowRate: "",
  timeline: "",
  contactName: "",
  role: "",
  email: "",
  whatsapp: "",
  websiteUrl: "",
  consent: false,
};

function Select({
  label,
  hint,
  value,
  onChange,
  options,
  error,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  error?: string;
}) {
  const id = label.replace(/\W+/g, "-").toLowerCase();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {hint && <p className="mt-0.5 text-xs text-textMuted">{hint}</p>}
      <select
        id={id}
        className="vs-input mt-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
      >
        <option value="">Choose one…</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

function Text({
  label,
  hint,
  value,
  onChange,
  error,
  type = "text",
  placeholder,
  prefix,
  suffix,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  type?: string;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
}) {
  const id = label.replace(/\W+/g, "-").toLowerCase();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {hint && <p className="mt-0.5 text-xs text-textMuted">{hint}</p>}
      <div className="relative mt-2">
        {prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-textMuted">
            {prefix}
          </span>
        )}
        <input
          id={id}
          type={type}
          inputMode={type === "number" ? "numeric" : undefined}
          className={`vs-input ${prefix ? "pl-7" : ""} ${suffix ? "pr-9" : ""}`}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-textMuted">
            {suffix}
          </span>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

export function ClinicBlueprintForm({ roi }: { roi?: RoiResult | null }) {
  const [step, setStep] = useState<StepKey>(0);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // Honeypot. Never shown, never labelled for humans, never auto-filled by a
  // password manager (autoComplete="off" + tabIndex -1). A non-empty value on
  // submit means a bot walked the DOM filling every input it found.
  const [honeypot, setHoneypot] = useState("");

  const set = <K extends keyof FormState>(key: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: v }));
    setErrors((e) => {
      if (!e[key as string]) return e;
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  };

  /** Client-side gate per step. The server re-validates everything regardless. */
  const validateStep = (s: StepKey): Record<string, string> => {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!form.practiceName.trim()) e.practiceName = "Practice name is required.";
      if (!form.clinicType) e.clinicType = "Please choose the closest match.";
      if (form.clinicType === "Other private practice" && !form.clinicTypeOther.trim())
        e.clinicTypeOther = "Tell us in a few words.";
      if (!Number(form.locations) || Number(form.locations) < 1)
        e.locations = "At least one location.";
      if (!Number(form.practitioners) || Number(form.practitioners) < 1)
        e.practitioners = "At least one practitioner.";
    }
    if (s === 1) {
      if (!form.enquiryVolume) e.enquiryVolume = "Roughly is fine.";
      if (!form.responseSpeed) e.responseSpeed = "Pick the honest one.";
      if (!form.afterHours) e.afterHours = "Please choose one.";
      if (!form.recallHandling) e.recallHandling = "Please choose one.";
    }
    if (s === 2) {
      const v = Number(form.avgAppointmentValue);
      if (!Number.isFinite(v) || v <= 0) e.avgAppointmentValue = "A rough average is fine.";
      const n = Number(form.noShowRate);
      if (!Number.isFinite(n) || n < 0 || n > 100) e.noShowRate = "A percentage between 0 and 100.";
      if (!form.timeline) e.timeline = "Please choose one.";
    }
    if (s === 3) {
      if (!form.contactName.trim()) e.contactName = "Your name, please.";
      if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = "A valid email address.";
      const digits = form.whatsapp.replace(/\D/g, "");
      if (digits.length < 8 || digits.length > 15)
        e.whatsapp = "Include the country code, e.g. +27 82 123 4567.";
      if (!form.consent) e.consent = "We need your permission before we contact you.";
    }
    return e;
  };

  const next = () => {
    const e = validateStep(step);
    setErrors(e);
    if (Object.keys(e).length) return;
    setStep((s) => Math.min(3, s + 1) as StepKey);
  };

  const back = () => setStep((s) => Math.max(0, s - 1) as StepKey);

  const submit = async () => {
    const e = validateStep(3);
    setErrors(e);
    if (Object.keys(e).length) return;

    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch("/api/clinics/blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practiceName: form.practiceName,
          clinicType: form.clinicType,
          clinicTypeOther: form.clinicTypeOther,
          locations: Number(form.locations),
          practitioners: Number(form.practitioners),
          enquiryVolume: form.enquiryVolume,
          responseSpeed: form.responseSpeed,
          afterHours: form.afterHours,
          recallHandling: form.recallHandling,
          avgAppointmentValue: Number(form.avgAppointmentValue),
          noShowRate: Number(form.noShowRate),
          timeline: form.timeline,
          // Carry the figures the visitor actually saw, so the follow-up
          // conversation starts from their numbers rather than fresh defaults.
          roiSnapshot: roi
            ? {
                recoveredRevenueMonthly: Math.round(roi.recoveredRevenueMonthly),
                paybackMonths: roi.paybackMonths,
              }
            : undefined,
          contactName: form.contactName,
          role: form.role,
          email: form.email,
          whatsapp: form.whatsapp,
          websiteUrl: form.websiteUrl,
          consent: form.consent,
          company_website: honeypot,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        // Surface field-level server issues rather than a generic failure.
        if (Array.isArray(json?.issues) && json.issues.length) {
          const mapped: Record<string, string> = {};
          for (const issue of json.issues) {
            const key = Array.isArray(issue.path) ? String(issue.path[0]) : "";
            if (key) mapped[key] = issue.message;
          }
          setErrors(mapped);
          setServerError("Some answers need a second look.");
        } else {
          setServerError(json?.error || "Something went wrong on our side. Please try again.");
        }
        return;
      }
      setDone(true);
    } catch {
      setServerError("Could not reach the server. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const progress = useMemo(() => ((step + 1) / 4) * 100, [step]);

  if (done) {
    return (
      <div className="vs-card text-center">
        <p className="font-heading text-2xl">That is everything we need.</p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-textMuted">
          Your blueprint is being put together against the numbers you gave us. It comes to you on
          WhatsApp within one working day — the recoverable revenue, where it is leaking, and what
          it would take to close each gap. If the honest answer is that a system will not pay for
          itself at your size, that is what it will say.
        </p>
      </div>
    );
  }

  return (
    <div className="vs-card relative">
      {/* Progress */}
      <div className="mb-6">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="vs-section-heading !mb-0">
            Step {step + 1} of 4 · {STEP_TITLES[step]}
          </p>
          <span className="text-xs tabular-nums text-textMuted">{Math.round(progress)}%</span>
        </div>
        <div
          className="h-1 w-full overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-valuenow={step + 1}
          aria-valuemin={1}
          aria-valuemax={4}
          aria-label="Blueprint progress"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* ── Step 0 · Situation ─────────────────────────────── */}
      {step === 0 && (
        <div className="space-y-5">
          <Text
            label="Practice name"
            value={form.practiceName}
            onChange={(v) => set("practiceName", v)}
            error={errors.practiceName}
          />
          <Select
            label="What kind of practice is it?"
            value={form.clinicType}
            onChange={(v) => set("clinicType", v)}
            options={CLINIC_TYPES}
            error={errors.clinicType}
          />
          {form.clinicType === "Other private practice" && (
            <Text
              label="In a few words"
              value={form.clinicTypeOther}
              onChange={(v) => set("clinicTypeOther", v)}
              error={errors.clinicTypeOther}
            />
          )}
          <div className="grid grid-cols-2 gap-4">
            <Text
              label="Locations"
              type="number"
              value={form.locations}
              onChange={(v) => set("locations", v)}
              error={errors.locations}
            />
            <Text
              label="Practitioners"
              type="number"
              value={form.practitioners}
              onChange={(v) => set("practitioners", v)}
              error={errors.practitioners}
            />
          </div>
        </div>
      )}

      {/* ── Step 1 · Problem awareness ─────────────────────── */}
      {step === 1 && (
        <div className="space-y-5">
          <p className="text-sm leading-relaxed text-textMuted">
            No wrong answers here — we are mapping how things actually work, not how they are
            supposed to.
          </p>
          <Select
            label="Roughly how many enquiries reach you a month?"
            hint="Calls, WhatsApps, forms, Google Maps — all of it."
            value={form.enquiryVolume}
            onChange={(v) => set("enquiryVolume", v)}
            options={ENQUIRY_VOLUME_BANDS}
            error={errors.enquiryVolume}
          />
          <Select
            label="When a new enquiry comes in, how quickly does it get a reply?"
            value={form.responseSpeed}
            onChange={(v) => set("responseSpeed", v)}
            options={RESPONSE_SPEED_BANDS}
            error={errors.responseSpeed}
          />
          <Select
            label="And what happens to one that arrives after hours?"
            value={form.afterHours}
            onChange={(v) => set("afterHours", v)}
            options={AFTER_HOURS_HANDLING}
            error={errors.afterHours}
          />
          <Select
            label="How do patients who are due back get brought in?"
            value={form.recallHandling}
            onChange={(v) => set("recallHandling", v)}
            options={RECALL_HANDLING}
            error={errors.recallHandling}
          />
        </div>
      )}

      {/* ── Step 2 · Consequence ───────────────────────────── */}
      {step === 2 && (
        <div className="space-y-5">
          <p className="text-sm leading-relaxed text-textMuted">
            These two numbers are what turn the gaps above into a rand figure.
          </p>
          <Text
            label="Average value of an appointment"
            hint="Blended across consults and treatment. A rough figure is fine."
            type="number"
            prefix="R"
            value={form.avgAppointmentValue}
            onChange={(v) => set("avgAppointmentValue", v)}
            error={errors.avgAppointmentValue}
          />
          <Text
            label="Your no-show rate"
            hint="If you do not measure it, estimate. Most practices sit between 10% and 30%."
            type="number"
            suffix="%"
            value={form.noShowRate}
            onChange={(v) => set("noShowRate", v)}
            error={errors.noShowRate}
          />
          <Select
            label="When would you want this solved?"
            value={form.timeline}
            onChange={(v) => set("timeline", v)}
            options={TIMELINE_BANDS}
            error={errors.timeline}
          />
        </div>
      )}

      {/* ── Step 3 · Contact ───────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-5">
          <Text
            label="Your name"
            value={form.contactName}
            onChange={(v) => set("contactName", v)}
            error={errors.contactName}
          />
          <Text
            label="Your role"
            hint="Optional — owner, practice manager, principal."
            value={form.role}
            onChange={(v) => set("role", v)}
          />
          <Text
            label="Email"
            type="email"
            value={form.email}
            onChange={(v) => set("email", v)}
            error={errors.email}
          />
          <Text
            label="WhatsApp"
            hint="This is where the blueprint is sent."
            placeholder="+27 82 123 4567"
            value={form.whatsapp}
            onChange={(v) => set("whatsapp", v)}
            error={errors.whatsapp}
          />
          <Text
            label="Website"
            hint="Optional."
            placeholder="yourpractice.co.za"
            value={form.websiteUrl}
            onChange={(v) => set("websiteUrl", v)}
            error={errors.websiteUrl}
          />

          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-accent"
              checked={form.consent}
              onChange={(e) => set("consent", e.target.checked)}
              aria-invalid={Boolean(errors.consent)}
            />
            <span className="leading-relaxed text-textMuted">
              You may contact me on WhatsApp and email about this blueprint. We do not share your
              details, and you can ask us to delete them at any time.
            </span>
          </label>
          {errors.consent && <p className="-mt-2 text-xs text-red-400">{errors.consent}</p>}

          {/* Bot trap. aria-hidden + tabIndex -1 keeps it out of the keyboard
              order and away from screen readers, so it costs real users
              nothing. Positioned off-canvas rather than display:none, because
              some bots skip hidden inputs specifically. */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-[-9999px] top-0 h-px w-px overflow-hidden opacity-0"
          >
            <label htmlFor="company_website">Company website</label>
            <input
              id="company_website"
              name="company_website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </div>
        </div>
      )}

      {serverError && (
        <p className="mt-5 rounded-xl border border-red-400/30 bg-red-400/[0.06] px-4 py-3 text-sm text-red-300">
          {serverError}
        </p>
      )}

      {/* Controls */}
      <div className="mt-7 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={back}
          disabled={step === 0}
          className="vs-button-ghost disabled:pointer-events-none disabled:opacity-40"
        >
          Back
        </button>

        {step < 3 ? (
          <button type="button" onClick={next} className="vs-button-primary">
            Continue
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="vs-button-primary disabled:opacity-60"
          >
            {submitting ? "Sending…" : "Send me the blueprint"}
          </button>
        )}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-textMuted">
        The blueprint is free and yours either way — there is no call to sit through before you
        get it.
      </p>
    </div>
  );
}
