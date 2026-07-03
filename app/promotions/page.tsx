"use client";

import { useEffect, useState } from "react";
import { Navbar } from "../../components/layout/Navbar";
import { Footer } from "../../components/layout/Footer";
import { motion } from "framer-motion";
import { Check, Calendar, Phone, MessageCircle, ArrowRight, Clock, TrendingUp, Users, Zap, Globe, Bot, BarChart3, Shield } from "lucide-react";

const CAL_LINK = "vantagestack/discovery-call";
const WHATSAPP_NUMBER = "+27600132533";
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER.replace(/\D/g, "")}?text=${encodeURIComponent("Hi, I saw your 45% promotion and I'm interested in learning more.")}`;

const EASE = [0.16, 1, 0.3, 1] as const;

function useCalEmbed() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const win = window as any;
    if (win.Cal?.loaded) return;
    (function (C: any, A: string, L: string) {
      const p = (a: any, ar: any) => { a.q.push(ar); };
      const d = C.document;
      C.Cal = C.Cal || function (...args: any[]) {
        const cal = C.Cal;
        if (!cal.loaded) {
          cal.ns = {};
          cal.q = cal.q || [];
          const s = d.createElement("script");
          s.src = A;
          d.head.appendChild(s);
          cal.loaded = true;
        }
        if (args[0] === L) {
          const api: any = (...a: any[]) => { p(api, a); };
          const ns = args[1];
          api.q = api.q || [];
          if (typeof ns === "string") {
            cal.ns[ns] = cal.ns[ns] || api;
            p(cal.ns[ns], args);
            p(cal, ["-queue", ns]);
          } else { p(cal, args); }
          return;
        }
        p(cal, args);
      };
    })(win, "https://app.cal.com/embed/embed.js", "init");
    win.Cal("init", "discovery", { origin: "https://app.cal.com" });
  }, []);
}

function BookCallButton({ className = "", label = "Book My Free Strategy Call" }: { className?: string; label?: string }) {
  useCalEmbed();
  return (
    <button
      data-cal-namespace="discovery"
      data-cal-link={CAL_LINK}
      data-cal-config='{"layout":"popup"}'
      className={className}
    >
      <Calendar size={14} className="inline-block mr-1.5 -mt-0.5" />
      {label}
    </button>
  );
}

const PACKAGES = [
  {
    name: "Starter System",
    description: "For businesses starting from scratch — no website, no system, losing leads daily.",
    originalSetup: 19_500,
    promoSetup: 10_725,
    monthly: 3_500,
    popular: false,
    features: [
      "Professional business website",
      "Google Business Profile setup",
      "WhatsApp Business integration",
      "Basic lead capture forms",
      "Automated first-response message",
      "Monthly performance report",
    ],
    idealFor: "You have no website or online presence yet",
  },
  {
    name: "Growth System",
    description: "For businesses getting leads but losing them to slow follow-up and manual processes.",
    originalSetup: 32_500,
    promoSetup: 17_875,
    monthly: 0,
    popular: true,
    features: [
      "Everything in Starter, plus:",
      "AI voice agent (answers calls 24/7)",
      "Automated lead qualification",
      "WhatsApp chatbot automation",
      "CRM with pipeline tracking",
      "Missed call recovery system",
      "Automated follow-up sequences",
      "Weekly analytics dashboard",
    ],
    idealFor: "You're getting enquiries but losing them",
  },
  {
    name: "Revenue System™",
    description: "For established businesses ready to scale — full automation, AI, and conversion optimisation.",
    originalSetup: 49_500,
    promoSetup: 27_225,
    monthly: 0,
    popular: false,
    features: [
      "Everything in Growth, plus:",
      "Custom AI workflows",
      "Multi-channel automation",
      "Advanced analytics & ROI tracking",
      "Competitor monitoring",
      "Conversion rate optimisation",
      "Dedicated account manager",
      "Priority support",
    ],
    idealFor: "You're established and ready to scale",
  },
];

const PAIN_STATS = [
  { stat: "42%", label: "of calls to SA SMBs go unanswered", icon: Phone },
  { stat: "54%", label: "of leads never receive a follow-up", icon: Clock },
  { stat: "78%", label: "of customers buy from whoever responds first", icon: TrendingUp },
  { stat: "R47k", label: "average monthly revenue lost to missed leads", icon: BarChart3 },
];

const FAQS = [
  {
    q: "Why is there a 45% discount right now?",
    a: "We're onboarding a select group of SA businesses this quarter to build case studies across different industries. You get a significantly reduced rate, we get real results to showcase. It's a genuine win-win — and the discount ends when we've filled all slots.",
  },
  {
    q: "What if I don't have a website at all?",
    a: "That's exactly what the Starter System is for. We build your website, set up your Google Business Profile, and connect WhatsApp — everything you need to start capturing leads online.",
  },
  {
    q: "How quickly can I expect results?",
    a: "Most clients see their first leads within 2 weeks of going live. The AI voice agent and WhatsApp automation work from day one — no waiting for SEO to kick in.",
  },
  {
    q: "Do I need to be technical?",
    a: "Not at all. We handle everything — setup, configuration, training, and ongoing support. You just need to answer the phone when we send you a qualified lead.",
  },
  {
    q: "What happens after the promotional period?",
    a: "Your setup is a once-off payment at the discounted rate — that never changes. If your package includes a monthly fee, it stays at the standard rate shown. No hidden increases.",
  },
  {
    q: "Can I upgrade later?",
    a: "Absolutely. Many clients start with Starter and upgrade to Growth once they see results. The setup difference is prorated, so you only pay the gap.",
  },
];

function formatZAR(amount: number): string {
  return `R${amount.toLocaleString("en-ZA")}`;
}

export default function PromotionsPage() {
  return (
    <div className="relative">
      <Navbar />
      <main className="pt-28">
        <HeroSection />
        <PainSection />
        <SolutionSection />
        <PackagesSection />
        <ProcessSection />
        <GbpSection />
        <FaqSection />
        <FinalCtaSection />
      </main>
      <Footer />
    </div>
  );
}

function HeroSection() {
  return (
    <section className="vs-section relative overflow-hidden">
      {/* Hero background image */}
      <div className="absolute inset-0 z-0">
        <img
          src="/images/promotions/hero-banner.webp"
          alt=""
          className="w-full h-full object-cover opacity-25"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
      </div>

      <div className="vs-container text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}
        >
          <span className="vs-badge mb-6 inline-block bg-sky-500/10 text-sky-400 border border-sky-500/20">
            Limited — 45% Off All Packages
          </span>
        </motion.div>

        <motion.h1
          className="font-heading text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight mb-6"
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.1 }}
        >
          Every Missed Call Is a
          <span className="text-sky-400"> Customer You'll Never Get Back</span>
        </motion.h1>

        <motion.p
          className="text-textMuted text-lg sm:text-xl max-w-2xl mx-auto mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.2 }}
        >
          42% of calls to South African small businesses go unanswered. That's not a statistic — it's revenue walking out the door every single day. We fix that.
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.3 }}
        >
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="vs-button-primary px-8 py-3.5 text-base font-semibold flex items-center gap-2"
          >
            <MessageCircle size={18} />
            Claim My 45% Discount Now
          </a>
          <BookCallButton className="vs-button-ghost px-8 py-3.5 text-base font-semibold" />
        </motion.div>

        <motion.p
          className="text-textMuted text-sm mt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          No commitment required · Free strategy call · Setup starts from {formatZAR(10_725)}
        </motion.p>
      </div>
    </section>
  );
}

function PainSection() {
  return (
    <section className="vs-section bg-surface/50">
      <div className="vs-container">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.7, ease: EASE }}
        >
          <span className="vs-section-heading">The problem</span>
          <h2 className="vs-section-title mt-3">
            Your Business Is Leaking Money — and You Might Not Even Know It
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {PAIN_STATS.map((item, i) => (
            <motion.div
              key={item.stat}
              className="vs-card p-6 text-center"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.5, ease: EASE, delay: i * 0.1 }}
            >
              <item.icon className="mx-auto mb-3 text-sky-400" size={28} />
              <div className="text-3xl font-heading font-bold text-sky-400 mb-1">{item.stat}</div>
              <p className="text-textMuted text-sm">{item.label}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          className="mt-10 flex justify-center"
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.6, ease: EASE }}
        >
          <img
            src="/images/promotions/pain-missed-calls.webp"
            alt="Missed calls and lost leads visualization"
            className="rounded-2xl border border-white/10 max-w-2xl w-full shadow-2xl shadow-sky-500/5"
          />
        </motion.div>

        <motion.p
          className="text-center text-textMuted mt-8 max-w-xl mx-auto"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
        >
          Right now, someone is calling your business. If nobody answers, they'll call your competitor — and 78% of the time, they'll buy from whoever picks up first.
        </motion.p>
      </div>
    </section>
  );
}

function SolutionSection() {
  const solutions = [
    { icon: Bot, title: "AI Voice Agent", desc: "Answers every call 24/7. Qualifies leads, books appointments, and sounds completely natural." },
    { icon: MessageCircle, title: "WhatsApp Automation", desc: "Instant replies to messages. Handles enquiries, sends quotes, and follows up — automatically." },
    { icon: Globe, title: "Professional Website", desc: "Built to convert visitors into leads. Not just a brochure — a 24/7 salesperson for your business." },
    { icon: Zap, title: "Lead Recovery System", desc: "Catches every missed call, every abandoned form, every unanswered message — and follows up instantly." },
    { icon: Users, title: "Smart CRM", desc: "See every lead, every interaction, every deal — in one place. No more spreadsheets or sticky notes." },
    { icon: Shield, title: "Google Business Profile", desc: "Get found by people actively searching for your services. Properly optimised, with reviews strategy." },
  ];

  return (
    <section className="vs-section">
      <div className="vs-container">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.7, ease: EASE }}
        >
          <span className="vs-section-heading">The solution</span>
          <h2 className="vs-section-title mt-3">
            Stop Losing Leads. Start Closing Them.
          </h2>
          <p className="text-textMuted mt-4 max-w-xl mx-auto">
            We build the systems that catch what you're missing — so every enquiry gets answered, every lead gets followed up, and you stop leaving money on the table.
          </p>
        </motion.div>

        <motion.div
          className="mb-12 flex justify-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.15 }}
        >
          <img
            src="/images/promotions/solution-dashboard.webp"
            alt="AI automation dashboard showing calls, WhatsApp, calendar and CRM"
            className="rounded-2xl border border-white/10 max-w-3xl w-full shadow-2xl shadow-sky-500/5"
          />
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {solutions.map((s, i) => (
            <motion.div
              key={s.title}
              className="vs-card vs-card-hover p-6"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.5, ease: EASE, delay: i * 0.08 }}
            >
              <s.icon className="text-sky-400 mb-3" size={24} />
              <h3 className="font-heading font-bold text-lg mb-2">{s.title}</h3>
              <p className="text-textMuted text-sm">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PackagesSection() {
  return (
    <section className="vs-section bg-surface/50" id="packages">
      <div className="vs-container">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.7, ease: EASE }}
        >
          <span className="vs-section-heading">Promotional pricing</span>
          <h2 className="vs-section-title mt-3">
            Save 45% — Limited Slots Available
          </h2>
          <p className="text-textMuted mt-4 max-w-xl mx-auto">
            We're onboarding a select group of businesses this quarter. Once the slots are filled, pricing returns to normal.
          </p>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-3 lg:gap-8">
          {PACKAGES.map((pkg, i) => (
            <motion.div
              key={pkg.name}
              className={`rounded-3xl border ${pkg.popular ? "border-sky-500/50 bg-sky-950/20" : "border-white/10"} p-6 sm:p-8 relative`}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.5, ease: EASE, delay: i * 0.1 }}
            >
              {pkg.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-sky-500 text-white text-xs font-bold px-4 py-1 rounded-full uppercase tracking-wide">
                  Most Popular
                </div>
              )}

              <h3 className="font-heading text-xl font-bold mb-1">{pkg.name}</h3>
              <p className="text-textMuted text-sm mb-5">{pkg.description}</p>

              <div className="mb-1">
                <span className="text-textMuted text-sm line-through">{formatZAR(pkg.originalSetup)}</span>
                <span className="ml-2 bg-emerald-500/10 text-emerald-400 text-xs font-bold px-2 py-0.5 rounded-full">45% OFF</span>
              </div>
              <div className="text-3xl font-heading font-bold text-sky-400 mb-1">
                {formatZAR(pkg.promoSetup)}
                <span className="text-textMuted text-sm font-normal ml-1">once-off setup</span>
              </div>
              {pkg.monthly > 0 && (
                <div className="text-textMuted text-sm mb-4">
                  + {formatZAR(pkg.monthly)}/month
                </div>
              )}
              {pkg.monthly === 0 && <div className="h-5 mb-4" />}

              <p className="text-xs text-sky-400/80 mb-4 font-medium">
                Ideal for: {pkg.idealFor}
              </p>

              <ul className="space-y-2.5 mb-6">
                {pkg.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                    <span className="text-textMuted">{f}</span>
                  </li>
                ))}
              </ul>

              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-full font-semibold text-sm ${
                  pkg.popular
                    ? "bg-sky-500 hover:bg-sky-400 text-white"
                    : "border border-white/20 hover:border-white/40 text-textPrimary"
                } transition-all`}
              >
                <MessageCircle size={16} />
                Claim My 45% Discount
              </a>
            </motion.div>
          ))}
        </div>

        <motion.div
          className="mt-10 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
        >
          <p className="text-textMuted text-sm mb-3">
            Not sure which package is right? Start with a free strategy call — we'll recommend based on your situation.
          </p>
          <BookCallButton
            className="vs-button-ghost px-6 py-2.5 text-sm font-semibold"
            label="Book My Free Strategy Call"
          />
        </motion.div>
      </div>
    </section>
  );
}

