"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Slide 01 — Cover ──────────────────────────────────────────────────────────

function Slide01Cover() {
  return (
    <div className="relative w-full max-w-4xl mx-auto text-center space-y-6">
      <svg className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-[0.04]">
        <defs>
          <pattern id="cover-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#cover-grid)" />
      </svg>

      <div className="flex justify-center mb-2">
        <img src="/images/vs-logo-premium.png" alt="VantageStack" className="h-7 opacity-80" />
      </div>

      <p className="text-[11px] uppercase tracking-[0.35em] text-sky-400/70">
        Real Estate Revenue System
      </p>

      <h1 className="font-heading text-5xl md:text-6xl font-medium leading-[1.05]">
        Your brand.
        <br />
        Your system.
        <br />
        <span className="text-sky-400">Your unfair advantage.</span>
      </h1>

      <p className="text-textMuted text-base max-w-lg mx-auto">
        A complete revenue system for{" "}
        <span className="text-white font-medium">[AGENCY NAME]</span>,<br />
        built by VantageStack.
      </p>

      <div className="pt-4 flex justify-center">
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-6 py-2.5 text-xs text-textMuted/50">
          Your identity — revealed inside ↓
        </div>
      </div>
    </div>
  );
}

// ─── Slide 02 — Hook ───────────────────────────────────────────────────────────

function Slide02Hook() {
  return (
    <div className="w-full max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
      <div className="space-y-5">
        <p className="text-[11px] uppercase tracking-[0.25em] text-rose-400/70">The hook</p>
        <h2 className="font-heading text-3xl md:text-4xl font-medium leading-snug">
          It's 7:42pm. A buyer just called about your{" "}
          <span className="text-white">R4.2m listing.</span>
        </h2>
        <p className="text-textMuted text-sm leading-relaxed">
          You're at a showing. It goes to voicemail. By 7:50pm they've called
          the next agent on Property24.
        </p>
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 px-5 py-4 space-y-1">
          <p className="text-rose-300 text-sm font-medium">
            That commission just walked out the door.
          </p>
          <p className="text-textMuted/60 text-xs">
            ~R252,000. Gone. You'll never know you lost it.
          </p>
        </div>
        <p className="text-textMuted/50 text-xs italic">
          "How many times a month does that happen — and you never even know?"
        </p>
      </div>

      <div className="flex justify-center">
        <div className="w-52 rounded-[2.5rem] border border-white/10 bg-black p-3 shadow-[0_0_50px_rgba(239,68,68,0.08)]">
          <div className="rounded-[2rem] bg-[#0b0b0c] p-4 space-y-3">
            <div className="flex items-center justify-between text-[10px] text-textMuted/40">
              <span>7:42 PM</span>
              <span>Sat 14 Jun</span>
            </div>
            <div className="rounded-xl bg-rose-950/60 border border-rose-500/20 p-3 text-center space-y-1">
              <p className="text-[10px] text-rose-300/60 uppercase tracking-wide">
                Missed call
              </p>
              <p className="text-white font-medium text-sm">+27 82 ••• ••••</p>
              <p className="text-[10px] text-textMuted/40">2 min ago</p>
            </div>
            <div className="text-center space-y-0.5">
              <p className="text-rose-400/50 text-xs line-through">R 252,000</p>
              <p className="text-[10px] text-textMuted/30">commission opportunity</p>
            </div>
            <div className="rounded-lg bg-white/[0.03] border border-white/5 p-2 text-[10px] text-textMuted/30 text-center">
              Caller moved to competitor →
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Slide 03 — The Leaks ──────────────────────────────────────────────────────

function Slide03Leaks() {
  const stats = [
    { val: "42%", label: "of calls go unanswered" },
    { val: "54%", label: "of leads never get a follow-up" },
    { val: "78%", label: "of website visitors leave without doing anything" },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto space-y-7">
      <div className="text-center space-y-3">
        <p className="text-[11px] uppercase tracking-[0.25em] text-rose-400/70">The reality</p>
        <h2 className="font-heading text-3xl md:text-4xl font-medium">
          You're losing deals right now —
          <br />
          <span className="text-textMuted/70">and you can't see where.</span>
        </h2>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5 text-center space-y-2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="font-heading text-5xl font-bold text-rose-300">{s.val}</p>
            <p className="text-xs text-textMuted/70 leading-relaxed">{s.label}</p>
          </motion.div>
        ))}
      </div>

      <motion.div
        className="rounded-2xl border border-white/8 bg-black/30 p-4 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <p className="text-xs text-textMuted/50 mb-1">
          * Based on industry research across service-based businesses.
        </p>
        <p className="text-sm text-textMuted/80">
          In real estate the cost per leak isn't a R500 job — it's a{" "}
          <span className="text-white font-medium">six-figure commission.</span>
        </p>
      </motion.div>
    </div>
  );
}

// ─── Slide 04 — The Scary Part ─────────────────────────────────────────────────

