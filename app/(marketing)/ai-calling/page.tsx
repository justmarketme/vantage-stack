import type { Metadata } from "next";
import { AiCallingContent } from "./AiCallingContent";
import { RelatedReading } from "../../../components/blog/RelatedReading";

// /ai-calling — AI Voice Agents. Source: SEO_Automation/landing_pages/ai-calling.
// Behind review (noindex inherited from the (marketing) layout). Booking = Cal.com.

export const metadata: Metadata = {
  title: "AI Voice Agents That Book Appointments 24/7 | Vantage Stack",
  description:
    "Vantage Stack builds AI voice agents for South African businesses — they answer every call, qualify leads, and book appointments 24/7. POPIA-compliant, load-shedding-proof.",
  authors: [{ name: "Vantage Stack" }],
  alternates: { canonical: "https://vantagestack.co.za/ai-calling" },
  openGraph: {
    type: "article",
    title: "AI Voice Agents That Book Appointments 24/7 | Vantage Stack",
    description:
      "AI voice agents that answer every call, qualify leads, and book appointments 24/7 — POPIA-compliant, load-shedding-proof.",
    url: "https://vantagestack.co.za/ai-calling",
    modifiedTime: "2026-07-02",
  },
};

// JSON-LD preserved exactly from the source spec.
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": "https://vantagestack.co.za/#organization", name: "Vantage Stack", url: "https://vantagestack.co.za", areaServed: "ZA" },
    {
      "@type": "Service",
      "@id": "https://vantagestack.co.za/ai-calling/#service",
      name: "AI Voice Agents",
      serviceType: "Outbound and inbound AI voice agents for appointment booking and lead qualification",
      provider: { "@id": "https://vantagestack.co.za/#organization" },
      areaServed: "South Africa",
      description:
        "Custom AI voice agents that answer every call, qualify leads, and book appointments into your calendar 24/7 — POPIA-compliant and resilient to load-shedding.",
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://vantagestack.co.za" },
        { "@type": "ListItem", position: 2, name: "AI Voice Agents", item: "https://vantagestack.co.za/ai-calling" },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        { "@type": "Question", name: "What is an AI voice agent?", acceptedAnswer: { "@type": "Answer", text: "An AI voice agent is software that answers and makes phone calls in a natural human voice. It greets callers, answers common questions, qualifies leads, and books appointments into your calendar 24/7 — no human on the line. Vantage Stack builds each one custom to your business, scripts, and South African accent." } },
        { "@type": "Question", name: "How much does an AI voice agent cost in South Africa?", acceptedAnswer: { "@type": "Answer", text: "Market pricing typically starts around R8,000 once-off setup per agent plus usage near R100 per agent-hour, often with a monthly minimum. A human receptionist runs R8,000 to R15,000 per month for business hours only. Vantage Stack scopes pricing to your call volume." } },
        { "@type": "Question", name: "Will an AI voice agent work during load-shedding?", acceptedAnswer: { "@type": "Answer", text: "Yes. Vantage Stack agents run in the cloud on redundant infrastructure with backup power, so calls are answered even when your office loses power." } },
        { "@type": "Question", name: "Is an AI voice agent POPIA-compliant?", acceptedAnswer: { "@type": "Answer", text: "Yes. Consent handling, call disclosure, and secure storage of personal information are configured into every deployment." } },
        { "@type": "Question", name: "How quickly can it respond to a new lead?", acceptedAnswer: { "@type": "Answer", text: "Instantly. Leads contacted within 5 minutes are 21 times more likely to qualify than after 30 minutes, and a one-minute response can lift conversions by up to 391%." } },
      ],
    },
  ],
};

export default function AiCallingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <AiCallingContent />
      <RelatedReading pillar="Voice Agent Implementation" />
    </>
  );
}
