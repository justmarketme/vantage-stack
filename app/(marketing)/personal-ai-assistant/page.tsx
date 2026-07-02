import type { Metadata } from "next";
import { PersonalAiAssistantContent } from "./PersonalAiAssistantContent";

// /personal-ai-assistant — Personal AI Assistant. Source: SEO_Automation/landing_pages/personal-ai-assistant.
// Behind review (noindex inherited from the (marketing) layout). Booking = Cal.com.

export const metadata: Metadata = {
  title: "Personal AI Assistant for Business Owners | Vantage Stack",
  description:
    "Vantage Stack builds a personal AI assistant that manages your email, schedules meetings, drafts replies, and pulls the info you need — so you get hours back to run the business. South African, 24/7.",
  authors: [{ name: "Vantage Stack" }],
  alternates: { canonical: "https://vantagestack.co.za/personal-ai-assistant" },
  openGraph: {
    type: "article",
    title: "Personal AI Assistant for Business Owners | Vantage Stack",
    description:
      "Vantage Stack builds a personal AI assistant that manages your email, schedules meetings, drafts replies, and pulls the info you need — so you get hours back to run the business. South African, 24/7.",
    url: "https://vantagestack.co.za/personal-ai-assistant",
    modifiedTime: "2026-07-02",
  },
};

// JSON-LD preserved exactly from the source spec.
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": "https://vantagestack.co.za/#organization", name: "Vantage Stack", url: "https://vantagestack.co.za", areaServed: "ZA" },
    { "@type": "Service", "@id": "https://vantagestack.co.za/personal-ai-assistant/#service", name: "Personal AI Assistant", serviceType: "Personal AI assistant for email, scheduling and executive admin", provider: { "@id": "https://vantagestack.co.za/#organization" }, areaServed: "South Africa", description: "A personal AI assistant that manages email, schedules meetings, drafts replies and retrieves information on demand — giving business owners hours back." },
    { "@type": "BreadcrumbList", itemListElement: [ { "@type": "ListItem", position: 1, name: "Home", item: "https://vantagestack.co.za" }, { "@type": "ListItem", position: 2, name: "Personal AI Assistant", item: "https://vantagestack.co.za/personal-ai-assistant" } ] },
    { "@type": "FAQPage", mainEntity: [
      { "@type": "Question", name: "What is a personal AI assistant for business?", acceptedAnswer: { "@type": "Answer", text: "It is an AI that handles your day-to-day admin — triaging and drafting email, scheduling meetings, sending reminders, and pulling information you ask for — so you spend your time on the work only you can do. Vantage Stack builds it around your tools, inbox and calendar." } },
      { "@type": "Question", name: "How much time can a personal AI assistant save?", acceptedAnswer: { "@type": "Answer", text: "Owners and managers commonly lose 18 to 25 hours a week to admin. Automating email triage, scheduling and routine drafting gives a large share of that time back." } },
      { "@type": "Question", name: "Is my data safe with an AI assistant?", acceptedAnswer: { "@type": "Answer", text: "Yes. Vantage Stack configures secure access and POPIA-aligned data handling, and the assistant only touches the accounts and data you connect it to." } },
      { "@type": "Question", name: "Do I still stay in control?", acceptedAnswer: { "@type": "Answer", text: "Always. The assistant drafts and proposes; you approve anything that matters. You decide what it can send or book on its own and what needs a thumbs-up first." } }
    ] },
  ],
};

export default function PersonalAiAssistantPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PersonalAiAssistantContent />
    </>
  );
}
