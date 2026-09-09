"use client";

import { motion } from "framer-motion";
import Link from "next/link";

const insightSignals = [
  {
    id: "missed-calls",
    title: "Revenue leaking through missed calls",
    body: "High-intent leads are lost when calls and messages go unanswered.",
  },
  {
    id: "low-conversions",
    title: "Website not converting demand into pipeline",
    body: "Traffic without a capture-and-follow-up system rarely turns into booked clients.",
  },
  {
    id: "manual-followup",
    title: "Manual processes slowing compounding revenue",
    body: "Repetitive touchpoints across your funnel are prime candidates for automation.",
  },
];

export function BlueprintFlow() {
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
              In a short diagnostic, we map your current systems, highlight revenue leaks, and outline the exact
              optimizations that turn your business into a predictable revenue engine.
            </p>
          </div>
          <div className="flex gap-3 text-xs text-textMuted">
            <div className="vs-badge">South African businesses</div>
            <div className="vs-badge">Done-with-you strategy</div>
          </div>
        </div>

        <div className="grid gap-8 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="vs-card flex flex-col justify-center gap-6 border border-white/10"
          >
            <div>
              <p className="vs-section-heading">2-minute guided diagnostic</p>
              <h3 className="font-heading text-2xl md:text-3xl">
                Build your blueprint with <span className="text-accent">Isabel</span>.
              </h3>
              <p className="mt-3 max-w-md text-sm text-textMuted">
                Our AI strategist walks you through it — by voice or tap — and highlights exactly where your business is
                leaking revenue, with a tailored plan to fix it. No forms to wrestle with.
              </p>
            </div>
            <ul className="space-y-2.5 text-sm text-textMuted/90">
              {[
                "Maps your leaks across leads, presence and admin",
                "Benchmarks you against your industry & sub-niche",
                "Sent straight to your WhatsApp — about 2 minutes",
              ].map((point) => (
                <li key={point} className="flex items-start gap-2.5">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/blueprint"
              className="group inline-flex w-fit items-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition-all hover:opacity-90"
            >
              Start my blueprint
              <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </motion.div>

          <motion.aside
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="vs-card vs-card-hover border border-white/10"
          >
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-textMuted/70 mb-3">Live insight preview</p>
              <h3 className="font-heading text-lg mb-3">What your blueprint will highlight</h3>
            </div>
            <div className="mt-2 space-y-3 text-xs leading-relaxed text-textMuted/90">
              {insightSignals.map((insight) => (
                <div key={insight.id} className="rounded-xl border border-white/5 bg-black/40 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-textMuted/70 mb-2">SIGNAL</p>
                  <p className="text-textPrimary/90 text-[13px] font-medium mb-1">{insight.title}</p>
                  <p className="text-[11px] leading-relaxed text-textMuted/90 max-w-xs">{insight.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-3 text-[11px] leading-relaxed text-amber-100/90 max-w-sm">
              Most businesses do not have a traffic problem. They have a system problem. The blueprint focuses on systems
              that compound revenue, not short-term gimmicks.
            </div>
          </motion.aside>
        </div>
      </div>
    </section>
  );
}
