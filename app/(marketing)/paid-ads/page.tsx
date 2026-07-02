import type { Metadata } from "next";
import { PaidAdsContent } from "./PaidAdsContent";
import { RelatedReading } from "../../../components/blog/RelatedReading";

// /paid-ads — Paid Ads Management. Source: SEO_Automation/landing_pages/paid-ads.
// Behind review (noindex inherited from the (marketing) layout). Booking = Cal.com.

export const metadata: Metadata = {
  title: "Paid Ads Management for Small Business | Facebook, Google & LinkedIn | Vantage Stack",
  description:
    "Vantage Stack runs full-stack paid ads for South African small businesses — Facebook, Instagram, Google and LinkedIn — wired to your CRM so you track real leads and revenue, not just clicks.",
  authors: [{ name: "Vantage Stack" }],
  alternates: { canonical: "https://vantagestack.co.za/paid-ads" },
  openGraph: {
    type: "article",
    title: "Paid Ads Management for Small Business | Facebook, Google & LinkedIn | Vantage Stack",
    description:
      "Vantage Stack runs full-stack paid ads for South African small businesses — Facebook, Instagram, Google and LinkedIn — wired to your CRM so you track real leads and revenue, not just clicks.",
    url: "https://vantagestack.co.za/paid-ads",
    modifiedTime: "2026-07-02",
  },
};

// JSON-LD preserved exactly from the source spec.
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": "https://vantagestack.co.za/#organization", name: "Vantage Stack", url: "https://vantagestack.co.za", areaServed: "ZA" },
    { "@type": "Service", "@id": "https://vantagestack.co.za/paid-ads/#service", name: "Paid Ads Management", serviceType: "Paid advertising management across Facebook, Instagram, Google and LinkedIn for small business", provider: { "@id": "https://vantagestack.co.za/#organization" }, areaServed: "South Africa", description: "Full-stack paid ads management wired to your CRM so you track leads and revenue, not just clicks — Facebook, Instagram, Google and LinkedIn." },
    { "@type": "BreadcrumbList", itemListElement: [ { "@type": "ListItem", position: 1, name: "Home", item: "https://vantagestack.co.za" }, { "@type": "ListItem", position: 2, name: "Paid Ads", item: "https://vantagestack.co.za/paid-ads" } ] },
    { "@type": "FAQPage", mainEntity: [
      { "@type": "Question", name: "How much should a small business spend on paid ads?", acceptedAnswer: { "@type": "Answer", text: "It depends on your margins and average deal value. Vantage Stack starts with a budget that gathers real conversion data, then scales spend only on what proves profitable, so you buy leads and revenue rather than just clicks." } },
      { "@type": "Question", name: "Which platform is best — Facebook, Google or LinkedIn?", acceptedAnswer: { "@type": "Answer", text: "It depends on your customer. Google captures people already searching; Facebook and Instagram create demand and retarget; LinkedIn works for B2B. We pick the mix based on where your buyers actually are." } },
      { "@type": "Question", name: "How do I know if my ads are actually working?", acceptedAnswer: { "@type": "Answer", text: "By tracking leads and revenue, not vanity metrics. We wire your ads to your CRM so every lead and sale is attributed to the campaign that produced it — you see cost per lead and return, not just impressions." } },
      { "@type": "Question", name: "Do you handle the ad creative too?", acceptedAnswer: { "@type": "Answer", text: "Yes. We produce and continuously test ad creative, because creative is usually the biggest lever on performance." } },
    ] },
  ],
};

export default function PaidAdsPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PaidAdsContent />
      <RelatedReading pillar="Paid Ads & Social Integration" />
    </>
  );
}