function Slide04ScaryPart() {
  return (
    <div className="w-full max-w-3xl mx-auto text-center space-y-8">
      <div className="space-y-3">
        <p className="text-[11px] uppercase tracking-[0.25em] text-amber-400/70">The scary part</p>
        <h2 className="font-heading text-3xl md:text-4xl font-medium">
          The most expensive leaks are the ones
          <br />
          <span className="text-rose-400">you never see.</span>
        </h2>
      </div>

      <motion.div
        className="rounded-3xl border border-rose-500/20 bg-rose-500/5 p-10 space-y-4"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.15, duration: 0.55 }}
      >
        <p className="text-textMuted/50 text-[11px] uppercase tracking-[0.2em]">
          Estimated commissions slipping away — every month
        </p>
        <p className="font-heading text-6xl md:text-7xl font-bold text-white leading-tight">
          1–2 deals
          <br />
          <span className="text-rose-300">per month</span>
        </p>
        <p className="text-textMuted/70 text-sm max-w-xs mx-auto">
          At ~R210,000 per deal, that's{" "}
          <span className="text-white font-semibold">up to R420,000/month</span>{" "}
          walking out the door.
        </p>
      </motion.div>

      <p className="text-textMuted/40 text-xs italic">
        "Do the maths out loud — with her average sale price."
      </p>
    </div>
  );
}

// ─── Slide 05 — The Fix ────────────────────────────────────────────────────────

