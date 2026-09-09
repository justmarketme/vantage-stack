import type { Metadata } from "next";
import { SocialMediaManagementContent } from "./SocialMediaManagementContent";
import { RelatedReading } from "../../../components/blog/RelatedReading";

// /social-media-management — Social Media Management. Source: SEO_Automation/landing_pages/social-media-management.
// Behind review (noindex inherited from the (marketing) layout). Booking = Cal.com.

export const metadata: Metadata = {
  title: "Social Media Management for Business | Vantage Stack",
  description:
    "Vantage Stack runs your social media with strategy and consistency — on-brand content and UGC that builds trust and drives real enquiries, not just likes. For South African businesses.",
  authors: [{ name: "Vantage Stack" }],
  alternates: { canonical: "https://vantagestack.co.za/social-media-management" },
  openGraph: {
    type: "article",
    title: "Social Media Management for Business | Vantage Stack",
    description:
      "Vantage Stack runs your social media with strategy and consistency — on-brand content and UGC that builds trust and drives real enquiries, not just likes. For South African businesses.",
    url: "https://vantagestack.co.za/social-media-management",
    modifiedTime: "2026-07-02",
  },
};

// JSON-LD preserved exactly from the source spec.
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": "https://vantagestack.co.za/#organization", name: "Vantage Stack", url: "https://vantagestack.co.za", areaServed: "ZA" },
    { "@type": "Service", "@id": "https://vantagestack.co.za/social-media-management/#service", name: "Social Media Management", serviceType: "Social media management and content creation for small business", provider: { "@id": "https://vantagestack.co.za/#organization" }, areaServed: "South Africa", description: "Strategy-led social media management and on-brand content, including UGC, that builds trust and drives enquiries rather than vanity metrics." },
    { "@type": "BreadcrumbList", itemListElement: [ { "@type": "ListItem", position: 1, name: "Home", item: "https://vantagestack.co.za" }, { "@type": "ListItem", position: 2, name: "Social Media Management", item: "https://vantagestack.co.za/social-media-management" } ] },
    { "@type": "FAQPage", mainEntity: [
      { "@type": "Question", name: "Does social media actually bring in business?", acceptedAnswer: { "@type": "Answer", text: "When it's strategic, yes. Consistent, on-brand content builds the trust and familiarity that make people choose you and refer you. Vantage Stack ties social to real goals — enquiries and bookings — not just likes." } },
      { "@type": "Question", name: "What do you actually post?", acceptedAnswer: { "@type": "Answer", text: "A mix planned around your business: educational content, proof and results, behind-the-scenes, offers, and UGC-style video — in your brand voice, on the platforms your customers use." } },
      { "@type": "Question", name: "How much of my time does it take?", acceptedAnswer: { "@type": "Answer", text: "Very little. We handle strategy, content creation and scheduling; you approve. The point is to take social off your plate while keeping it authentically yours." } },
      { "@type": "Question", name: "Do you do UGC and video?", acceptedAnswer: { "@type": "Answer", text: "Yes. Short-form video and UGC-style content perform best on most platforms now, so it's a core part of what we produce." } },
    ] },
  ],
};

export default function SocialMediaManagementPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SocialMediaManagementContent />
      <RelatedReading pillar="Paid Ads & Social Integration" />
    </>
  );
}
