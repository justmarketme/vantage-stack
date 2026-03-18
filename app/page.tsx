"use client";

import { useEffect, useState } from "react";
import { Navbar } from "../components/layout/Navbar";
import { Footer } from "../components/layout/Footer";
import { BlueprintFlow } from "../components/blueprint/BlueprintFlow";
import { AnimatePresence, motion } from "framer-motion";

export default function HomePage() {
  return (
    <div className="relative">
      <Navbar />

      <main className="pt-28">
        <HeroSection />
        <ProblemSection />
        <SolutionSection />
        <BlueprintFlow />
        <ServicesSection />
        <RevenueSystemSection />
        <PracticeSection />
        <SouthAfricaSection />
        <FinalCtaSection />
      </main>

      <Footer />
    </div>
  );
}

function HeroSection() {
  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    {
      id: 0,
      label: "Incoming call",
      description:
        "Incoming call…\n+27 82 XXX XXXX\n\"Looking for a quote\"",
      status: "Detecting caller",
      accent: "text-sky-300",
    },
    {
      id: 1,
      label: "AI assistant answers",
      description:
        "AI: \"Hi, how can I help you today?\"\nUser intent detected and categorized",
      status: "Active conversation",
      accent: "text-emerald-300",
    },
    {
      id: 2,
      label: "Lead captured",
      description:
        "Lead details captured and synced\nName, service type, urgency",
      status: "Profile created",
      accent: "text-sky-300",
    },
    {
      id: 3,
      label: "Appointment booked",
      description: "Appointment confirmed\nTuesday, 10:30 AM",
      status: "Slot confirmed",
      accent: "text-emerald-300",
    },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % steps.length);
    }, 2000);

    return () => clearInterval(interval);
  }, [steps.length]);

  return (
    <section className="vs-section">
      <div className="vs-container">
        <div className="vs-grid items-center gap-10">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-6"
          >
            <div className="vs-badge">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Business optimization & revenue systems
            </div>
            <h1 className="font-heading text-[34px] leading-tight md:text-5xl lg:text-[56px] lg:leading-[1.05]">
              Turn your business into a{" "}
              <span className="text-accent">revenue engine.</span>
            </h1>
            <p className="max-w-xl text-sm md:text-base text-textMuted">
              VantageStack combines premium web design, intelligent systems, and
              AI-powered automation to turn South African businesses into
              predictable revenue machines. Not just more traffic. Smarter
              systems.
            </p>
            <p className="max-w-xl text-xs md:text-sm text-textMuted/90">
              Every missed call, slow reply, or broken flow is lost revenue.
              <br />
              We fix that—systematically.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href="#blueprint"
                className="vs-button-primary text-sm"
              >
                Get Your Growth Optimization Blueprint
              </a>
              <button className="vs-button-ghost text-sm">
                Explore the VantageStack system
              </button>
            </div>
            <p className="max-w-md text-[11px] text-textMuted">
              Used by growing South African businesses to capture more leads.
            </p>
            <p className="text-xs text-textMuted/80">
              We are not a web design agency. We design, optimize, and automate
              your business using intelligent systems.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="relative"
          >
            <div className="relative overflow-hidden rounded-3xl border border-sky-500/30 bg-gradient-to-br from-surface to-black/60 p-4 md:p-6 shadow-[0_0_40px_rgba(59,130,246,0.35)]">
              <div className="mb-4 flex items-center justify-between text-[11px] text-textMuted">
                <span className="inline-flex items-center gap-1">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400/50" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sky-400" />
                  </span>
                  AI Call Flow
                </span>
                <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-100">
                  Live system simulation
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.1fr)] items-start">
                <div className="space-y-2 text-[11px]">
                  <div className="flex items-center justify-between text-[10px] text-textMuted/80">
                    <span>Current step</span>
                    <span>
                      {activeStep + 1} / {steps.length}
                    </span>
                  </div>
                  <div className="relative h-32 md:h-36">
                    <AnimatePresence mode="wait">
                      {steps.map(
                        (step) =>
                          step.id === activeStep && (
                            <motion.div
                              key={step.id}
                              initial={{ opacity: 0, y: 16 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -16 }}
                              transition={{
                                duration: 0.5,
                                ease: [0.16, 1, 0.3, 1],
                              }}
                              className="absolute inset-0 rounded-2xl border border-white/10 bg-black/50 p-3"
                            >
                              <div className="mb-2 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/15 text-[11px] text-sky-100">
                                    {step.id + 1}
                                  </span>
                                  <p className="text-[11px] font-medium text-white">
                                    {step.label}
                                  </p>
                                </div>
                                <span
                                  className={`text-[10px] ${step.accent}`}
                                >
                                  {step.status}
                                </span>
                              </div>
                              <p className="text-[11px] text-textMuted whitespace-pre-line">
                                {step.description}
                              </p>
                              <div className="mt-3 space-y-1.5 text-[10px] text-textMuted/80">
                                <div className="flex items-center justify-between">
                                  <span>Signal</span>
                                  <div className="flex gap-0.5">
                                    <span className="h-1.5 w-1.5 rounded-sm bg-sky-400" />
                                    <span className="h-2 w-1.5 rounded-sm bg-sky-300" />
                                    <span className="h-2.5 w-1.5 rounded-sm bg-sky-200" />
                                  </div>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span>Latency</span>
                                  <span className="text-[10px] text-emerald-300">
                                    &lt; 500ms
                                  </span>
                                </div>
                              </div>
                            </motion.div>
                          )
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="space-y-2 text-[11px]">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-textMuted">
                    System timeline
                  </p>
                  <div className="space-y-1.5">
                    {steps.map((step) => {
                      const isActive = step.id === activeStep;
                      const isCompleted = step.id < activeStep;

                      return (
                        <motion.div
                          key={step.id}
                          initial={false}
                          animate={{
                            opacity: isCompleted || isActive ? 1 : 0.4,
                            x: isActive ? 0 : 0,
                          }}
                          transition={{ duration: 0.25 }}
                          className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 ${
                            isActive
                              ? "border-sky-500/60 bg-sky-500/10"
                              : isCompleted
                              ? "border-emerald-500/30 bg-emerald-500/5"
                              : "border-white/5 bg-black/40"
                          }`}
                        >
                          <span
                            className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${
                              isActive
                                ? "bg-sky-500 text-black"
                                : isCompleted
                                ? "bg-emerald-400 text-black"
                                : "bg-white/5 text-textMuted"
                            }`}
                          >
                            {step.id + 1}
                          </span>
                          <div className="flex-1">
                            <p className="truncate text-[10px] text-white/90">
                              {step.label}
                            </p>
                            <p className="hidden text-[10px] text-textMuted md:block">
                              {step.status}
                            </p>
                          </div>
                          {isActive && (
                            <motion.span
                              className="h-1.5 w-1.5 rounded-full bg-sky-300"
                              animate={{ opacity: [0.4, 1, 0.4] }}
                              transition={{
                                duration: 1.2,
                                repeat: Infinity,
                                ease: "easeInOut",
                              }}
                            />
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[10px] text-textMuted/80">
                    Every call is captured, qualified, and turned into a booked
                    opportunity—without adding more manual workload to your
                    team.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function ProblemSection() {
  return (
    <section className="vs-section border-t border-white/5 bg-black/40">
      <div className="vs-container">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="mb-8">
            <p className="vs-section-heading">The hidden problem</p>
            <h2 className="vs-section-title max-w-xl">
              Your business is likely leaking revenue in places you cannot see.
            </h2>
          </div>
          <div className="vs-grid gap-8">
            <div className="space-y-4 text-sm text-textMuted max-w-xl">
              <p>
                Most South African businesses are not struggling because of
                traffic. They are struggling because their systems have gaps:
                misaligned websites, manual follow‑ups, and disconnected tools
                that do not talk to each other.
              </p>
              <p>
                The result? Inconsistent months, opportunities left on the table,
                and teams constantly “catching up” instead of running a predictable
                machine.
              </p>
            </div>
            <div className="grid gap-4 text-sm text-textMuted">
              <motion.div
                className="vs-card vs-card-hover border border-white/10"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="space-y-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-textMuted/70 mb-3">
                    Where money is lost
                  </p>
                  <ul className="space-y-1 text-xs leading-relaxed text-textMuted/90 max-w-xs">
                    <li>• High‑intent visitors not converting on your site.</li>
                    <li>• Leads waiting days for a response.</li>
                    <li>• No consistent follow‑up or nurturing.</li>
                    <li>• No clear visibility into your funnel and bottlenecks.</li>
                  </ul>
                </div>
              </motion.div>
              <motion.div
                className="vs-card vs-card-hover border border-rose-500/25 bg-rose-500/5 text-xs"
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
              >
                <div className="space-y-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-rose-100/80 mb-3">
                    The quiet risk
                  </p>
                  <p className="leading-relaxed text-textMuted/90 max-w-sm">
                    The real risk is not “no leads”. It is the silent loss of
                    qualified opportunities because your systems are not optimized.
                  </p>
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function SolutionSection() {
  return (
    <section className="vs-section">
      <div className="vs-container">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="mb-8">
            <p className="vs-section-heading">The VantageStack answer</p>
            <h2 className="vs-section-title max-w-xl">
              We build revenue systems, not just websites.
            </h2>
          </div>
          <div className="vs-grid gap-8">
            <div className="space-y-4 text-sm text-textMuted max-w-xl">
              <p>
                VantageStack aligns premium web design with intelligent systems
                and AI automation. We design the entire journey—from first
                impression to closed deal—so each part of your business supports a
                single outcome: revenue.
              </p>
              <p>
                That means your website, forms, CRM, follow‑ups, and AI assistants
                all work as one cohesive system instead of a collection of
                disconnected tools.
              </p>
            </div>
            <div className="grid gap-4 text-xs text-textMuted">
              <motion.div
                className="vs-card vs-card-hover border border-white/10"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="space-y-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-textMuted/70 mb-3">
                    How we think
                  </p>
                  <ul className="space-y-1 text-xs leading-relaxed text-textMuted/90 max-w-sm">
                    <li>• Design that earns trust and lifts conversion.</li>
                    <li>• Systems that capture and qualify every lead.</li>
                    <li>• Automation that scales your follow‑up without more headcount.</li>
                  </ul>
                </div>
              </motion.div>
              <motion.a
                href="#blueprint"
                className="vs-button-primary mt-1 inline-flex w-fit text-xs"
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.06 }}
              >
                Start with your Blueprint
              </motion.a>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function ServicesSection() {
  return (
    <section
      id="services"
      className="vs-section border-t border-white/5 bg-gradient-to-b from-black/60 via-black/70 to-black/90"
    >
      <div className="vs-container">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="vs-section-heading">How we work</p>
              <h2 className="vs-section-title max-w-xl">
                From diagnosis to a fully installed revenue system.
              </h2>
            </div>
            <p className="max-w-md text-sm text-textMuted">
              We architect and build the digital layer of your business: from the
              first impression on your site to the systems that capture, qualify,
              and convert demand.
            </p>
          </div>
          <div className="grid gap-6 md:gap-8 md:grid-cols-3 text-sm text-textMuted">
            {[
              {
                label: "Step 1",
                title: "Growth Optimization Blueprint",
                body: "A focused diagnostic that maps where your business is losing revenue and what to fix first.",
                outcome: "Clear visibility into where your revenue is leaking.",
              },
              {
                label: "Step 2",
                title: "Revenue System Installation",
                body: "We design and install your full revenue system—from website to lead capture, automation, and conversion flows.",
                outcome: "A fully connected system that captures and converts demand.",
              },
              {
                label: "Step 3",
                title: "Revenue Optimization",
                body: "Ongoing improvements to your system to increase conversion rates, response speed, and pipeline consistency.",
                outcome: "Higher conversion rates and more predictable monthly revenue.",
              },
            ].map((card, index) => (
              <motion.div
                key={card.label}
                className="vs-card vs-card-hover border border-white/10"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{
                  duration: 0.55,
                  ease: [0.16, 1, 0.3, 1],
                  delay: 0.08 * index,
                }}
              >
                <div className="space-y-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-textMuted/70 mb-3">
                    {card.label}
                  </p>
                  <h3 className="font-heading text-base mb-3 text-textPrimary/95">
                    {card.title}
                  </h3>
                  <p className="text-xs leading-relaxed text-textMuted/90 max-w-xs">
                    {card.body}
                  </p>
                  <p className="text-[11px] text-textMuted/70 mt-2">
                    Outcome: {card.outcome}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
          <div className="mt-10 flex justify-center">
            <motion.a
              href="#blueprint"
              className="vs-button-primary inline-flex w-fit text-xs"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              Start with your Blueprint
            </motion.a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function RevenueSystemSection() {
  return (
    <section
      id="revenue-system"
      className="vs-section bg-gradient-to-b from-black/40 via-slate-950/60 to-black"
    >
      <div className="vs-container">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="mb-8 space-y-2">
            <p className="text-[11px] uppercase tracking-[0.2em] text-textMuted/80">
              Your business operating system
            </p>
            <p className="vs-section-heading">VantageStack Revenue System™</p>
            <h2 className="vs-section-title max-w-2xl">
              Plug‑in revenue infrastructure that captures, qualifies, and
              converts demand on autopilot.
            </h2>
          </div>
          <div className="grid gap-6 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.8fr)] text-sm text-textMuted">
            <div className="space-y-4 max-w-xl">
              <p>
                The VantageStack Revenue System™ turns your website, calls, and
                follow‑ups into one connected revenue engine: AI call assistants,
                intelligent capture, qualification logic, and crystal‑clear
                visibility into your funnel.
              </p>
              <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-3 text-xs">
                <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-sky-100/80">
                  Simple system model
                </p>
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <p className="text-[11px] font-medium text-white">Step 1: Capture</p>
                    <p className="text-[11px] text-textMuted">
                      Never miss a high‑intent lead again—every call, form, and chat
                      is captured automatically.
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-white">Step 2: Convert</p>
                    <p className="text-[11px] text-textMuted">
                      Qualify, route, and follow up so your team only speaks to
                      ready‑to‑buy opportunities.
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-white">Step 3: Scale</p>
                    <p className="text-[11px] text-textMuted">
                      Add volume without adding headcount with automation built
                      around your existing tools.
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-textMuted/80 mt-2">
                Includes optional AI call handling, automated follow-ups, and intelligent routing.
              </p>
              <div className="grid gap-4 md:grid-cols-2 text-xs">
                <motion.div
                  className="vs-card vs-card-hover border border-white/10"
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="space-y-3">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-textMuted/70 mb-3">
                      AI Call Assistant
                    </p>
                    <p className="leading-relaxed text-textMuted/90 max-w-sm">
                      Never miss a high‑intent lead again. Always‑on AI answers calls,
                      captures intent, and books next steps while your team is busy.
                    </p>
                    <p className="text-[11px] text-sky-200/90">
                      Available as a standalone add-on or part of your full system.
                    </p>
                  </div>
                </motion.div>
                <motion.div
                  className="vs-card vs-card-hover border border-white/10"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{
                    duration: 0.55,
                    ease: [0.16, 1, 0.3, 1],
                    delay: 0.08,
                  }}
                >
                  <div className="space-y-3">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-textMuted/70 mb-3">
                      Intelligent lead capture
                    </p>
                    <p className="leading-relaxed text-textMuted/90 max-w-sm">
                      Smart forms and flows that qualify in real‑time, reduce manual
                      data entry, and feed clean opportunities into your CRM and
                      pipeline.
                    </p>
                  </div>
                </motion.div>
              </div>
            </div>
            <motion.div
              className="vs-card vs-card-hover border border-white/10 !px-5 !py-4 text-xs flex flex-col justify-start hover:shadow-[0_0_45px_rgba(59,130,246,0.12)]"
              initial={{ opacity: 0, y: 20, boxShadow: "0 0 0 rgba(59,130,246,0)" }}
              whileInView={{
                opacity: 1,
                y: 0,
                boxShadow: "0 0 40px rgba(59,130,246,0.08)",
              }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{
                duration: 0.55,
                ease: [0.16, 1, 0.3, 1],
                delay: 0.12,
              }}
            >
              <div className="max-w-sm space-y-3">
                <p className="text-[10px] uppercase tracking-[0.22em] text-textMuted/70 mb-3">
                  How the system flows
                </p>
                <p className="text-[11px] text-textMuted/80 max-w-xs leading-relaxed">
                  A structured flow designed to capture, qualify, and convert every opportunity without manual bottlenecks.
                </p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-textMuted/60">
                  System sequence
                </p>
                <div className="rounded-xl border border-white/5 bg-black/30 px-3 py-2 inline-flex flex-wrap items-center gap-1 text-[10px] text-textMuted/90">
                  <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-white/90">
                    Capture
                  </span>
                  <span className="text-textMuted/60">→</span>
                  <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-white/90">
                    Qualify
                  </span>
                  <span className="text-textMuted/60">→</span>
                  <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-white/90">
                    Book
                  </span>
                  <span className="text-textMuted/60">→</span>
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-emerald-200">
                    Close
                  </span>
                </div>
                <div className="h-px bg-white/5 my-2" />
                <ul className="space-y-1 leading-relaxed text-textMuted/90 max-w-xs">
                  <li>• Faster response times on every high‑intent touchpoint.</li>
                  <li>• Higher conversion rates from visit to booked call.</li>
                  <li>• More predictable pipeline with clean, consistent data.</li>
                  <li>• A plug‑in system that works with your existing tools.</li>
                </ul>
                <p className="text-[11px] text-textMuted/70 leading-relaxed max-w-xs">
                  Most businesses already have these steps—just not connected into a single system.
                </p>
              </div>
            </motion.div>
          </div>
          <div className="mt-8 flex flex-col items-start gap-3 text-xs text-textMuted md:flex-row md:items-center md:justify-between">
            <p className="max-w-md">
              See how this system applies to your business with a tailored Growth
              Optimization Blueprint.
            </p>
            <a href="#blueprint" className="vs-button-primary text-xs">
              See how this system applies to your business
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function PracticeSection() {
  const cards = [
    {
      title: "For businesses starting from scratch",
      body: "We design and build your full revenue system—from your website to lead capture and follow-up—so every opportunity is captured and converted.",
      subline: "Typically includes full system setup.",
      outcome: "Every opportunity captured and converted from day one.",
    },
    {
      title: "For businesses already getting leads",
      body: "We identify where revenue is being lost and rebuild your system to improve conversion rates, response speed, and pipeline visibility.",
      subline: "Focused on fixing and optimizing existing systems.",
      outcome: "No more lost revenue—clear fixes and better conversion.",
    },
    {
      title: "For businesses ready to scale",
      body: "We layer automation, AI assistants, and advanced workflows on top of your system to handle more volume without adding more people.",
      subline: "Built for growth without operational overload.",
      outcome: "More volume and revenue without operational overload.",
    },
  ];

  return (
    <section
      id="practice"
      className="vs-section border-t border-white/5 bg-gradient-to-b from-black/40 via-slate-950/50 to-black"
    >
      <div className="vs-container">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="mb-10 md:mb-12">
            <p className="vs-section-heading">What this looks like in practice</p>
            <h2 className="vs-section-title max-w-2xl">
              Where you are determines what you need.
            </h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {cards.map((card, i) => (
              <motion.div
                key={card.title}
                className="vs-card vs-card-hover border border-white/10 flex flex-col"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{
                  duration: 0.55,
                  ease: [0.16, 1, 0.3, 1],
                  delay: i * 0.08,
                }}
              >
                <h3 className="text-base md:text-lg font-medium text-white mb-3">
                  {card.title}
                </h3>
                <p className="text-sm text-textMuted/90 leading-relaxed flex-1">
                  {card.body}
                </p>
                <p className="text-xs uppercase tracking-[0.16em] text-textMuted/70 mt-4 pt-3 border-t border-white/5">
                  {card.subline}
                </p>
                <p className="text-[11px] text-textMuted/70 mt-2">
                  Outcome: {card.outcome}
                </p>
              </motion.div>
            ))}
          </div>
          <div className="mt-10 md:mt-12 flex flex-col items-center text-center">
            <a href="#blueprint" className="vs-button-primary text-sm">
              Get your Growth Optimization Blueprint
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function SouthAfricaSection() {
  return (
    <section id="sa" className="vs-section border-t border-white/5 bg-black/60">
      <div className="vs-container">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="mb-8">
            <p className="vs-section-heading">Built for South Africa</p>
            <h2 className="vs-section-title max-w-xl">
              Context‑aware systems for South African businesses.
            </h2>
          </div>
          <div className="vs-grid gap-8 text-sm text-textMuted">
            <div className="space-y-3 max-w-xl">
              <p>
                VantageStack is built with South African realities in mind:
                bandwidth, buying cycles, decision‑making structures, and market
                nuance.
              </p>
              <p>
                Your systems should feel grounded in your market while still
                operating at a global standard.
              </p>
            </div>
            <div className="grid gap-3 text-xs">
              <motion.div
                className="vs-card vs-card-hover border border-white/10"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              >
                <p>UX and content calibrated for South African audiences.</p>
              </motion.div>
              <motion.div
                className="vs-card vs-card-hover border border-white/10"
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{
                  duration: 0.55,
                  ease: [0.16, 1, 0.3, 1],
                  delay: 0.08,
                }}
              >
                <p>Pricing, positioning, and systems aligned to local realities.</p>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function FinalCtaSection() {
  return (
    <section className="vs-section">
      <div className="vs-container">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="vs-card vs-card-hover border border-white/10 text-center"
        >
          <p className="text-xs uppercase tracking-[0.2em] text-textMuted mb-3">
            Next step
          </p>
          <h2 className="font-heading text-2xl md:text-3xl mb-3">
            Ready to turn your business into a revenue engine?
          </h2>
          <p className="mx-auto mb-6 max-w-xl text-sm text-textMuted">
            Start with your Growth Optimization Blueprint. We will audit your
            current systems and show you the clearest path to more predictable
            revenue.
          </p>
          <a href="#blueprint" className="vs-button-primary text-sm">
            Get Your Growth Optimization Blueprint
          </a>
        </motion.div>
      </div>
    </section>
  );
}

