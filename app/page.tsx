"use client";

import { useEffect, useState } from "react";
import { Navbar } from "../components/layout/Navbar";
import { Footer } from "../components/layout/Footer";
import { BlueprintFlow } from "../components/blueprint/BlueprintFlow";
import { AnimatePresence, motion } from "framer-motion";
import { ProblemVisual, SolutionVisual, RevenueSystemVisual, SouthAfricaVisual } from "../components/home/SectionVisuals";
import { Check } from "lucide-react";

export default function HomePage() {
  return (
    <div className="relative">
      <Navbar />

      <main className="pt-28">
        <HeroSection />
        <ProblemSection />
        <SolutionSection />
        <ServicesSection />
        <RevenueSystemSection />
        <PracticeSection />
        <PackagesSection />
        <BlueprintFlow />
        <SouthAfricaSection />
        <FaqSection />
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
      description: "Incoming call…\n+27 82 XXX XXXX\n\"Looking for a quote\"",
      status: "Detecting caller",
      accent: "text-sky-300",
    },
    {
      id: 1,
      label: "AI assistant answers",
      description: "AI: \"Hi, how can I help you today?\"\nUser intent detected and categorized",
      status: "Active conversation",
      accent: "text-emerald-300",
    },
    {
      id: 2,
      label: "Lead captured",
      description: "Lead details captured and synced\nName, service type, urgency",
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
                  Illustrative system flow
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.1fr)] items-start">
                <div className="space-y-2 text-[11px]">
                  <div className="flex items-center justify-between text-[10px] text-textMuted/80">
                    <span>Current step</span>
                    <span>{activeStep + 1} / {steps.length}</span>
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
                              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                              className="absolute inset-0 rounded-2xl border border-white/10 bg-black/50 p-3"
                            >
                              <div className="mb-2 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/15 text-[11px] text-sky-100">
                                    {step.id + 1}
                                  </span>
                                  <p className="text-[11px] font-medium text-white">{step.label}</p>
                                </div>
                                <span className={`text-[10px] ${step.accent}`}>{step.status}</span>
                              </div>
                              <p className="text-[11px] text-textMuted whitespace-pre-line">{step.description}</p>
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
                                  <span className="text-[10px] text-emerald-300">Target response</span>
                                </div>
                              </div>
                            </motion.div>
                          )
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="space-y-2 text-[11px]">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-textMuted">System timeline</p>
                  <div className="space-y-1.5">
                    {steps.map((step) => {
                      const isActive = step.id === activeStep;
                      const isCompleted = step.id < activeStep;
                      return (
                        <motion.div
                          key={step.id}
                          initial={false}
                          animate={{ opacity: isCompleted || isActive ? 1 : 0.4 }}
                          transition={{ duration: 0.25 }}
                          className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 ${
                            isActive
                              ? "border-sky-500/60 bg-sky-500/10"
                              : isCompleted
                              ? "border-emerald-500/30 bg-emerald-500/5"
                              : "border-white/5 bg-black/40"
                          }`}
                        >
                          <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${
                            isActive ? "bg-sky-500 text-black" : isCompleted ? "bg-emerald-400 text-black" : "bg-white/5 text-textMuted"
                          }`}>
                            {step.id + 1}
                          </span>
                          <div className="flex-1">
                            <p className="truncate text-[10px] text-white/90">{step.label}</p>
                            <p className="hidden text-[10px] text-textMuted md:block">{step.status}</p>
                          </div>
                          {isActive && (
                            <motion.span
                              className="h-1.5 w-1.5 rounded-full bg-sky-300"
                              animate={{ opacity: [0.4, 1, 0.4] }}
                              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                            />
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[10px] text-textMuted/80">
                    Natural human-like voice. Multilingual. Every call answered — automatically.
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
  const pains = [
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-rose-400" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
        </svg>
      ),
      headline: "Phone rings. No one answers. Lead gone.",
      detail: "That person just called your competitor instead. It happens dozens of times a month.",
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-amber-400" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      headline: "Someone fills your form. You reply 3 days later.",
      detail: "By then they've already moved on. Speed is everything when someone is ready to buy.",
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-sky-400" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
        </svg>
      ),
      headline: "You don't even know how many are falling through.",
      detail: "No visibility means no fix. Most business owners are guessing — and it's costing them.",
    },
  ];

  return (
    <section className="vs-section border-t border-white/5 bg-black/40">
      <div className="vs-container">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="mb-10">
            <p className="vs-section-heading">The hidden problem</p>
            <h2 className="vs-section-title max-w-xl">
              You're losing money right now — and you probably don't know where.
            </h2>
            <p className="mt-3 max-w-lg text-sm text-textMuted">
              It's not because you don't have enough leads. It's because your
              systems have holes in them.
            </p>
          </div>

          {/* Problem photo banner */}
          <motion.div
            className="relative w-full overflow-hidden rounded-2xl border border-rose-500/20 mb-8 aspect-video md:aspect-[24/7] max-h-[220px] md:max-h-[280px]"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <img
              src="/images/problem.png"
              alt="Stressed business owner at desk"
              className="absolute inset-0 h-full w-full object-cover object-[center_30%]"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/40 md:from-black/80 md:via-black/50 md:to-transparent" />
            <div className="relative z-10 flex h-full items-center justify-between px-8 gap-6">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-rose-300/80 mb-2">The reality</p>
                <p className="font-heading text-xl md:text-2xl text-white max-w-sm leading-snug">
                  Most businesses are losing revenue silently, every day.
                </p>
              </div>
              <div className="hidden md:flex flex-col gap-2 flex-shrink-0">
                {[
                  { val: "78%", label: "of visitors leave without doing anything" },
                  { val: "54%", label: "of leads never get a follow-up" },
                  { val: "42%", label: "of calls go unanswered" },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-3 rounded-xl border border-rose-500/20 bg-black/50 backdrop-blur-sm px-3 py-2">
                    <span className="text-sm font-semibold text-rose-300">{s.val}</span>
                    <span className="text-[10px] text-textMuted/80">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          <div className="vs-grid gap-10 items-center">
            {/* Pain points */}
            <div className="space-y-4">
              {pains.map((pain, i) => (
                <motion.div
                  key={pain.headline}
                  className="flex items-start gap-4 rounded-2xl border border-white/8 bg-black/30 p-4"
                  initial={{ opacity: 0, x: -16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: i * 0.1 }}
                >
                  <div className="mt-0.5 flex-shrink-0">{pain.icon}</div>
                  <div>
                    <p className="text-sm font-medium text-white">{pain.headline}</p>
                    <p className="text-xs text-textMuted mt-0.5">{pain.detail}</p>
                  </div>
                </motion.div>
              ))}

              <motion.div
                className="vs-card border border-rose-500/25 bg-rose-500/5 text-xs mt-2"
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
              >
                <p className="text-[10px] uppercase tracking-[0.22em] text-rose-100/80 mb-2">The scary part</p>
                <p className="text-textMuted/90 leading-relaxed">
                  Most of this is invisible. You won't see the money you're losing
                  until you actually fix the system that's leaking it.
                </p>
              </motion.div>
            </div>

            <ProblemVisual />
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
          <div className="mb-10">
            <p className="vs-section-heading">The fix</p>
            <h2 className="vs-section-title max-w-xl">
              We seal the leaks — and build a system that grows your revenue automatically.
            </h2>
            <p className="mt-3 max-w-lg text-sm text-textMuted">
              Think of it like plumbing for your business. Right now, water is
              dripping everywhere. We connect every pipe so nothing is wasted.
            </p>
          </div>

          {/* Solution flow banner */}
          <motion.div
            className="relative w-full overflow-hidden rounded-2xl border border-sky-500/20 mb-8 min-h-[300px] md:aspect-[24/7] md:min-h-0 md:max-h-[320px]"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Premium dark mesh background */}
            <div className="absolute inset-0 bg-[#05070f]" />
            <img
              src="/images/solution.png"
              alt="Automated revenue pipeline"
              className="absolute inset-0 h-full w-full object-cover object-top opacity-40 mix-blend-screen"
            />
            {/* Gradient: lighter at top so the image breathes, darker at bottom to ground the nodes */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#05070f] via-[#05070f]/50 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#05070f]/60 to-transparent" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(56,189,248,0.15),transparent)]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_40%_60%_at_80%_100%,rgba(52,211,153,0.08),transparent)]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_30%_40%_at_10%_80%,rgba(56,189,248,0.06),transparent)]" />
            {/* Fine grid */}
            <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="flow-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(148,163,184,1)" strokeWidth="0.5"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#flow-grid)" />
            </svg>

            {/* Content */}
            <div className="relative z-10 flex flex-col items-center justify-center gap-5 px-4 py-8 md:gap-6 md:px-6 md:py-10 h-full">
              <p className="text-[10px] uppercase tracking-[0.28em] text-sky-400/60 font-medium">The VantageStack answer</p>

              <p className="font-heading text-2xl md:text-4xl text-white text-center max-w-xl leading-tight">
                One connected system.<br />
                <span className="text-sky-400">Every lead. Every close.</span>
              </p>

              {/* Flow nodes — horizontal scroll on mobile, centred row on desktop */}
              <div className="w-full overflow-x-auto scrollbar-none">
                <div className="flex items-center justify-start md:justify-center gap-2 md:gap-3 px-2 md:px-0 pb-1">
                  {[
                    {
                      label: "Website",
                      step: "01",
                      icon: (
                        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth={1.5}>
                          <circle cx="10" cy="10" r="8"/>
                          <path d="M10 2C10 2 7 6 7 10s3 8 3 8M10 2c0 0 3 4 3 8s-3 8-3 8M2 10h16"/>
                        </svg>
                      ),
                      active: false,
                    },
                    {
                      label: "Capture",
                      step: "02",
                      icon: (
                        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14M3 9h10M3 13.5h6"/>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 11l2 2-2 2"/>
                        </svg>
                      ),
                      active: false,
                    },
                    {
                      label: "AI",
                      step: "03",
                      icon: (
                        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth={1.5}>
                          <rect x="3" y="6" width="14" height="10" rx="2"/>
                          <path strokeLinecap="round" d="M7 6V4.5a3 3 0 016 0V6"/>
                          <circle cx="8" cy="11" r="1" fill="currentColor"/>
                          <circle cx="12" cy="11" r="1" fill="currentColor"/>
                        </svg>
                      ),
                      active: true,
                    },
                    {
                      label: "CRM",
                      step: "04",
                      icon: (
                        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 17V7l7-4 7 4v10"/>
                          <rect x="7" y="11" width="6" height="6" rx="0.5"/>
                        </svg>
                      ),
                      active: false,
                    },
                    {
                      label: "Revenue",
                      step: "05",
                      icon: (
                        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 15.5l4-4 3 3 4-5 4 3"/>
                        </svg>
                      ),
                      active: false,
                    },
                  ].map((node, i) => (
                    <div key={node.label} className="flex items-center gap-2 md:gap-3 shrink-0">
                      <motion.div
                        className={`group flex flex-col items-center gap-1.5 rounded-xl border px-3 py-2.5 md:rounded-2xl md:px-5 md:py-3.5 transition-all ${
                          node.active
                            ? "border-sky-400/50 bg-sky-500/10 text-sky-300 shadow-[0_0_24px_rgba(56,189,248,0.15)]"
                            : "border-white/10 bg-white/[0.04] text-white/70 hover:border-white/20 hover:text-white/90"
                        }`}
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.15 + i * 0.1, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <span className="text-[9px] font-mono tracking-widest opacity-50">{node.step}</span>
                        {node.icon}
                        <span className="text-[10px] md:text-[11px] font-medium tracking-wide">{node.label}</span>
                      </motion.div>
                      {i < 4 && (
                        <motion.svg
                          viewBox="0 0 24 24"
                          fill="none"
                          className="h-3 w-3 md:h-4 md:w-4 text-white/20 shrink-0"
                          initial={{ opacity: 0 }}
                          whileInView={{ opacity: 1 }}
                          viewport={{ once: true }}
                          transition={{ delay: 0.3 + i * 0.1 }}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" stroke="currentColor" strokeWidth={1.5} d="M13.5 4.5L19.5 12l-6 7.5M4.5 12h15"/>
                        </motion.svg>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          <div className="vs-grid gap-10 items-center">
            <SolutionVisual />

            {/* Text + CTA */}
            <div className="space-y-6">
              <div className="grid gap-3 text-xs text-textMuted">
                {[
                  { title: "A website that actually gets you clients", body: "Not just a pretty page — a machine that turns visitors into leads." },
                  { title: "Every lead gets captured automatically", body: "Calls, forms, chats — all caught and sorted without you doing anything." },
                  { title: "Follow-up happens without lifting a finger", body: "The system chases leads for you — faster than any human could." },
                ].map((item, i) => (
                  <motion.div
                    key={item.title}
                    className="vs-card vs-card-hover border border-white/10"
                    initial={{ opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.3 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: i * 0.08 }}
                  >
                    <p className="text-[11px] font-medium text-white mb-1">{item.title}</p>
                    <p className="text-textMuted/90 leading-relaxed">{item.body}</p>
                  </motion.div>
                ))}
              </div>
              <motion.a
                href="#blueprint"
                className="vs-button-primary inline-flex w-fit text-xs"
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.24 }}
              >
                Get Your Free Blueprint
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
          <div className="mb-10">
            <p className="vs-section-heading">How it works</p>
            <h2 className="vs-section-title max-w-xl">
              Three steps. No fluff. Real results.
            </h2>
          </div>

          <motion.div
            className="relative w-full overflow-hidden rounded-2xl border border-emerald-500/15 mb-8 aspect-video md:aspect-[24/7] max-h-[220px] md:max-h-[280px]"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <img
              src="/images/services.png"
              alt="Interconnected revenue streams"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/40 md:from-black/80 md:via-black/50 md:to-transparent" />
            <div className="relative z-10 flex h-full items-center justify-between px-8 gap-6">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-300/80 mb-2">The Process</p>
                <p className="font-heading text-xl md:text-2xl text-white max-w-sm leading-snug">
                  A predictable path to scaling your revenue.
                </p>
              </div>
            </div>
          </motion.div>

          <div className="grid gap-6 md:gap-8 md:grid-cols-3 text-sm text-textMuted">
            {[
              {
                label: "Step 1",
                icon: <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 text-sky-400" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0015.803 15.803z"/></svg>,
                title: "We find out exactly where you're losing money",
                body: "We look at your whole business and map out every place a lead could slip through. You get a clear picture — no guessing.",
                outcome: "You'll know what's broken and what to fix first.",
              },
              {
                label: "Step 2",
                icon: <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 text-sky-400" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"/></svg>,
                title: "We build your complete revenue system",
                body: "Website, lead capture, AI, follow-up — all of it designed and installed to work together as one machine.",
                outcome: "Everything connected. Every lead handled. Automatically.",
              },
              {
                label: "Step 3",
                icon: <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 text-sky-400" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941"/></svg>,
                title: "We keep improving it every month",
                body: "We watch the numbers, find what's not working, and keep making the system better so your revenue keeps climbing.",
                outcome: "More sales every month — without more effort from you.",
              },
            ].map((card, index) => (
              <motion.div
                key={card.label}
                className="vs-card vs-card-hover border border-white/10"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.08 * index }}
              >
                <div className="flex items-center gap-2 mb-3">
                  {card.icon}
                  <p className="text-[10px] uppercase tracking-[0.22em] text-textMuted/70">{card.label}</p>
                </div>
                <h3 className="font-heading text-base mb-2 text-textPrimary/95">{card.title}</h3>
                <p className="text-xs leading-relaxed text-textMuted/90">{card.body}</p>
                <p className="text-[11px] text-emerald-300/70 mt-4 pt-3 border-t border-white/5">
                  {card.outcome}
                </p>
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
              Get Your Free Blueprint
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
          <div className="mb-10">
            <p className="vs-section-heading">VantageStack Revenue System™</p>
            <h2 className="vs-section-title max-w-2xl">
              Your business working for you — 24 hours a day, 7 days a week,
              even while you sleep.
            </h2>
          </div>

          {/* Revenue system photo banner */}
          <motion.div
            className="relative w-full overflow-hidden rounded-2xl border border-emerald-500/20 mb-8 aspect-video md:aspect-[24/7] max-h-[220px] md:max-h-[280px]"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <img
              src="/images/revenue.png"
              alt="Growth analytics on laptop"
              className="absolute inset-0 h-full w-full object-cover object-[center_25%]"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/40 md:from-black/80 md:via-black/50 md:to-transparent" />
            <div className="relative z-10 flex h-full items-center justify-between px-8 gap-6">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-300/80 mb-2">Built for you</p>
                <p className="font-heading text-xl md:text-2xl text-white max-w-sm leading-snug">
                  Capture → Qualify → Book → Close. On autopilot.
                </p>
              </div>
              <div className="hidden md:flex flex-col gap-2 flex-shrink-0">
                {[
                  { step: "Capture", color: "border-sky-500/40 bg-black/50 text-sky-200" },
                  { step: "Qualify", color: "border-sky-500/30 bg-black/50 text-sky-300" },
                  { step: "Book", color: "border-emerald-500/40 bg-black/50 text-emerald-200" },
                  { step: "Close", color: "border-emerald-400/50 bg-black/50 text-emerald-200" },
                ].map((s, i) => (
                  <div key={s.step} className="flex items-center gap-2">
                    <span className="text-[10px] text-white/30 w-3">{i + 1}</span>
                    <div className={`rounded-lg border backdrop-blur-sm px-3 py-1 text-[10px] font-medium ${s.color}`}>{s.step}</div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] text-sm text-textMuted">
            <RevenueSystemVisual />

            {/* Right: outcomes */}
            <motion.div
              className="vs-card vs-card-hover border border-white/10 !px-5 !py-5 flex flex-col justify-between hover:shadow-[0_0_45px_rgba(59,130,246,0.12)]"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
            >
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-textMuted/70 mb-4">What changes for you</p>
                <ul className="space-y-3">
                  {[
                    "Leads get a response in under 60 seconds — not 3 days.",
                    "More of your website visitors actually become paying clients.",
                    "You can see every deal and where it's at — in one place.",
                    "Plugs into the tools you already use. No starting over.",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-xs text-textMuted/90">
                      <span className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <span className="h-1 w-1 rounded-full bg-emerald-400" />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Stats visual */}
              <div className="mt-6 pt-5 border-t border-white/5">
                <p className="text-[10px] uppercase tracking-[0.18em] text-textMuted/60 mb-4">System impact</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { metric: "0 missed", label: "High-intent calls" },
                    { metric: "< 60s", label: "Lead response time" },
                    { metric: "100%", label: "Pipeline visibility" },
                    { metric: "24 / 7", label: "AI availability" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl border border-white/8 bg-black/30 px-3 py-2.5 text-center">
                      <p className="text-sm font-semibold text-white">{s.metric}</p>
                      <p className="text-[10px] text-textMuted/70 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-white/5 flex items-center justify-between gap-3">
                <p className="text-xs text-textMuted/80 max-w-xs">
                  Want to see exactly what this looks like for your business?
                </p>
                <a href="#blueprint" className="vs-button-primary text-xs flex-shrink-0">
                  Get Your Free Blueprint
                </a>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function PracticeSection() {
  const cards = [
    {
      label: "No website or system yet",
      title: "We build everything from the ground up.",
      body: "You get a full revenue system — website, lead capture, follow-up — all ready to go from day one. No piecemeal tools. One thing that works.",
      outcome: "Open for business and ready to grow from day one.",
    },
    {
      label: "Getting leads but losing them",
      title: "We find the leaks and fix them.",
      body: "You're already spending money to get leads. We make sure none of them fall through — and turn more of them into paying clients.",
      outcome: "Stop losing the money you're already earning.",
    },
    {
      label: "Ready to grow bigger",
      title: "We add AI so you can do 10x more without hiring 10x more people.",
      body: "We layer automation and AI on top of what's already working — so you can handle way more volume without burning out your team.",
      outcome: "Scale up without the growing pains.",
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
          <div className="mb-10">
            <p className="vs-section-heading">Who is this for?</p>
            <h2 className="vs-section-title max-w-xl">
              Doesn't matter where you're starting — we meet you there.
            </h2>
          </div>

          <motion.div
            className="relative w-full overflow-hidden rounded-2xl border border-white/10 mb-8 aspect-video md:aspect-[24/7] max-h-[220px] md:max-h-[280px]"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <img
              src="/images/sa-business-lady.png"
              alt="Confident South African female business owner"
              className="absolute inset-0 h-full w-full object-cover object-[center_25%]"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/40 md:from-black/80 md:via-black/50 md:to-transparent" />
            <div className="relative z-10 flex h-full items-center justify-between px-8 gap-6">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-sky-300/80 mb-2">The Right Fit</p>
                <p className="font-heading text-xl md:text-2xl text-white max-w-sm leading-snug">
                  Ambitious service-based businesses ready to scale.
                </p>
              </div>
            </div>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-3">
            {cards.map((card, i) => (
              <motion.div
                key={card.label}
                className="vs-card vs-card-hover border border-white/10 flex flex-col"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: i * 0.08 }}
              >
                <p className="text-[10px] uppercase tracking-[0.22em] text-textMuted/60 mb-3">{card.label}</p>
                <h3 className="text-base font-medium text-white mb-2">{card.title}</h3>
                <p className="text-xs text-textMuted/90 leading-relaxed flex-1">{card.body}</p>
                <p className="text-[11px] text-emerald-300/70 mt-4 pt-3 border-t border-white/5">
                  {card.outcome}
                </p>
              </motion.div>
            ))}
          </div>
          <div className="mt-10 flex flex-col items-center text-center gap-3">
            <p className="text-sm text-textMuted max-w-md">
              Not sure which one is you? Complete the Blueprint — we'll figure it out together.
            </p>
            <a href="#blueprint" className="vs-button-primary text-sm">
              Complete Your Free Blueprint
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
          {/* SA photo banner */}
          <motion.div
            className="relative w-full overflow-hidden rounded-2xl border border-sky-500/15 mb-8 aspect-video md:aspect-[24/7] max-h-[220px] md:max-h-[280px]"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <img
              src="/images/sa.png"
              alt="Cape Town South Africa skyline"
              className="absolute inset-0 h-full w-full object-cover object-[center_35%]"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/40 md:from-black/80 md:via-black/50 md:to-transparent" />
            <div className="relative z-10 flex h-full items-center justify-between px-8 gap-6">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-sky-300/80 mb-2">For South Africa</p>
                <p className="font-heading text-xl md:text-2xl text-white max-w-sm leading-snug">
                  We're not an overseas agency guessing what works here.
                </p>
              </div>
              <div className="hidden md:flex flex-col gap-2 flex-shrink-0">
                {[
                  { label: "Bandwidth-aware", icon: <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"/></svg> },
                  { label: "Relationship-driven", icon: <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"/></svg> },
                  { label: "Locally priced", icon: <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> },
                  { label: "SA market-native", icon: <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/></svg> },
                ].map((tag) => (
                  <div key={tag.label} className="flex items-center gap-2 rounded-lg border border-white/12 bg-black/50 backdrop-blur-sm px-3 py-1.5 text-[10px] text-white/70">
                    <span className="text-sky-400/80">{tag.icon}</span>
                    {tag.label}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          <div className="vs-grid gap-10 items-center">
            <div>
              <p className="vs-section-heading">Built for South Africa</p>
              <h2 className="vs-section-title max-w-xl">
                We're not an overseas agency guessing what works here.
              </h2>
              <p className="mt-4 max-w-md text-sm text-textMuted leading-relaxed">
                We know the SA market. We know how South African buyers think, how
                they buy, and what makes them trust you. Everything we build is
                designed with that in mind.
              </p>
              <div className="mt-6 grid gap-3 text-xs">
                {[
                  "Built for how South African buyers actually make decisions.",
                  "Priced and positioned for the South African market.",
                ].map((item) => (
                  <motion.div
                    key={item}
                    className="vs-card vs-card-hover border border-white/10 text-textMuted/90"
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {item}
                  </motion.div>
                ))}
              </div>
            </div>

            <SouthAfricaVisual />
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
          <p className="text-xs uppercase tracking-[0.2em] text-textMuted mb-3">Your next move</p>
          <h2 className="font-heading text-2xl md:text-3xl mb-3">
            Ready to stop losing money and start growing?
          </h2>
          <p className="mx-auto mb-2 max-w-md text-sm text-textMuted">
            Complete your free Growth Optimization Blueprint. We'll look at your
            business, find exactly where you're losing revenue, and show you the
            fastest way to fix it.
          </p>
          <p className="mx-auto mb-6 max-w-sm text-xs text-textMuted/60">
            Takes less than 5 minutes. Free. No obligation.
          </p>
          <a href="#blueprint" className="vs-button-primary text-sm">
            Complete Your Free Blueprint Now
          </a>
        </motion.div>
      </div>
    </section>
  );
}

function FaqSection() {
  const [open, setOpen] = useState<number | null>(null);

  const faqs = [
    {
      q: "Will a new website actually bring me more customers, or is it just a pretty online brochure?",
      a: "A VantageStack site is built to convert visitors into paying customers — not just look good. We add lead capture, clear call-to-action buttons, and automated follow-up so every visitor has a reason to contact you. Businesses that fix a leaking website typically see 2–4x more enquiries within 90 days.",
    },
    {
      q: "What exactly is a 'revenue system' and why do I need more than just a website?",
      a: "A website without follow-up is like a shop with no staff — people walk in and leave. A revenue system connects your website to a CRM that logs every lead, an AI that answers calls, and automated messages that follow up for you. Together, they turn strangers into booked clients — even while you sleep.",
    },
    {
      q: "How much does this cost? Can a small South African business actually afford it?",
      a: "VantageStack is built for SMBs — not corporates. The monthly fee covers an entire team: we build, maintain, automate, and optimise your system continuously. No setup fees. No surprise invoices. Most clients recover the full monthly cost within 60–90 days from just a handful of extra jobs that would have otherwise slipped through. Think of it as hiring a salesperson, a developer, and a marketer — for a fraction of what one salary would cost.",
    },
    {
      q: "What is an AI call assistant — and will it sound robotic to my customers?",
      a: "Not even slightly. Our AI assistants speak in a natural, warm, human-like voice — not the stiff robot voice you're imagining. They hold real conversations, handle objections, and even detect tone. They speak multiple languages including English, Afrikaans, Zulu, and more — so your callers always feel at home. The assistant can act as a receptionist (answering and routing calls), an inbound handler (qualifying leads instantly), or an outbound caller (following up, confirming appointments, even cold calling your list). It transfers to a human the moment it needs to. Your customers won't know the difference — and every call gets answered, even during loadshedding.",
    },
    {
      q: "How long before I see real results — not just promises?",
      a: "Quick wins like faster lead response and zero missed calls happen in the first 30 days. Most clients see a measurable increase in booked appointments within 60–90 days. Full revenue impact builds over 3–6 months as the system learns and optimises.",
    },
    {
      q: "Do I own everything, or am I locked into VantageStack forever?",
      a: "You own your website, your domain, and all your customer data. We never hold your business hostage. If you ever leave, we hand everything over cleanly. We earn your loyalty by delivering results every month — not by trapping you in a contract.",
    },
    {
      q: "I'm not technical at all — will I be able to manage this?",
      a: "You don't need to touch the technical side. VantageStack sets everything up and manages it for you. When a lead comes in, you get a simple notification. You just respond and close the deal. We handle the technology so you can focus on running your business.",
    },
    {
      q: "What makes VantageStack different from every other web agency in South Africa?",
      a: "Most agencies hand you a website and disappear. VantageStack builds your entire revenue engine — website, CRM, AI call agents, automated follow-up, and workflow automations that run your business in the background. Think AI agents handling reception, qualifying inbound leads, running outbound call campaigns, booking appointments, chasing unpaid invoices, sending onboarding messages, and routing the right calls to the right people. Any repetitive admin task a human does manually — we automate it. We measure success in rand generated, not page views. And if your system isn't producing results, we fix it.",
    },
  ];

  return (
    <section className="vs-section border-t border-white/5 bg-black/50">
      <div className="vs-container">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="mb-10 text-center">
            <p className="vs-section-heading">Got questions?</p>
            <h2 className="vs-section-title max-w-xl mx-auto">
              Everything you want to know — answered straight.
            </h2>
          </div>

          <div className="max-w-3xl mx-auto space-y-2">
            {faqs.map((faq, i) => (
              <motion.div
                key={i}
                className="rounded-2xl border border-white/8 bg-black/30 overflow-hidden"
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: i * 0.04 }}
              >
                <button
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium text-white hover:text-textPrimary transition"
                  onClick={() => setOpen(open === i ? null : i)}
                >
                  <span>{faq.q}</span>
                  <motion.span
                    animate={{ rotate: open === i ? 45 : 0 }}
                    transition={{ duration: 0.25 }}
                    className="flex-shrink-0 h-5 w-5 rounded-full border border-white/20 flex items-center justify-center text-textMuted text-xs"
                  >
                    +
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {open === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="px-5 pb-5 text-sm text-textMuted/90 leading-relaxed border-t border-white/5 pt-3">
                        {faq.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <p className="text-sm text-textMuted mb-4">Still have questions? The Blueprint will answer them all.</p>
            <a href="#blueprint" className="vs-button-primary text-sm">
              Complete Your Free Blueprint
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function PackagesSection() {
  const packages = [
    {
      name: "The Foundation",
      price: "R2,500",
      priceDetail: "/month",
      description: "Your digital foundation, actively maintained. We build it, host it, secure it, and keep it generating leads — every month, included.",
      features: [
        "Conversion-ready website (part of your always-on system)",
        "Mobile-first, conversion-optimized design",
        "Lead Capture Forms (Direct to Email/WhatsApp)",
        "Basic SEO Setup",
        "Lightning Fast Hosting, Security & Daily Backups",
      ],
      buttonText: "Get Your Blueprint",
    },
    {
      name: "The Growth System",
      price: "R4,800",
      priceDetail: "/month",
      popular: true,
      description: "Your always-on sales system. We capture every lead, follow up in minutes, and track every opportunity — so no deal slips through while you&apos;re on the job.",
      features: [
        "Everything in The Foundation",
        "Google My Business Setup",
        "Automated WhatsApp Follow-Up (Within 5 minutes)",
        "Basic CRM Pipeline (Track every lead)",
        "Calendar Integration (Clients book themselves)",
        "Quarterly Performance Review",
      ],
      buttonText: "Get Your Blueprint",
    },
    {
      name: "The Revenue System™",
      price: "R8,500",
      priceDetail: "/month",
      description: "Your AI-powered revenue engine, running 24/7. For businesses ready to replace manual follow-up, missed calls, and guesswork with a system that earns its fee every week.",
      features: [
        "Everything in The Growth System",
        "Advanced SEO & Local Search Ranking",
        "Custom AI Assistant (Website & WhatsApp)",
        "AI Call Handling (Never miss a call)",
        "Automated Nurture Sequences (Email/SMS)",
        "Advanced Analytics & ROI Tracking",
        "Monthly Strategic Consulting",
      ],
      buttonText: "Get Your Blueprint",
    },
  ];

  return (
    <section id="pricing" className="vs-section border-t border-white/5 bg-black">
      <div className="vs-container">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.1 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="mb-14 text-center">
            <p className="vs-section-heading">The Value Ladder</p>
            <h2 className="vs-section-title mx-auto max-w-2xl text-center">
              One monthly fee. A full team working for your business.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-sm text-textMuted">
              You&apos;re not paying for a website — you&apos;re retaining a system that builds, manages, and grows your revenue every month. No setup fees. No surprise invoices.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3 lg:gap-8">
            {packages.map((pkg, i) => (
              <motion.div
                key={pkg.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ duration: 0.5, delay: i * 0.15 }}
                className={`relative flex flex-col rounded-3xl border ${
                  pkg.popular ? "border-sky-500/50 bg-sky-950/20" : "border-white/10 bg-white/[0.02]"
                } p-6 sm:p-8`}
              >
                {pkg.popular && (
                  <div className="absolute -top-4 left-0 right-0 flex justify-center">
                    <div className="rounded-full bg-sky-500 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-black">
                      Most Popular
                    </div>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="font-heading text-xl text-white">{pkg.name}</h3>
                  <div className="mt-4 flex items-baseline text-white">
                    <span className="text-sm font-semibold text-textMuted mr-1">From</span>
                    <span className="text-3xl font-bold tracking-tight">{pkg.price}</span>
                    <span className="ml-1 text-sm font-medium text-textMuted">{pkg.priceDetail}</span>
                  </div>
                  <p className="mt-4 text-sm text-textMuted">{pkg.description}</p>
                </div>

                <ul className="mb-8 flex-1 space-y-4">
                  {pkg.features.map((feature) => (
                    <li key={feature} className="flex items-start">
                      <Check className={`mr-3 h-5 w-5 shrink-0 ${pkg.popular ? "text-sky-400" : "text-emerald-400"}`} />
                      <span className="text-sm text-textMuted/90">{feature}</span>
                    </li>
                  ))}
                </ul>

                <a
                  href="#blueprint"
                  className={`mt-auto block w-full rounded-xl px-4 py-3 text-center text-sm font-semibold transition-all ${
                    pkg.popular
                      ? "bg-sky-500 text-black hover:bg-sky-400"
                      : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                >
                  {pkg.buttonText}
                </a>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