function ProcessSection() {
  const steps = [
    { num: "01", title: "Free Strategy Call", desc: "We listen to your specific situation, identify where you're losing leads, and recommend the right solution." },
    { num: "02", title: "We Build Your System", desc: "Our team sets up everything — website, automation, AI agents, CRM — tailored to your business and industry." },
    { num: "03", title: "Go Live & Start Catching Leads", desc: "Your system goes live. Every call gets answered, every lead gets followed up, and you see it all in your dashboard." },
    { num: "04", title: "Optimise & Scale", desc: "We continuously optimise based on real data — which messages convert, which channels perform, where to invest next." },
  ];

  return (
    <section className="vs-section">
      <div className="vs-container">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.7, ease: EASE }}
        >
          <span className="vs-section-heading">How it works</span>
          <h2 className="vs-section-title mt-3">From Lost Leads to Closed Deals in 4 Steps</h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s, i) => (
            <motion.div
              key={s.num}
              className="relative"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.5, ease: EASE, delay: i * 0.1 }}
            >
              <div className="text-5xl font-heading font-bold text-sky-500/20 mb-2">{s.num}</div>
              <h3 className="font-heading font-bold text-lg mb-2">{s.title}</h3>
              <p className="text-textMuted text-sm">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function GbpSection() {
  return (
    <section className="vs-section bg-surface/50">
      <div className="vs-container">
        <motion.div
          className="vs-card p-8 sm:p-12 text-center max-w-2xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.7, ease: EASE }}
        >
          <Shield className="mx-auto text-emerald-400 mb-4" size={36} />
          <h2 className="font-heading text-2xl font-bold mb-3">
            Just Want Google Business Profile Setup?
          </h2>
          <p className="text-textMuted mb-4">
            Not ready for a full system? Start with the single most impactful thing you can do for local visibility — a properly optimised Google Business Profile. We set it up, verify it, add your photos, write your description, and show you how to get reviews.
          </p>
          <div className="text-3xl font-heading font-bold text-emerald-400 mb-4">
            {formatZAR(800)}
            <span className="text-textMuted text-sm font-normal ml-1">once-off</span>
          </div>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="vs-button-primary px-8 py-3 text-sm font-semibold inline-flex items-center gap-2"
          >
            <MessageCircle size={16} />
            Get My Google Profile Set Up
          </a>
        </motion.div>
      </div>
    </section>
  );
}

