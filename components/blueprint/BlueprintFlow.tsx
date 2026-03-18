"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useMemo, useState } from "react";

type BlueprintStep = "form" | "processing" | "insights" | "confirmation";

type FormState = {
  businessName: string;
  industry: string;
  websiteStatus: "yes" | "no" | "outdated" | "";
  websiteUrl: string;
  leadSource: string;
  responseSpeed: string;
  biggestChallenge: string;
  revenueRange: string;
  name: string;
  email: string;
  phone: string;
};

const initialFormState: FormState = {
  businessName: "",
  industry: "",
  websiteStatus: "",
  websiteUrl: "",
  leadSource: "",
  responseSpeed: "",
  biggestChallenge: "",
  revenueRange: "",
  name: "",
  email: "",
  phone: ""
};

const steps = [
  "Business profile",
  "Current state",
  "Contact details"
] as const;

export function BlueprintFlow() {
  const [mode, setMode] = useState<BlueprintStep>("form");
  const [form, setForm] = useState<FormState>(initialFormState);
  const [currentStep, setCurrentStep] = useState(0);

  const progress = useMemo(
    () => ((currentStep + 1) / steps.length) * 100,
    [currentStep]
  );

  const handleChange = (
    field: keyof FormState,
    value: string | BlueprintStep
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((step) => step + 1);
    } else {
      setMode("processing");
      setTimeout(() => setMode("insights"), 1800);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((step) => step - 1);
    }
  };

  const reset = () => {
    setForm(initialFormState);
    setCurrentStep(0);
    setMode("form");
  };

  const insightCards = useMemo(() => {
    const cards: { id: string; title: string; body: string }[] = [];
    const challenge = form.biggestChallenge.toLowerCase();

    // Website related
    if (form.websiteStatus === "no") {
      cards.push({
        id: "no-website",
        title: "No structured online demand capture",
        body: "You currently have no structured system to convert online demand."
      });
    }

    if (form.websiteStatus === "outdated") {
      cards.push({
        id: "outdated-website",
        title: "Outdated experience eroding perceived value",
        body: "An outdated web experience quietly reduces trust, pricing power, and conversion rates."
      });
    }

    // Lead + conversion related
    if (challenge.includes("missed calls") || challenge.includes("missed call")) {
      cards.push({
        id: "missed-calls",
        title: "Revenue leaking through missed calls",
        body: "You may be losing high-intent leads due to unanswered calls."
      });
    }

    if (challenge.includes("low conversions") || challenge.includes("low conversion")) {
      cards.push({
        id: "low-conversions",
        title: "Website not converting demand into pipeline",
        body: "Your website may not be effectively turning visitors into leads."
      });
    }

    if (challenge.includes("not sure") || challenge.includes("unsure")) {
      cards.push({
        id: "not-sure",
        title: "Hidden gaps across the journey",
        body: "There may be hidden gaps in your customer journey reducing conversions."
      });
    }

    // Automation / systems
    if (challenge.includes("automation")) {
      cards.push({
        id: "automation",
        title: "Manual processes slowing compounding revenue",
        body: "There is likely immediate ROI in automating repetitive touchpoints across your funnel."
      });
    }

    if (challenge.includes("leads") && !cards.find((c) => c.id === "low-conversions")) {
      cards.push({
        id: "lead-systems",
        title: "Lead capture and follow-up systems",
        body: "Your challenge sounds less like a traffic issue and more like a system issue in lead capture and follow-up."
      });
    }

    if (!cards.length) {
      cards.push(
        {
          id: "system-vs-traffic",
          title: "Systems over raw traffic",
          body: "Most businesses do not have a traffic problem. They have a system problem."
        },
        {
          id: "baseline-ops",
          title: "Revenue quietly leaking through friction",
          body: "Small bottlenecks in how leads are captured, routed, and followed up can compound into meaningful revenue loss."
        }
      );
    }

    // Keep to 2–3 insights for focus
    return cards.slice(0, 3);
  }, [form.websiteStatus, form.biggestChallenge]);

  return (
    <section id="blueprint" className="vs-section">
      <div className="vs-container">
        <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="vs-section-heading">Growth Optimization Blueprint</p>
            <h2 className="vs-section-title max-w-xl">
              Diagnose where your business is quietly leaking revenue.
            </h2>
            <p className="mt-4 max-w-xl text-sm text-textMuted">
              In a short diagnostic, we map your current systems, highlight
              revenue leaks, and outline the exact optimizations that turn your
              business into a predictable revenue engine.
            </p>
          </div>
          <div className="flex gap-3 text-xs text-textMuted">
            <div className="vs-badge">South African businesses</div>
            <div className="vs-badge">Done-with-you strategy</div>
          </div>
        </div>

        <div className="grid gap-8 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <motion.div
            layout
            className="vs-card relative overflow-hidden border border-white/10"
          >
            <div className="mb-6 flex items-center justify-between gap-4">
              <div className="space-y-3">
                <p className="text-[10px] uppercase tracking-[0.22em] text-textMuted/70">
                  Personalized audit
                </p>
                <p className="text-lg font-heading">
                  Get your Growth Optimization Blueprint
                </p>
              </div>
              <div className="flex flex-col items-end text-right text-xs text-textMuted space-y-1">
                <span className="text-textPrimary">
                  Step {currentStep + 1} of {steps.length}
                </span>
                <span>{steps[currentStep]}</span>
              </div>
            </div>

            <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
              <motion.div
                className="h-full rounded-full bg-accent"
                initial={false}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
            </div>

            <AnimatePresence mode="wait">
              {mode === "form" && (
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="space-y-6"
                >
                  {currentStep === 0 && (
                    <div className="space-y-4">
                      <div>
                        <label className="mb-1 block text-xs text-textMuted">
                          Business name
                        </label>
                        <input
                          className="vs-input"
                          value={form.businessName}
                          onChange={(e) =>
                            handleChange("businessName", e.target.value)
                          }
                          placeholder="e.g. Cape Coastal Logistics"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-textMuted">
                          Industry
                        </label>
                        <input
                          className="vs-input"
                          value={form.industry}
                          onChange={(e) =>
                            handleChange("industry", e.target.value)
                          }
                          placeholder="e.g. B2B services, eCommerce, professional practice"
                        />
                      </div>
                    </div>
                  )}

                  {currentStep === 1 && (
                    <div className="space-y-4">
                      <div>
                        <label className="mb-2 block text-xs text-textMuted">
                          Website status
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { value: "yes", label: "Live & active" },
                            { value: "outdated", label: "Live but outdated" },
                            { value: "no", label: "No website yet" }
                          ].map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() =>
                                handleChange(
                                  "websiteStatus",
                                  option.value as FormState["websiteStatus"]
                                )
                              }
                              className={`rounded-full border px-3 py-1 text-xs transition ${
                                form.websiteStatus === option.value
                                  ? "border-accent bg-accent/20 text-textPrimary"
                                  : "border-white/10 bg-black/30 text-textMuted hover:border-white/30"
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-textMuted">
                          If you have a website, what is the URL?
                        </label>
                        <input
                          type="url"
                          className="vs-input"
                          value={form.websiteUrl}
                          onChange={(e) =>
                            handleChange("websiteUrl", e.target.value)
                          }
                          placeholder="https://yourwebsite.co.za"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-textMuted">
                          Biggest growth challenge right now
                        </label>
                        <textarea
                          className="vs-input min-h-[90px] resize-none"
                          value={form.biggestChallenge}
                          onChange={(e) =>
                            handleChange("biggestChallenge", e.target.value)
                          }
                          placeholder="Where does it feel like money is being left on the table?"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-textMuted">
                          Where do most of your leads currently come from?
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            "Referrals",
                            "Paid ads",
                            "Social media",
                            "Website / SEO",
                            "Not sure"
                          ].map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => handleChange("leadSource", option)}
                              className={`rounded-full border px-3 py-1 text-xs transition ${
                                form.leadSource === option
                                  ? "border-accent bg-accent/20 text-textPrimary"
                                  : "border-white/10 bg-black/30 text-textMuted hover:border-white/30"
                              }`}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-textMuted">
                          How quickly do you typically respond to new leads?
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            "Immediately",
                            "Within a few hours",
                            "Same day",
                            "1–2 days",
                            "Not consistent"
                          ].map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() =>
                                handleChange("responseSpeed", option)
                              }
                              className={`rounded-full border px-3 py-1 text-xs transition ${
                                form.responseSpeed === option
                                  ? "border-accent bg-accent/20 text-textPrimary"
                                  : "border-white/10 bg-black/30 text-textMuted hover:border-white/30"
                              }`}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-textMuted">
                          Monthly revenue range (optional)
                        </label>
                        <select
                          className="vs-input bg-black/40"
                          value={form.revenueRange}
                          onChange={(e) =>
                            handleChange("revenueRange", e.target.value)
                          }
                        >
                          <option value="">Prefer not to say</option>
                          <option value="0-100k">R0 – R100k</option>
                          <option value="100k-500k">R100k – R500k</option>
                          <option value="500k-1m">R500k – R1m</option>
                          <option value="1m-plus">R1m+</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {currentStep === 2 && (
                    <div className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs text-textMuted">
                            Your name
                          </label>
                          <input
                            className="vs-input"
                            value={form.name}
                            onChange={(e) =>
                              handleChange("name", e.target.value)
                            }
                            placeholder="First name"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-textMuted">
                            Work email
                          </label>
                          <input
                            className="vs-input"
                            value={form.email}
                            onChange={(e) =>
                              handleChange("email", e.target.value)
                            }
                            placeholder="you@company.co.za"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-textMuted">
                          Mobile number (for WhatsApp communication)
                        </label>
                        <input
                          type="tel"
                          className="vs-input"
                          value={form.phone}
                          onChange={(e) => handleChange("phone", e.target.value)}
                          placeholder="+27 82 123 4567"
                        />
                        <p className="mt-1 text-[11px] text-textMuted">
                          We may use this to follow up with your blueprint or clarify details.
                        </p>
                      </div>
                      <p className="text-[11px] text-textMuted">
                        We will send your Growth Optimization Blueprint and a
                        short loom or document breakdown. No spam, ever.
                      </p>
                    </div>
                  )}

                  <div className="mt-6 flex flex-col gap-3 border-t border-white/5 pt-4 text-xs text-textMuted md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      <span>Under 2 minutes to complete.</span>
                    </div>
                    <div className="flex gap-2 justify-end">
                      {currentStep > 0 && (
                        <button
                          type="button"
                          onClick={handleBack}
                          className="vs-button-ghost"
                        >
                          Back
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleNext}
                        className="vs-button-primary"
                      >
                        {currentStep === steps.length - 1
                          ? "Submit for analysis"
                          : "Next"}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {mode === "processing" && (
                <motion.div
                  key="processing"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="flex flex-col items-center justify-center gap-6 py-10"
                >
                  <div className="relative h-20 w-20">
                    <motion.div
                      className="absolute inset-0 rounded-3xl bg-accent/20"
                      animate={{
                        scale: [1, 1.08, 1],
                        opacity: [0.35, 0.6, 0.35]
                      }}
                      transition={{
                        duration: 1.6,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                    />
                    <motion.div
                      className="absolute inset-3 rounded-2xl bg-black/60 border border-accent/40"
                      animate={{
                        rotate: [0, 3, -3, 0]
                      }}
                      transition={{
                        duration: 1.6,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                    />
                    <div className="absolute inset-6 flex items-center justify-center text-xs text-accent">
                      Analyzing
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-heading">
                      Analyzing your business systems…
                    </p>
                    <p className="mt-2 text-xs text-textMuted max-w-xs">
                      Mapping your current funnel, revenue leaks, and
                      opportunities for intelligent automation based on your
                      answers.
                    </p>
                  </div>
                </motion.div>
              )}

              {mode === "insights" && (
                <motion.div
                  key="insights"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="flex flex-col gap-6 py-2"
                >
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-textMuted">
                      Instant insight layer
                    </p>
                    <h3 className="mt-2 text-xl font-heading text-textPrimary">
                      Here’s what we’re already seeing…
                    </h3>
                    <p className="mt-3 text-xs text-textMuted max-w-md">
                      Based on your responses, there are a few areas where your business may be losing opportunities.
                    </p>
                  </div>

                  <div className="grid gap-3 md:gap-4">
                    {insightCards.map((card, index) => (
                      <motion.div
                        key={card.id}
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.35,
                          ease: "easeOut",
                          delay: 0.12 * index
                        }}
                        className="group relative overflow-hidden rounded-xl border border-white/8 bg-gradient-to-r from-[#050509] to-[#050509] px-4 py-4 md:px-5 md:py-5"
                      >
                        <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                          <div className="absolute -inset-px rounded-xl bg-accent/10 blur-md" />
                        </div>
                        <div className="relative flex items-start gap-3">
                          <div className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-accent shadow-[0_0_12px_rgba(94,234,212,0.7)]" />
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-textPrimary">
                              {card.title}
                            </p>
                            <p className="text-[11px] text-textMuted/90">
                              {card.body}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <p className="text-[11px] text-textMuted border-t border-white/5 pt-4">
                    This is a high-level view. Your full Growth Optimization Blueprint will break this down in detail.
                  </p>

                  <div className="flex flex-col gap-3 pt-1 md:flex-row md:items-center md:justify-between">
                    <p className="text-[11px] text-textMuted max-w-sm">
                      From here we translate these signals into a concrete, prioritized optimization plan for your systems and revenue flows.
                    </p>
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        className="vs-button-ghost text-xs"
                      >
                        Book a call now
                      </button>
                      <button
                        type="button"
                        className="vs-button-primary text-xs"
                        onClick={() => setMode("confirmation")}
                      >
                        Continue to your Blueprint
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {mode === "confirmation" && (
                <motion.div
                  key="confirmation"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="space-y-6 py-2"
                >
                  <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-200">
                    <p className="font-medium">
                      Your Growth Optimization Blueprint is being prepared.
                    </p>
                    <p className="mt-1 text-emerald-100/80">
                      Expect a first response in one business day with a clear,
                      actionable breakdown.
                    </p>
                  </div>
                  <div className="space-y-3 text-sm text-textMuted">
                    <p className="text-textPrimary text-[15px]">
                      You will receive:
                    </p>
                    <ul className="space-y-2 text-xs">
                      <li>
                        • A mapped view of your current acquisition and
                        conversion systems.
                      </li>
                      <li>
                        • The top 3 revenue leaks that can be fixed in the next
                        30–90 days.
                      </li>
                      <li>
                        • Specific system, automation, and web experience
                        upgrades.
                      </li>
                    </ul>
                  </div>
                  <div className="flex flex-col gap-3 border-t border-white/5 pt-4 md:flex-row md:items-center md:justify-between">
                    <div className="text-xs text-textMuted max-w-sm">
                      Prefer to move faster? You can skip straight to a working
                      session where we review your blueprint live.
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        className="vs-button-ghost text-xs"
                        onClick={reset}
                      >
                        Start another blueprint
                      </button>
                      <button
                        type="button"
                        className="vs-button-primary text-xs"
                      >
                        Book a call
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <motion.aside
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="vs-card vs-card-hover border border-white/10"
          >
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-textMuted/70 mb-3">
                Live insight preview
              </p>
              <h3 className="font-heading text-lg mb-3">
                What your blueprint will highlight
              </h3>
            </div>
            <div className="mt-2 space-y-3 text-xs leading-relaxed text-textMuted/90">
              {insightCards.map((insight) => (
                <div
                  key={insight.id}
                  className="rounded-xl border border-white/5 bg-black/40 px-3 py-3"
                >
                  <p className="text-[10px] uppercase tracking-[0.22em] text-textMuted/70 mb-2">
                    SIGNAL
                  </p>
                  <p className="text-textPrimary/90 text-[13px] font-medium mb-1">
                    {insight.title}
                  </p>
                  <p className="text-[11px] leading-relaxed text-textMuted/90 max-w-xs">
                    {insight.body}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-3 text-[11px] leading-relaxed text-amber-100/90 max-w-sm">
              Most businesses do not have a traffic problem. They have a system
              problem. The blueprint focuses on systems that compound revenue,
              not short-term gimmicks.
            </div>
          </motion.aside>
        </div>
      </div>
    </section>
  );
}

