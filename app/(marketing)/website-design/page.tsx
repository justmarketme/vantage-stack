import type { Metadata } from "next";
import { WebsiteDesignContent } from "./WebsiteDesignContent";

// /website-design — Website Design. Source: SEO_Automation/landing_pages/website-design.
// Behind review (noindex inherited from the (marketing) layout). Booking = Cal.com.

export const metadata: Metadata = {
  title: "Website Design That Converts | South Africa | Vantage Stack",
  description:
    "Vantage Stack designs fast, mobile-first websites built to convert visitors into enquiries — wired to your CRM and booking, not just pretty. Website design for South African businesses.",
  authors: [{ name: "Vantage Stack" }],
  alternates: { canonical: "https://vantagestack.co.za/website-design" },
  openGraph: {
    type: "article",
    title: "Website Design That Converts | South Africa | Vantage Stack",
    description:
      "Vantage Stack designs fast, mobile-first websites built to convert visitors into enquiries — wired to your CRM and booking, not just pretty. Website design for South African businesses.",
    url: "https://vantagestack.co.za/website-design",
    modifiedTime: "2026-07-02",
  },
};

// JSON-LD preserved exactly from the source spec.
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": "https://vantagestack.co.za/#organization", name: "Vantage Stack", url: "https://vantagestack.co.za", areaServed: "ZA" },
    { "@type": "Service", "@id": "https://vantagestack.co.za/website-design/#service", name: "Website Design", serviceType: "Conversion-focused website design and development for small business", provider: { "@id": "https://vantagestack.co.za/#organization" }, areaServed: "South Africa", description: "Fast, mobile-first websites designed to convert visitors into enquiries and wired to your CRM and booking — not just good-looking." },
    { "@type": "BreadcrumbList", itemListElement: [ { "@type": "ListItem", position: 1, name: "Home", item: "https://vantagestack.co.za" }, { "@type": "ListItem", position: 2, name: "Website Design", item: "https://vantagestack.co.za/website-design" } ] },
    {
      "@type": "FAQPage",
      mainEntity: [
        { "@type": "Question", name: "What makes a website convert instead of just look nice?", acceptedAnswer: { "@type": "Answer", text: "A clear offer, an obvious next step on every screen, fast mobile performance, trust signals, and a frictionless path to enquire or book. Vantage Stack designs around the visitor's decision, then wires the enquiry straight into your CRM and follow-up." } },
        { "@type": "Question", name: "How long does a website take to build?", acceptedAnswer: { "@type": "Answer", text: "Most business sites go live in a few weeks depending on scope. We start with the pages that drive enquiries and expand from there." } },
        { "@type": "Question", name: "Will my website work on mobile?", acceptedAnswer: { "@type": "Answer", text: "Yes — mobile-first. Most South African traffic is on phones, so we design and test for mobile before desktop, with fast load times." } },
        { "@type": "Question", name: "Do you connect the website to my other tools?", acceptedAnswer: { "@type": "Answer", text: "Yes. Because Vantage Stack builds the whole stack, your site plugs into your CRM, WhatsApp assistant, booking and follow-up, so an enquiry becomes a tracked, worked lead automatically." } },
      ],
    },
  ],
};

export default function WebsiteDesignPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <WebsiteDesignContent />
    </>
  );
}
