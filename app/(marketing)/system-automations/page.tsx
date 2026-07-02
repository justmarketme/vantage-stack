import type { Metadata } from "next";
import { SystemAutomationsContent } from "./SystemAutomationsContent";

// /system-automations — System Automations. Source: SEO_Automation/landing_pages/crm.
// Behind review (noindex inherited from the (marketing) layout). Booking = Cal.com.

export const metadata: Metadata = {
  title: "System Automations for Small Business | Stop Doing Data Entry | Vantage Stack",
  description:
    "Vantage Stack builds system automation for South African small businesses — every lead captured, every follow-up sent, invoices and data connected. Stop losing deals in the admin cracks.",
  authors: [{ name: "Vantage Stack" }],
  alternates: { canonical: "https://vantagestack.co.za/system-automations" },
  openGraph: {
    type: "article",
    title: "System Automations for Small Business | Stop Doing Data Entry | Vantage Stack",
    description:
      "Vantage Stack builds system automation for South African small businesses — every lead captured, every follow-up sent, invoices and data connected. Stop losing deals in the admin cracks.",
    url: "https://vantagestack.co.za/system-automations",
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
      "@id": "https://vantagestack.co.za/system-automations/#service",
      name: "System Automations",
      serviceType: "system automation and sales follow-up automation for small business",
      provider: { "@id": "https://vantagestack.co.za/#organization" },
      areaServed: "South Africa",
      description:
        "Automated CRM that captures every lead, triggers follow-ups, enriches contacts, and connects invoices and data — so nothing leaks in the admin cracks.",
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://vantagestack.co.za" },
        { "@type": "ListItem", position: 2, name: "System Automations", item: "https://vantagestack.co.za/system-automations" },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        { "@type": "Question", name: "What is system automation?", acceptedAnswer: { "@type": "Answer", text: "System automation is connecting your business tools so leads are captured, records update, and follow-ups fire automatically instead of by hand. Vantage Stack builds it around your existing tools so every enquiry is logged and every follow-up happens without anyone remembering to do it." } },
        { "@type": "Question", name: "How much time does system automation save a small business?", acceptedAnswer: { "@type": "Answer", text: "Small teams commonly lose 18 to 25 hours a week to manual admin across disconnected tools. Automating lead capture, follow-up, and data entry gives most of those hours back to actual revenue work." } },
        { "@type": "Question", name: "Can it connect my CRM to invoices and WhatsApp?", acceptedAnswer: { "@type": "Answer", text: "Yes. Vantage Stack connects your CRM to invoicing, WhatsApp, email, and your calendar so data flows between them automatically." } },
        { "@type": "Question", name: "Do I have to replace my current CRM?", acceptedAnswer: { "@type": "Answer", text: "Usually not. We automate around the tools you already use where possible, and only recommend replacing something when it is actively costing you more than it saves." } },
      ],
    },
  ],
};

export default function SystemAutomationsPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SystemAutomationsContent />
    </>
  );
}