function FaqSection() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="vs-section">
      <div className="vs-container max-w-3xl">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.7, ease: EASE }}
        >
          <span className="vs-section-heading">FAQ</span>
          <h2 className="vs-section-title mt-3">Questions You Probably Have</h2>
        </motion.div>

        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <motion.div
              key={i}
              className="vs-card overflow-hidden"
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
            >
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full text-left p-5 flex items-center justify-between"
              >
                <span className="font-heading font-semibold text-sm sm:text-base pr-4">{faq.q}</span>
                <ArrowRight
                  size={16}
                  className={`shrink-0 text-textMuted transition-transform ${open === i ? "rotate-90" : ""}`}
                />
              </button>
              {open === i && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className="px-5 pb-5"
                >
                  <p className="text-textMuted text-sm leading-relaxed">{faq.a}</p>
                </motion.div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCtaSection() {
  return (
    <section className="vs-section relative overflow-hidden bg-gradient-to-b from-sky-950/20 to-background">
      {/* Background image */}
      <div className="absolute inset-0 z-0">
        <img
          src="/images/promotions/results-growth.webp"
          alt=""
          className="w-full h-full object-cover opacity-15"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/85 to-background" />
      </div>

      <div className="vs-container text-center max-w-2xl relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.7, ease: EASE }}
        >
          <h2 className="font-heading text-3xl sm:text-4xl font-bold mb-4">
            Stop Losing Leads. <span className="text-sky-400">Start Today.</span>
          </h2>
          <p className="text-textMuted text-lg mb-8">
            Every day you wait is another day of missed calls, unanswered messages, and customers choosing your competitors. The 45% discount won't last — and neither will the leads you're losing.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="vs-button-primary px-8 py-3.5 text-base font-semibold flex items-center gap-2"
            >
              <MessageCircle size={18} />
              Claim My 45% Discount Now
            </a>
            <BookCallButton className="vs-button-ghost px-8 py-3.5 text-base font-semibold" />
          </div>
          <p className="text-textMuted text-xs mt-6">
            📱 Or WhatsApp us directly: <a href={`tel:${WHATSAPP_NUMBER}`} className="text-sky-400 hover:underline">{WHATSAPP_NUMBER}</a>
          </p>
        </motion.div>
      </div>
    </section>
  );
}
