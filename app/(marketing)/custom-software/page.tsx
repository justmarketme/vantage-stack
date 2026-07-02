import type { Metadata } from "next";
import { CustomSoftwareContent } from "./CustomSoftwareContent";

// /custom-software — Custom Software Development. Source: SEO_Automation/landing_pages/custom-software.
// Behind review (noindex inherited from the (marketing) layout). Booking = Cal.com.

export const metadata: Metadata = {
  title: "Custom Software Development for Business | Vantage Stack",
  description:
    "Vantage Stack builds custom software tailored to exactly how your business works — when spreadsheets and off-the-shelf tools stop fitting. AI-accelerated builds, owned by you.",
  authors: [{ name: "Vantage Stack" }],
  alternates: { canonical: "https://vantagestack.co.za/custom-software" },
  openGraph: {
    type: "article",
    title: "Custom Software Development for Business | Vantage Stack",
    description:
      "Vantage Stack builds custom software tailored to exactly how your business works — when spreadsheets and off-the-shelf tools stop fitting. AI-accelerated builds, owned by you.",
    url: "https://vantagestack.co.za/custom-software",
    modifiedTime: "2026-07-02",
  },
};

// JSON-LD preserved exactly from the source spec.
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": "https://vantagestack.co.za/#organization", name: "Vantage Stack", url: "https://vantagestack.co.za", areaServed: "ZA" },
    { "@type": "Service", "@id": "https://vantagestack.co.za/custom-software/#service", name: "Custom Software", serviceType: "Custom software development for small and medium business", provider: { "@id": "https://vantagestack.co.za/#organization" }, areaServed: "South Africa", description: "Custom software built to exactly how your business works — replacing spreadsheets and ill-fitting tools with a system that matches your process." },
    { "@type": "BreadcrumbList", itemListElement: [ { "@type": "ListItem", position: 1, name: "Home", item: "https://vantagestack.co.za" }, { "@type": "ListItem", position: 2, name: "Custom Software", item: "https://vantagestack.co.za/custom-software" } ] },
    { "@type": "FAQPage", mainEntity: [
      { "@type": "Question", name: "When does a business need custom software?", acceptedAnswer: { "@type": "Answer", text: "When off-the-shelf tools don't fit your process, when you're running the business on fragile spreadsheets and manual workarounds, or when you're paying for several tools that still don't do what you actually need. Custom software matches your workflow instead of forcing you to match it." } },
      { "@type": "Question", name: "Isn't custom software slow and expensive?", acceptedAnswer: { "@type": "Answer", text: "It used to be. Vantage Stack builds with modern AI-accelerated development, so scoped tools ship far faster and cheaper than the old model. We start with the highest-value piece and expand." } },
      { "@type": "Question", name: "Do I own the software?", acceptedAnswer: { "@type": "Answer", text: "Yes. It's built for your business and yours to keep — no per-seat lock-in to someone else's product roadmap." } },
      { "@type": "Question", name: "Will it connect to my other tools?", acceptedAnswer: { "@type": "Answer", text: "Yes. Because Vantage Stack builds the whole stack, custom software connects to your CRM, website, WhatsApp assistant and workflows so everything works as one system." } },
    ] },
  ],
};

export default function CustomSoftwarePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <CustomSoftwareContent />
    </>
  );
}
