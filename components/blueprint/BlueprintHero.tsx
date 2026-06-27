"use client";

// Value-first arrival (stage 0 of the world-class plan). The first thing a
// visitor sees: the outcome, the time cost, the trust signals, the human
// backstop (Jono & KG) — THEN one clear way in. Sits above the guided deck.

import { useState } from "react";

const TRUST = ["Free", "No obligation", "POPIA-safe"];

export function BlueprintHero() {
  const [imgOk, setImgOk] = useState({ jono: true, kg: true });

  const start = () => {
    // Hand off to IsabelWidget to begin the guided voice session…
    window.dispatchEvent(new CustomEvent("blueprint:start-voice"));
    // …and bring the deck into view so she has something to drive.
    document.getElementById("blueprint-deck")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const toForm = () =>
    document.getElementById("blueprint-deck")?.scrollIntoView({ behavior: "smooth", block: "start" });

  const Face = ({ who, src, label }: { who: "jono" | "kg"; src: string; label: string }) =>
    imgOk[who] ? (
      <img
        src={src}
        alt={label}
        className="h-10 w-10 rounded-full object-cover ring-2 ring-[#0b0b0c]"
        onError={() => setImgOk((s) => ({ ...s, [who]: false }))}
      />
    ) : (
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent ring-2 ring-[#0b0b0c]">
        {label.split(" ").map((w) => w[0]).join("").slice(0, 2)}
      </span>
    );

  return (
    <section className="mx-auto max-w-2xl text-center">
      <p className="vs-section-heading">Your free growth blueprint</p>
      <h1 className="font-heading text-3xl leading-tight md:text-5xl">
        Find exactly where your business is <span className="text-accent">leaking revenue</span>.
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-sm text-textMuted md:text-base">
        Isabel walks you through it — about 2 minutes, by voice or tap — and your tailored plan lands on your
        WhatsApp within 1 business day.
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {TRUST.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-textMuted"
          >
            <svg className="h-3 w-3 text-accent" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {t}
          </span>
        ))}
      </div>

      {/* Human backstop — the trust combination that earns a SA owner's WhatsApp. */}
      <div className="mt-6 inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
        <div className="flex -space-x-3">
          <Face who="jono" src="/images/jono.jpg" label="Jono" />
          <Face who="kg" src="/images/kg.jpg" label="Motso" />
        </div>
        <p className="text-left text-xs leading-snug text-textMuted">
          A real human — <span className="text-textPrimary">Jono &amp; Motso</span>, the VantageStack founders —
          <br className="hidden sm:block" /> personally reviews every blueprint.
        </p>
      </div>

      <div className="mt-7 flex flex-col items-center gap-3">
        <button
          onClick={start}
          className="group inline-flex items-center gap-2 rounded-xl bg-accent px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition-all hover:opacity-90 md:text-base"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          Start with Isabel — she&apos;ll guide you
        </button>
        <button onClick={toForm} className="text-xs text-textMuted underline-offset-2 transition hover:text-textPrimary hover:underline">
          or fill it in yourself
        </button>
      </div>
    </section>
  );
}
