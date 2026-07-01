import type { Metadata } from "next";
import { AiCallingContent } from "./AiCallingContent";

// ───────────────────────────────────────────────────────────────────────────
// /ai-calling — AI Voice Agent landing page (Problem-Agitate-Solve).
// Source: Cowork handoff HO-2026-07-01-001
// (cowork-handoff/to_claude_code/ai-calling_READY_FOR_REVIEW.html).
//
// BEHIND REVIEW — NOT approved to go live. `robots: noindex` below and the
// absence of any public nav link keep it unreachable/​unindexed until Boss man
// approves and the >>> REVIEW placeholders are filled. Remove the noindex line
// at go-live. See ai-calling_REVIEW_SUMMARY.md for the open items.
// ───────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: "AI Voice Agents That Book Appointments While You Sleep | Vantage Stack",
  description:
    "Vantage Stack builds outbound AI voice agents for South African businesses — they answer every call, qualify leads, and book appointments 24/7. POPIA-compliant, load-shedding-proof. Stop losing deals to slow follow-up.",
  authors: [{ name: "Vantage Stack" }],
  alternates: { canonical: "https://vantagestack.co.za/ai-calling" },
  // BEHIND REVIEW — remove this block at go-live so the page can be indexed.
  robots: { index: false, follow: false },
  openGraph: {
    type: "article",
    title: "AI Voice Agents That Book Appointments While You Sleep | Vantage Stack",
    description:
      "Outbound & inbound AI voice agents for South African businesses — answer every call, qualify leads, and book appointments 24/7. POPIA-compliant, load-shedding-proof.",
    url: "https://vantagestack.co.za/ai-calling",
    publishedTime: "2026-07-01",
    modifiedTime: "2026-07-01",
  },
};

// JSON-LD preserved EXACTLY as authored by Cowork (Organization + Service +
// BreadcrumbList + FAQPage). Do not edit copy here — Cowork owns it.
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://vantagestack.co.za/#organization",
      name: "Vantage Stack",
      url: "https://vantagestack.co.za",
      description:
        "Business automation company in South Africa. AI voice agents, CRM automation, WhatsApp assistants, and custom software that gives small teams their time back.",
      areaServed: "ZA",
      slogan: "Stop bleeding hours on admin.",
    },
    {
      "@type": "Service",
      "@id": "https://vantagestack.co.za/ai-calling/#service",
      name: "AI Voice Agent Implementation",
      serviceType:
        "Outbound and inbound AI voice agents for appointment booking and lead qualification",
      provider: { "@id": "https://vantagestack.co.za/#organization" },
      areaServed: "South Africa",
      description:
        "Custom AI voice agents that answer every call, qualify leads, and book appointments into your calendar 24/7 — POPIA-compliant and resilient to load-shedding.",
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://vantagestack.co.za" },
        { "@type": "ListItem", position: 2, name: "AI Calling", item: "https://vantagestack.co.za/ai-calling" },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What is an AI voice agent?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "An AI voice agent is software that answers and makes phone calls in a natural human voice. It can greet callers, answer common questions, qualify leads, and book appointments directly into your calendar — running 24/7 without a human on the line. Vantage Stack builds custom agents tuned to your business, scripts, and South African accent.",
          },
        },
        {
          "@type": "Question",
          name: "How much does an AI voice agent cost in South Africa?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Market pricing for AI voice agents in South Africa typically starts around R8,000 once-off setup per agent plus usage billed near R100 per agent-hour, with many providers requiring a minimum monthly spend. A human receptionist costs R8,000 to R15,000 per month but only works business hours. Vantage Stack scopes pricing to your call volume so you only pay for what moves revenue.",
          },
        },
        {
          "@type": "Question",
          name: "Will an AI voice agent work during load-shedding?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Vantage Stack agents run in the cloud on redundant infrastructure with backup power, so calls are answered even when your office loses power. Your business never misses a call because Eskom did.",
          },
        },
        {
          "@type": "Question",
          name: "Is an AI voice agent POPIA-compliant?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Vantage Stack builds agents with POPIA compliance in mind — consent handling, call disclosure, and secure storage of personal information are configured as part of every deployment.",
          },
        },
        {
          "@type": "Question",
          name: "How quickly can a voice agent respond to a new lead?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Instantly. Because the agent never sleeps, it can call or answer a new enquiry within seconds. This matters: leads contacted within 5 minutes are 21 times more likely to qualify than those contacted after 30 minutes, and a one-minute response can lift conversions by up to 391%.",
          },
        },
      ],
    },
  ],
};

export default function AiCallingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <AiCallingContent />
    </>
  );
}