function Slide05Fix() {
  const nodes = ["Website", "Capture", "AI", "CRM", "Closed Deal"];

  return (
    <div className="w-full max-w-4xl mx-auto space-y-7">
      <div className="space-y-3">
        <p className="text-[11px] uppercase tracking-[0.25em] text-sky-400/70">The fix</p>
        <h2 className="font-heading text-3xl md:text-4xl font-medium max-w-2xl">
          We seal the leaks — and build a system that{" "}
          <span className="text-sky-400">grows your sales automatically.</span>
        </h2>
        <p className="text-textMuted text-sm max-w-xl">
          Think of it like plumbing for your business. Right now deals are
          dripping everywhere. We connect every pipe so nothing is wasted.
        </p>
      </div>

      <div className="rounded-2xl border border-sky-500/20 bg-[#05070f] p-6">
        <div className="flex items-stretch gap-2">
          {nodes.map((node, i) => (
            <div key={node} className="flex items-center gap-2 flex-1">
              <motion.div
                className={`flex-1 rounded-xl border px-3 py-4 text-center ${
                  i === 4
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : i === 2
                    ? "border-sky-500/50 bg-sky-500/10 text-sky-300 shadow-[0_0_20px_rgba(56,189,248,0.1)]"
                    : "border-white/10 bg-white/[0.03] text-white/70"
                }`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1, duration: 0.4 }}
              >
                <p className="text-[9px] font-mono tracking-widest text-textMuted/30 mb-1.5">
                  0{i + 1}
                </p>
                <p className="text-[11px] font-medium">{node}</p>
              </motion.div>
              {i < nodes.length - 1 && (
                <motion.svg
                  viewBox="0 0 16 16"
                  className="h-3 w-3 text-white/15 flex-shrink-0"
                  fill="none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 + i * 0.1 }}
                >
                  <path
                    d="M3 8h10M9 3l4 5-4 5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </motion.svg>
              )}
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-[10px] text-textMuted/40">
          Every step connected. Every lead handled. Nothing wasted.
        </p>
      </div>
    </div>
  );
}

// ─── Slide 06 — One System ─────────────────────────────────────────────────────

function Slide06OneSystem() {
  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <div className="text-center space-y-3">
        <p className="text-[11px] uppercase tracking-[0.25em] text-sky-400/70">The overview</p>
        <h2 className="font-heading text-3xl md:text-4xl font-medium">
          One system. Every lead.{" "}
          <span className="text-sky-400">Every close.</span>
        </h2>
      </div>

      <div className="rounded-2xl border border-sky-500/20 bg-[#05070f] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-[10px] text-emerald-300/80 uppercase tracking-wider">
              All systems live
            </span>
          </div>
          <span className="text-[10px] text-textMuted/30">Live — illustrative</span>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {[
            { metric: "0", label: "Missed calls today", accent: "emerald" },
            { metric: "12", label: "Leads captured", accent: "sky" },
            { metric: "< 60s", label: "Follow-up sent", accent: "sky" },
            { metric: "R18.6m", label: "Active pipeline", accent: "emerald" },
          ].map((s) => (
            <div
              key={s.label}
              className={`rounded-xl border bg-black/40 px-3 py-3 text-center ${
                s.accent === "emerald"
                  ? "border-emerald-500/20"
                  : "border-sky-500/20"
              }`}
            >
              <p
                className={`font-heading text-xl font-semibold ${
                  s.accent === "emerald" ? "text-emerald-300" : "text-sky-300"
                }`}
              >
                {s.metric}
              </p>
              <p className="text-[9px] text-textMuted/50 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-5 gap-2">
          {[
            "Website",
            "Lead capture",
            "AI call + WhatsApp",
            "CRM",
            "Auto follow-up",
          ].map((item) => (
            <div
              key={item}
              className="rounded-lg border border-white/5 bg-white/[0.02] px-2 py-1.5 text-center text-[10px] text-textMuted/50"
            >
              {item} ✓
            </div>
          ))}
        </div>
      </div>

      <p className="text-center text-xs text-textMuted/40 italic">
        "Everything you'll see next plugs into this one system. No loose tools."
      </p>
    </div>
  );
}

// ─── Slide 07 — Live Demo ──────────────────────────────────────────────────────

function Slide07LiveDemo() {
  return (
    <div className="w-full max-w-2xl mx-auto text-center space-y-8">
      <div className="space-y-3">
        <p className="text-[11px] uppercase tracking-[0.25em] text-sky-400/70">Live demo</p>
        <h2 className="font-heading text-4xl md:text-5xl font-medium">
          Meet your future receptionist.
          <br />
          <span className="text-sky-400">She never sleeps.</span>
        </h2>
      </div>

      <motion.div
        className="rounded-3xl border border-sky-500/20 bg-sky-500/5 p-10 space-y-5"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-8 w-8 text-sky-400"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
              />
            </svg>
          </div>
        </div>
        <p className="font-heading text-2xl text-white">▶ Live demo</p>
        <div className="space-y-1">
          <p className="text-textMuted text-sm">
            Open{" "}
            <span className="text-white font-medium">vantagestack.co.za</span> —
            talk to <strong className="text-sky-300">Isabel</strong>.
          </p>
          <p className="text-textMuted/50 text-xs">
            This is the exact tech that will answer your calls and WhatsApps,
            in your brand, 24/7.
          </p>
        </div>
      </motion.div>

      <p className="text-textMuted/30 text-xs">
        Press → to continue after the demo
      </p>
    </div>
  );
}

// ─── Slide 08 — AI in Detail ───────────────────────────────────────────────────

function Slide08AIDetail() {
  const steps = [
    {
      n: "01",
      title: "Answers 24/7",
      detail: "Natural human voice, multilingual — English, Afrikaans & more",
      accent: "sky",
    },
    {
      n: "02",
      title: "Qualifies the lead",
      detail: "Budget, area, buy or sell, timeline — captured instantly",
      accent: "sky",
    },
    {
      n: "03",
      title: "Lead logged",
      detail: "Profile created in your CRM automatically — zero admin",
      accent: "emerald",
    },
    {
      n: "04",
      title: "Viewing booked",
      detail: "Straight into your calendar. Client gets confirmation.",
      accent: "emerald",
    },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <div className="space-y-3">
        <p className="text-[11px] uppercase tracking-[0.25em] text-sky-400/70">
          Your AI
        </p>
        <h2 className="font-heading text-3xl md:text-4xl font-medium">
          Every call answered. Every enquiry qualified.{" "}
          <span className="text-sky-400">Every viewing booked.</span>
        </h2>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {steps.map((s, i) => (
          <motion.div
            key={s.title}
            className={`rounded-2xl border p-4 space-y-2 ${
              s.accent === "emerald"
                ? "border-emerald-500/25 bg-emerald-500/5"
                : "border-sky-500/25 bg-sky-500/5"
            }`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.45 }}
          >
            <p
              className={`text-[10px] font-mono tracking-widest ${
                s.accent === "emerald"
                  ? "text-emerald-400/50"
                  : "text-sky-400/50"
              }`}
            >
              {s.n}
            </p>
            <p className="text-sm font-medium text-white">{s.title}</p>
            <p className="text-[11px] text-textMuted/70 leading-relaxed">
              {s.detail}
            </p>
          </motion.div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/8 bg-black/30 p-4">
        <p className="text-center text-xs text-textMuted/60">
          "While you're in a showing, it's handling the next three buyers."
        </p>
        <div className="mt-3 flex justify-center gap-6 text-[11px] text-textMuted/50">
          <span>✓ Target latency &lt;3s to answer</span>
          <span>✓ Lead profile created instantly</span>
          <span>✓ Zero missed calls when configured</span>
        </div>
      </div>
    </div>
  );
}

// ─── Slide 09 — WhatsApp Command Centre ────────────────────────────────────────

function Slide09WhatsApp() {
  const commands = [
    {
      you: '"Send the invoice for 14 Oak Avenue"',
      bot: "Done ✓  Invoice sent to buyer@email.com",
    },
    {
      you: '"Who are my hot leads this week?"',
      bot: "🔥 3 hot leads:\n1. Sarah M. — R4.2m, Silver Lakes\n2. James P. — R2.8m, Waterkloof\n3. Michelle K. — R1.9m, Garsfontein",
    },
    {
      you: '"Book Silver Lakes Saturday 10am"',
      bot: "Done ✓  Viewing booked. Client notified.",
    },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
      <div className="space-y-5">
        <p className="text-[11px] uppercase tracking-[0.25em] text-emerald-400/70">
          Your differentiator
        </p>
        <h2 className="font-heading text-3xl md:text-4xl font-medium">
          Run your entire business from{" "}
          <span className="text-emerald-400">WhatsApp.</span>
        </h2>
        <p className="text-textMuted text-sm leading-relaxed">
          Your clients already live on WhatsApp. So will your business. Buyers
          get instant answers. You command the system like a personal assistant.
        </p>
        <div className="space-y-2">
          {commands.map((c) => (
            <div
              key={c.you}
              className="rounded-xl border border-white/8 bg-black/30 px-4 py-2.5 space-y-1"
            >
              <p className="text-[11px] text-emerald-300/80">You: {c.you}</p>
              <p className="text-[11px] text-textMuted/55 whitespace-pre-line">
                System: {c.bot}
              </p>
            </div>
          ))}
        </div>
        <p className="text-xs text-textMuted/40 italic">
          Your CRM, invoices, and pipeline — in the app in your pocket. No
          logging into anything.
        </p>
      </div>

      <div className="flex justify-center">
        <div className="w-60 rounded-[1.5rem] border border-emerald-500/20 bg-[#0b1a10] overflow-hidden shadow-[0_0_40px_rgba(16,185,129,0.08)]">
          <div className="bg-[#075e54] px-4 py-3 flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-emerald-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              AG
            </div>
            <div>
              <p className="text-white text-xs font-medium">Agency Assistant</p>
              <p className="text-emerald-200/50 text-[10px]">online</p>
            </div>
          </div>
          <div className="p-3 space-y-2 bg-[#0d1f12]">
            {[
              { from: "you", msg: "Who are my hot leads?" },
              {
                from: "bot",
                msg: "🔥 3 hot leads:\n1. Sarah M. — R4.2m\n2. James P. — R2.8m\n3. Michelle K. — R1.9m",
              },
              { from: "you", msg: "Send Sarah the spec sheet" },
              { from: "bot", msg: "Done ✓  Sent to sarah@email.com" },
            ].map((m, i) => (
              <div
                key={i}
                className={`max-w-[88%] rounded-xl px-3 py-2 text-[10px] leading-relaxed whitespace-pre-line ${
                  m.from === "you"
                    ? "ml-auto bg-[#dcf8c6] text-[#1a1a1a]"
                    : "bg-white/10 text-white/80"
                }`}
              >
                {m.msg}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Slide 10 — How We Build It ────────────────────────────────────────────────

function Slide10HowWeBuild() {
  const steps = [
    {
      n: "1",
      title: "We find your leaks",
      body: "Map every place a deal can slip through. You get a clear picture — no guessing.",
      outcome: "You'll know exactly what's broken and what to fix first.",
    },
    {
      n: "2",
      title: "We build your complete system",
      body: "Brand, website, AI, CRM, follow-up. Installed to work together as one machine.",
      outcome: "Everything connected. Every lead handled. Automatically.",
    },
    {
      n: "3",
      title: "We improve it every month",
      body: "Watch the numbers, refine, repeat. We run it — you focus on selling houses.",
      outcome: "Better results over time, without adding to your workload.",
    },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto space-y-7">
      <div className="text-center space-y-3">
        <p className="text-[11px] uppercase tracking-[0.25em] text-sky-400/70">
          The process
        </p>
        <h2 className="font-heading text-3xl md:text-4xl font-medium">
          Three steps. No fluff.{" "}
          <span className="text-sky-400">Real results.</span>
        </h2>
        <p className="text-textMuted text-sm">
          You're not technical, and you don't need to be. We run it; you sell
          houses.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {steps.map((s, i) => (
          <motion.div
            key={s.title}
            className="rounded-2xl border border-white/10 bg-black/30 p-5 space-y-3 flex flex-col"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.12, duration: 0.45 }}
          >
            <div className="h-8 w-8 rounded-full bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sm font-semibold text-sky-300">
              {s.n}
            </div>
            <h3 className="text-base font-medium text-white">{s.title}</h3>
            <p className="text-xs text-textMuted/80 leading-relaxed flex-1">
              {s.body}
            </p>
            <p className="text-[11px] text-emerald-300/70 pt-3 border-t border-white/5">
              {s.outcome}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Slide 11 — Brand Reveal ───────────────────────────────────────────────────

function Slide11BrandReveal() {
  const directions = [
    {
      name: "Meridian Property Group",
      palette: ["#F5F0E8", "#2A2A2A", "#5C6B4A"],
      swatchNames: ["Bone", "Ink", "Muted Olive"],
      vibe: "Aspirational · Premium · Neutral",
    },
    {
      name: "Crest & Co.",
      palette: ["#FAF8F5", "#2D1B1B", "#8B6B3D"],
      swatchNames: ["Warm White", "Oxblood", "Brass"],
      vibe: "Boutique · High-end · Contemporary",
    },
    {
      name: "Aria Properties",
      palette: ["#F8F4EC", "#2A2A2A", "#7A6040"],
      swatchNames: ["Soft Sand", "Charcoal", "Bronze"],
      vibe: "Elegant · Light · Modern",
    },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <div className="text-center space-y-3">
        <p className="text-[11px] uppercase tracking-[0.25em] text-amber-400/70">
          Brand reveal
        </p>
        <h2 className="font-heading text-3xl md:text-4xl font-medium">
          You don't have a name, a logo, or a look yet.
          <br />
          <span className="text-amber-400">Good. We'll build you one that sells.</span>
        </h2>
        <p className="text-textMuted text-sm">
          Your competitors all look the same on Property24. Yours won't.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {directions.map((d, i) => (
          <motion.div
            key={d.name}
            className="rounded-2xl border border-white/10 overflow-hidden"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.15, duration: 0.45 }}
          >
            <div className="flex h-14">
              {d.palette.map((c) => (
                <div key={c} className="flex-1" style={{ backgroundColor: c }} />
              ))}
            </div>
            <div className="bg-black/60 p-4 space-y-2">
              <p className="font-heading text-sm font-medium text-white">
                {d.name}
              </p>
              <p className="text-[10px] text-textMuted/55">{d.vibe}</p>
              <div className="flex gap-1 flex-wrap">
                {d.swatchNames.map((n) => (
                  <span
                    key={n}
                    className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] text-textMuted/40"
                  >
                    {n}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-textMuted/30 pt-1.5 border-t border-white/5">
                Serif wordmark · monogram mark
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      <p className="text-center text-xs text-textMuted/40">
        A complete identity — name, logo, colours, voice — designed for premium
        Pretoria East property. Reveal directions one at a time.
      </p>
    </div>
  );
}

// ─── Slide 12 — Unfair Advantage ───────────────────────────────────────────────

function Slide12UnfairAdvantage() {
  return (
    <div className="w-full max-w-4xl mx-auto space-y-7">
      <div className="space-y-3">
        <p className="text-[11px] uppercase tracking-[0.25em] text-sky-400/70">
          Growth accelerators
        </p>
        <h2 className="font-heading text-3xl md:text-4xl font-medium">
          Once your system is converting,{" "}
          <span className="text-sky-400">we pour fuel on it.</span>
        </h2>
        <p className="text-textMuted text-sm">
          Most agents wait for leads. You'll go hunting for them — automatically.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <motion.div
          className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-5 space-y-3"
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-sky-500/15 border border-sky-500/20 flex items-center justify-center">
              <svg
                viewBox="0 0 20 20"
                fill="none"
                className="h-4 w-4 text-sky-400"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-white">Lead Engine</p>
          </div>
          <p className="text-xs text-textMuted/80 leading-relaxed">
            We go and <em>find</em> qualified R1m–R35m buyers &amp; sellers in
            Pretoria East, enrich them, and feed them straight into your
            pipeline.
          </p>
          <p className="text-[10px] text-sky-300/60">Apollo · Tavily · Apify</p>
          <div className="rounded-lg border border-sky-500/15 bg-black/30 px-3 py-1.5 inline-block text-xs text-textMuted/60">
            Add-on from R6,000/month
          </div>
        </motion.div>

        <motion.div
          className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 space-y-3"
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15 }}
        >
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
              <svg
                viewBox="0 0 20 20"
                fill="none"
                className="h-4 w-4 text-emerald-400"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-white">Paid Ads</p>
          </div>
          <p className="text-xs text-textMuted/80 leading-relaxed">
            Targeted Meta &amp; Google campaigns to Pretoria East sellers and
            buyers, funnelled directly into the same system. Creative, landing,
            optimisation, reporting.
          </p>
          <p className="text-[10px] text-emerald-300/60">Meta Ads · Google Ads</p>
          <div className="rounded-lg border border-emerald-500/15 bg-black/30 px-3 py-1.5 inline-block text-xs text-textMuted/60">
            R5,000/month management + ad spend
          </div>
        </motion.div>
      </div>

      <div className="rounded-2xl border border-white/8 bg-black/30 p-4">
        <div className="flex items-center justify-center gap-3 text-[11px] flex-wrap">
          {[
            "Pretoria East market",
            "Lead Engine + Ads",
            "Your CRM",
            "Booked viewings",
          ].map((s, i, arr) => (
            <div key={s} className="flex items-center gap-2">
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-textMuted/65">
                {s}
              </div>
              {i < arr.length - 1 && (
                <span className="text-white/15">→</span>
              )}
            </div>
          ))}
        </div>
        <p className="text-center text-[10px] text-textMuted/35 mt-2">
          Tag these "switch on when ready" — keeps sticker shock low at sign-up.
        </p>
      </div>
    </div>
  );
}

// ─── Slide 13 — ROI ────────────────────────────────────────────────────────────

function Slide13ROI() {
  return (
    <div className="w-full max-w-4xl mx-auto text-center space-y-7">
      <div className="space-y-3">
        <p className="text-[11px] uppercase tracking-[0.25em] text-emerald-400/70">
          The numbers
        </p>
        <h2 className="font-heading text-3xl md:text-4xl font-medium">
          One extra deal pays for{" "}
          <span className="text-emerald-400">years of this.</span>
        </h2>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Average sale", value: "R3.5m", sub: "", neutral: true },
          {
            label: "Commission @ ~6%",
            value: "~R210,000",
            sub: "per deal",
            neutral: false,
          },
          {
            label: "Core system",
            value: "R9,500",
            sub: "/month",
            neutral: true,
          },
        ].map((s) => (
          <div
            key={s.label}
            className={`rounded-2xl border p-5 space-y-1 ${
              !s.neutral
                ? "border-emerald-500/30 bg-emerald-500/8"
                : "border-white/10 bg-black/30"
            }`}
          >
            <p className="text-[10px] text-textMuted/50 uppercase tracking-wider">
              {s.label}
            </p>
            <p
              className={`font-heading text-2xl font-bold ${
                !s.neutral ? "text-emerald-300" : "text-white"
              }`}
            >
              {s.value}
            </p>
            {s.sub && (
              <p className="text-[10px] text-textMuted/40">{s.sub}</p>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/8 bg-black/30 p-5 space-y-4 text-left">
        <p className="text-[10px] uppercase tracking-[0.2em] text-textMuted/50 text-center">
          Year 1 comparison
        </p>
        {[
          { label: "One commission", value: "R210,000", pct: 100, color: "emerald" },
          {
            label: "System Year 1 (build + 12 months)",
            value: "~R169,000",
            pct: 80,
            color: "white",
          },
        ].map((row) => (
          <div key={row.label} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-textMuted/60">{row.label}</span>
              <span
                className={
                  row.color === "emerald" ? "text-emerald-300" : "text-white"
                }
              >
                {row.value}
              </span>
            </div>
            <div className="h-3 rounded-full bg-white/5 overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  row.color === "emerald"
                    ? "bg-emerald-500/60"
                    : "bg-white/20"
                }`}
                style={{ width: `${row.pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <p className="text-sm text-white font-medium">
          Break-even ={" "}
          <span className="text-emerald-300">one extra deal every ~2 years.</span>
        </p>
        <p className="text-xs text-textMuted/55 mt-1">
          Realistic performance: several extra deals a year.
        </p>
      </div>

      <p className="text-textMuted/35 text-xs italic">
        "This isn't a cost. It's the cheapest deal-maker you'll ever hire — and
        it works nights, weekends, and while you sleep."
      </p>
    </div>
  );
}

// ─── Slide 14 — Pricing ────────────────────────────────────────────────────────

function Slide14Pricing() {
  const tiers = [
    {
      name: "Foundation Build",
      price: "From R49,500",
      sub: "once-off",
      desc: "Brand identity from scratch · conversion website · CRM setup · AI voice + WhatsApp · core automations",
      highlight: false,
      note: "50% deposit · 50% on launch",
    },
    {
      name: "Revenue System™",
      price: "From R9,500",
      sub: "/month",
      desc: "Hosting & security · AI call handling · WhatsApp agent · CRM · automated follow-up · analytics · support · all API costs",
      highlight: true,
      note: "Recommended to start",
    },
  ];

  const addons = [
    {
      name: "Lead Engine",
      price: "From R6,000/month",
      desc: "Qualified R1m–R35m buyers & sellers delivered to your pipeline",
    },
    {
      name: "Paid Ads",
      price: "R5,000/month + ad spend",
      desc: "Meta & Google targeting Pretoria East — recommended R8–15k ad spend",
    },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto space-y-5">
      <div className="text-center space-y-3">
        <p className="text-[11px] uppercase tracking-[0.25em] text-sky-400/70">
          Pricing
        </p>
        <h2 className="font-heading text-3xl md:text-4xl font-medium">
          Simple, transparent pricing.{" "}
          <span className="text-sky-400">Start where you are.</span>
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {tiers.map((t) => (
          <div
            key={t.name}
            className={`rounded-2xl border p-5 space-y-3 ${
              t.highlight
                ? "border-sky-500/40 bg-sky-500/5"
                : "border-white/10 bg-black/30"
            }`}
          >
            {t.highlight && (
              <span className="text-[9px] uppercase tracking-widest text-sky-300 border border-sky-500/30 rounded-full px-2.5 py-0.5">
                {t.note}
              </span>
            )}
            <h3 className="text-base font-medium text-white">{t.name}</h3>
            <div className="flex items-baseline gap-1">
              <span className="font-heading text-2xl font-bold text-white">
                {t.price}
              </span>
              <span className="text-sm text-textMuted/55">{t.sub}</span>
            </div>
            <p className="text-xs text-textMuted/70 leading-relaxed">{t.desc}</p>
            {!t.highlight && (
              <p className="text-[10px] text-textMuted/40">{t.note}</p>
            )}
          </div>
        ))}
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-textMuted/40 mb-3">
          Growth accelerators — switch on when ready
        </p>
        <div className="grid grid-cols-2 gap-3">
          {addons.map((a) => (
            <div
              key={a.name}
              className="rounded-xl border border-white/8 bg-black/20 p-3 space-y-1"
            >
              <p className="text-sm font-medium text-white">{a.name}</p>
              <p className="text-[11px] text-sky-300/65">{a.price}</p>
              <p className="text-[11px] text-textMuted/55">{a.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-white/5 bg-black/20 p-3 text-center">
        <p className="text-xs text-textMuted/50">
          No lock-in. You own your website, domain, and data. We earn your
          loyalty with results — not contracts.
        </p>
      </div>
    </div>
  );
}

// ─── Slide 15 — Close ──────────────────────────────────────────────────────────

function Slide15Close() {
  return (
    <div className="w-full max-w-3xl mx-auto text-center space-y-8">
      <div className="flex justify-center items-center gap-5">
        <img
          src="/images/vs-logo-premium.png"
          alt="VantageStack"
          className="h-7 opacity-80"
        />
        <span className="text-white/15 text-xl">×</span>
        <div className="h-7 rounded-xl border border-white/10 bg-white/[0.02] px-4 flex items-center text-xs text-textMuted/40">
          [AGENCY NAME]
        </div>
      </div>

      <h2 className="font-heading text-4xl md:text-5xl font-medium">
        Ready to stop losing deals
        <br />
        <span className="text-sky-400">and own Pretoria East?</span>
      </h2>

      <p className="text-textMuted text-base max-w-md mx-auto leading-relaxed">
        Next step: we lock in your brand direction and start the build.
        <br />
        50% deposit to begin — the rest on launch.
      </p>

      <div className="flex flex-col items-center gap-3">
        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 px-8 py-4 space-y-1">
          <p className="text-white font-medium text-sm">VantageStack</p>
          <p className="text-textMuted/50 text-xs">vantagestack.co.za</p>
        </div>
        <p className="text-textMuted/30 text-[10px]">
          Pricing benchmarked to the South African market · Jan 2026
        </p>
      </div>
    </div>
  );
}

// ─── Slide registry ────────────────────────────────────────────────────────────

type SlideData = {
  component: React.FC;
  title: string;
  notes: string;
};

const SLIDES: SlideData[] = [
  {
    component: Slide01Cover,
    title: "Cover",
    notes:
      '"Everything you\'re about to see is built specifically for selling premium property in Pretoria East." Set the tone — this is custom, not generic.',
  },
  {
    component: Slide02Hook,
    title: "The Hook",
    notes:
      "This is the single most relatable pain for an agent. Let the silence sit. \"How many times a month does that happen — and you never even know?\" Make it her world.",
  },
  {
    component: Slide03Leaks,
    title: "The Leaks",
    notes:
      "Show the silent-revenue-loss numbers and let them land. \"In real estate the cost per leak isn't a R500 job — it's a six-figure commission.\"",
  },
  {
    component: Slide04ScaryPart,
    title: "The Scary Part",
    notes:
      "Tie directly to her average sale price. Do the maths out loud with her actual listing range. The goal: make the invisible visible.",
  },
  {
    component: Slide05Fix,
    title: "The Fix",
    notes:
      "This is VantageStack's core brand promise. Stay on brand — plumbing metaphor. \"We connect every pipe so nothing is wasted.\"",
  },
  {
    component: Slide06OneSystem,
    title: "One System",
    notes:
      '"Everything you\'ll see next plugs into this one system. No loose tools." Emphasise the connected dashboard — she can see everything in one place.',
  },
  {
    component: Slide07LiveDemo,
    title: "Live Demo",
    notes:
      "Put the screen down. Open vantagestack.co.za, talk to Isabel (text or voice). \"Yours will sound like this, in your brand, and it'll know your listings, your calendar, your prices.\" Have a screen-recording backup in case of signal issues.",
  },
  {
    component: Slide08AIDetail,
    title: "Your AI",
    notes:
      '"While you\'re in a showing, it\'s handling the next three buyers." Walk through the 4-step flow. Multilingual = big point for SA market.',
  },
  {
    component: Slide09WhatsApp,
    title: "WhatsApp Command Centre",
    notes:
      "This is the slide that separates you from every web agency in SA. \"Your CRM, your invoices, your pipeline — in the app in your pocket. No logging into anything.\" This is the emotional wow moment for operators who live on WhatsApp.",
  },
  {
    component: Slide10HowWeBuild,
    title: "How We Build It",
    notes:
      "Reassure — \"You're not technical, and you don't need to be. We run it; you sell houses.\" De-risk the commitment.",
  },
  {
    component: Slide11BrandReveal,
    title: "Brand Reveal",
    notes:
      "Reveal directions one at a time live if presenting. This is the emotional high point — she falls in love with a name and look. \"Your competitors all look the same on Property24 — yours won't.\"",
  },
  {
    component: Slide12UnfairAdvantage,
    title: "Unfair Advantage",
    notes:
      "\"Most agents wait for leads. You'll go hunting for them — automatically.\" Position Lead Engine and Paid Ads as growth accelerators to switch on once the core is converting. Reduces sticker shock at sign-up.",
  },
  {
    component: Slide13ROI,
    title: "ROI",
    notes:
      "Don't apologise for the price. Anchor it against a single commission. \"This isn't a cost. It's the cheapest deal-maker you'll ever hire.\" Do the maths live with her actual average sale price.",
  },
  {
    component: Slide14Pricing,
    title: "Pricing",
    notes:
      "Recommend Foundation Build + Revenue System core to start. \"Switch on the Lead Engine and Ads when you're ready to scale.\" Land on Build + Core — value ladder model, no lock-in.",
  },
  {
    component: Slide15Close,
    title: "Close",
    notes:
      "Soft close. Offer the deposit-to-start, or a short follow-up to confirm the brand direction. Don't pressure. Next step: deposit to lock in brand direction and start the build.",
  },
];

// ─── Page shell ────────────────────────────────────────────────────────────────

export default function RealEstatePitchPage() {
  const [current, setCurrent] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const total = SLIDES.length;

  const go = useCallback(
    (next: number) => {
      if (next < 0 || next >= total) return;
      setDirection(next > current ? 1 : -1);
      setCurrent(next);
    },
    [current, total]
  );

  const next = useCallback(() => go(current + 1), [current, go]);
  const prev = useCallback(() => go(current - 1), [current, go]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        next();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
      if (e.key === "n" || e.key === "N") setShowNotes((s) => !s);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [next, prev]);

  const slide = SLIDES[current];
  const SlideComponent = slide.component;

  const variants = {
    enter: (d: number) => ({
      opacity: 0,
      x: d > 0 ? 40 : -40,
    }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({
      opacity: 0,
      x: d > 0 ? -40 : 40,
    }),
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0b0b0c] text-white flex flex-col select-none">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-3">
          <img
            src="/images/vs-logo-premium.png"
            alt="VantageStack"
            className="h-5 opacity-70"
          />
          <span className="hidden md:inline text-[10px] text-textMuted/30 uppercase tracking-widest">
            Real Estate Revenue System
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] text-textMuted/30 uppercase tracking-wider hidden md:inline">
            {slide.title}
          </span>
          <button
            onClick={() => setShowNotes((s) => !s)}
            className={`text-[10px] uppercase tracking-[0.18em] px-3 py-1 rounded-full border transition-all ${
              showNotes
                ? "border-sky-500/50 text-sky-300 bg-sky-500/10"
                : "border-white/10 text-textMuted/40 hover:border-white/20 hover:text-textMuted/70"
            }`}
          >
            Notes
          </button>
          <span className="text-[11px] text-textMuted/40 font-mono tabular-nums">
            {String(current + 1).padStart(2, "0")} /{" "}
            {String(total).padStart(2, "0")}
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Slide area */}
        <div className="flex-1 relative overflow-hidden">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={current}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 flex items-center justify-center p-8 md:p-12 overflow-y-auto"
            >
              <SlideComponent />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Speaker notes panel */}
        <AnimatePresence>
          {showNotes && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 300, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="border-l border-white/5 bg-black/70 backdrop-blur flex-shrink-0 overflow-hidden"
            >
              <div className="p-5 w-[300px]">
                <p className="text-[9px] uppercase tracking-[0.25em] text-textMuted/40 mb-3">
                  Speaker notes
                </p>
                <p className="text-xs text-textMuted/75 leading-relaxed">
                  {slide.notes}
                </p>
                <div className="mt-6 pt-4 border-t border-white/5">
                  <p className="text-[9px] text-textMuted/30 uppercase tracking-wider mb-2">
                    Slides
                  </p>
                  <div className="space-y-0.5">
                    {SLIDES.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => go(i)}
                        className={`w-full text-left px-2 py-1.5 rounded-lg text-[10px] transition-all ${
                          i === current
                            ? "bg-sky-500/15 text-sky-300"
                            : "text-textMuted/40 hover:text-textMuted/70 hover:bg-white/5"
                        }`}
                      >
                        <span className="font-mono mr-2 opacity-50">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        {s.title}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom nav */}
      <div className="flex items-center justify-between px-6 py-3 border-t border-white/5 flex-shrink-0">
        <button
          onClick={prev}
          disabled={current === 0}
          className="text-[11px] text-textMuted/50 hover:text-white disabled:opacity-20 transition-all flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/5"
        >
          ← Prev
        </button>

        <div className="flex items-center gap-1">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              className={`rounded-full transition-all duration-300 ${
                i === current
                  ? "w-5 h-1.5 bg-sky-400"
                  : "w-1.5 h-1.5 bg-white/15 hover:bg-white/35"
              }`}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>

        <button
          onClick={next}
          disabled={current === total - 1}
          className="text-[11px] text-textMuted/50 hover:text-white disabled:opacity-20 transition-all flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/5"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
