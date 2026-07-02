import type { Metadata } from "next";
import { WorkflowAutomationContent } from "./WorkflowAutomationContent";

// /workflow-automation — AI Workflow Automation. Source: SEO_Automation/landing_pages/workflow-automation.
// Behind review (noindex inherited from the (marketing) layout). Booking = Cal.com.

export const metadata: Metadata = {
  title: "AI Workflow Automation for Business | Vantage Stack",
  description:
    "Vantage Stack automates the repetitive tasks eating your team's week — connecting your apps and adding AI where judgement is needed, so work happens on its own. Automation for South African businesses.",
  authors: [{ name: "Vantage Stack" }],
  alternates: { canonical: "https://vantagestack.co.za/workflow-automation" },
  openGraph: {
    type: "article",
    title: "AI Workflow Automation for Business | Vantage Stack",
    description:
      "Vantage Stack automates the repetitive tasks eating your team's week — connecting your apps and adding AI where judgement is needed, so work happens on its own. Automation for South African businesses.",
    url: "https://vantagestack.co.za/workflow-automation",
    modifiedTime: "2026-07-02",
  },
};

// JSON-LD preserved exactly from the source spec.
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": "https://vantagestack.co.za/#organization", "name": "Vantage Stack", "url": "https://vantagestack.co.za", "areaServed": "ZA" },
    { "@type": "Service", "@id": "https://vantagestack.co.za/workflow-automation/#service", "name": "AI Workflow Automation", "serviceType": "AI workflow automation and business process automation", "provider": { "@id": "https://vantagestack.co.za/#organization" }, "areaServed": "South Africa", "description": "Automation of repetitive business workflows — connecting your apps and adding AI where judgement is needed, so routine work happens on its own." },
    { "@type": "BreadcrumbList", "itemListElement": [ { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://vantagestack.co.za" }, { "@type": "ListItem", "position": 2, "name": "Workflow Automation", "item": "https://vantagestack.co.za/workflow-automation" } ] },
    { "@type": "FAQPage", "mainEntity": [
      { "@type": "Question", "name": "What is AI workflow automation?", "acceptedAnswer": { "@type": "Answer", "text": "It is connecting your apps and processes so routine work happens automatically — data moves, tasks trigger, and follow-ups fire without a human doing it by hand. AI is added where a task needs judgement, like reading an email or classifying a request." } },
      { "@type": "Question", "name": "What kinds of tasks can be automated?", "acceptedAnswer": { "@type": "Answer", "text": "Anything repetitive and rule-based: moving data between tools, sending follow-ups and reminders, creating invoices, updating the CRM, routing enquiries, generating reports. AI extends this to tasks that need light judgement." } },
      { "@type": "Question", "name": "Will automation replace my team?", "acceptedAnswer": { "@type": "Answer", "text": "No — it removes the repetitive, low-value work so your team spends time on the things that actually need a person. Most owners use it to grow without hiring for admin." } },
      { "@type": "Question", "name": "Do the automations connect my existing tools?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. Because Vantage Stack builds the whole stack, automations connect your CRM, website, WhatsApp assistant, invoicing and more, so everything runs as one system." } }
    ] }
  ],
};

export default function WorkflowAutomationPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <WorkflowAutomationContent />
    </>
  );
}
