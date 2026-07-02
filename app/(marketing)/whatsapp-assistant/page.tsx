import type { Metadata } from "next";
import { WhatsappAssistantContent } from "./WhatsappAssistantContent";

// /whatsapp-assistant — WhatsApp & Teams AI Assistant. Source: SEO_Automation/landing_pages/whatsapp-assistant.
// Behind review (noindex inherited from the (marketing) layout). Booking = Cal.com.

export const metadata: Metadata = {
  title: "WhatsApp & Teams AI Assistant for Business | Vantage Stack",
  description:
    "Vantage Stack builds WhatsApp and Teams AI assistants that book appointments, answer customers, and pull your CRM data and invoices on demand — 24/7, POPIA-compliant, in a natural South African voice.",
  authors: [{ name: "Vantage Stack" }],
  alternates: { canonical: "https://vantagestack.co.za/whatsapp-assistant" },
  openGraph: {
    type: "article",
    title: "WhatsApp & Teams AI Assistant for Business | Vantage Stack",
    description:
      "Vantage Stack builds WhatsApp and Teams AI assistants that book appointments, answer customers, and pull your CRM data and invoices on demand — 24/7, POPIA-compliant, in a natural South African voice.",
    url: "https://vantagestack.co.za/whatsapp-assistant",
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
      "@id": "https://vantagestack.co.za/whatsapp-assistant/#service",
      name: "WhatsApp & Teams AI Assistant",
      serviceType: "WhatsApp and Microsoft Teams AI business assistant for support, booking, and data retrieval",
      provider: { "@id": "https://vantagestack.co.za/#organization" },
      areaServed: "South Africa",
      description:
        "A WhatsApp and Teams AI assistant that answers customers, books appointments, and pulls CRM data and invoices on demand — 24/7 and POPIA-compliant.",
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://vantagestack.co.za" },
        { "@type": "ListItem", position: 2, name: "WhatsApp Assistant", item: "https://vantagestack.co.za/whatsapp-assistant" },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        { "@type": "Question", name: "What is a WhatsApp business assistant?", acceptedAnswer: { "@type": "Answer", text: "A WhatsApp business assistant is an AI that chats with your customers on WhatsApp — answering questions, qualifying leads, and booking appointments — and can also answer your team's questions by pulling live data like CRM records and invoices. Vantage Stack builds it custom to your business, 24/7 and POPIA-compliant." } },
        { "@type": "Question", name: "Can a WhatsApp assistant pull my CRM data and invoices?", acceptedAnswer: { "@type": "Answer", text: "Yes. Vantage Stack connects the assistant to your CRM, invoicing, and calendar, so you or your team can ask in plain language and get an instant answer inside WhatsApp or Teams." } },
        { "@type": "Question", name: "Is WhatsApp automation allowed and POPIA-compliant?", acceptedAnswer: { "@type": "Answer", text: "Yes, when done correctly. Vantage Stack builds on the official WhatsApp Business Platform and configures consent, opt-outs, and secure data handling in line with WhatsApp's policies and POPIA." } },
        { "@type": "Question", name: "Does it work after hours?", acceptedAnswer: { "@type": "Answer", text: "Yes — the assistant runs 24/7, so customers get instant answers and bookings at any hour, even when your team is offline." } },
      ],
    },
  ],
};

export default function WhatsappAssistantPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <WhatsappAssistantContent />
    </>
  );
}
