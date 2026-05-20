"use client";

import { motion } from "framer-motion";
import { UnifiedBlueprintForm } from "./UnifiedBlueprintForm";

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
          <UnifiedBlueprintForm mode="quick" />

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
