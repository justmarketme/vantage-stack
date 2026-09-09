import type { Metadata } from "next";
import { MarketingContent } from "./MarketingContent";

// /marketing — Marketing & Growth Systems (umbrella page). Source:
// SEO_Automation/landing_pages/marketing_READY_FOR_REVIEW.html.
// Behind review (noindex inherited from the (marketing) layout). Booking = Cal.com.

export const metadata: Metadata = {
  title: "Marketing & Growth Systems for South African Businesses | Vantage Stack",
  description:
    "Vantage Stack is not a marketing agency — it's a growth system. AI calling, CRM, WhatsApp assistants, websites, paid ads and automation working as one connected revenue engine for South African businesses.",
  authors: [{ name: "Vantage Stack" }],
  alternates: { canonical: "https://vantagestack.co.za/marketing" },
  openGraph: {
    type: "article",
    title: "Marketing & Growth Systems for South African Businesses | Vantage Stack",
    description:
      "Vantage Stack is not a marketing agency — it's a growth system. AI calling, CRM, WhatsApp assistants, websites, paid ads and automation working as one connected revenue engine for South African businesses.",
    url: "https://vantagestack.co.za/marketing",
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
      "@id": "https://vantagestack.co.za/marketing/#service",
      name: "Marketing & Growth Systems",
      serviceType: "Full-stack marketing and business automation for small business",
      provider: { "@id": "https://vantagestack.co.za/#organization" },
      areaServed: "South Africa",
      description:
        "A connected growth system — AI calling, CRM automation, WhatsApp assistants, websites, paid ads, social and workflow automation working together to turn attention into booked revenue.",
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://vantagestack.co.za" },
        { "@type": "ListItem", position: 2, name: "Marketing", item: "https://vantagestack.co.za/marketing" },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        { "@type": "Question", name: "Is Vantage Stack a marketing agency?", acceptedAnswer: { "@type": "Answer", text: "No. We're a business automation and growth company. We solve one problem: teams losing time and revenue to slow follow-up, missed enquiries and disconnected tools — by building a connected system, not just running campaigns." } },
        { "@type": "Question", name: "Do I have to buy everything at once?", acceptedAnswer: { "@type": "Answer", text: "No. We start with the biggest leak in your business — usually AI call handling, CRM capture and follow-up — and expand into website, ads, social and automation as each piece pays for itself." } },
        { "@type": "Question", name: "How do I know where to start?", acceptedAnswer: { "@type": "Answer", text: "With the free Growth Blueprint. We map how leads move through your business, find where they leak, and show you the highest-value fix first." } },
        { "@type": "Question", name: "Why does everything connecting matter?", acceptedAnswer: { "@type": "Answer", text: "Because leads leak in the gaps between disconnected tools. When your website, calling, CRM, WhatsApp, ads and follow-up share one system, an enquiry becomes a tracked, worked, booked customer instead of a dropped ball." } },
      ],
    },
  ],
};

export default function MarketingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <MarketingContent />
    </>
  );
}
