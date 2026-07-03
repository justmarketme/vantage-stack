import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "45% Off Business Automation & AI Solutions | VantageStack South Africa",
  description:
    "Limited promotion: Save 45% on website design, AI voice agents, WhatsApp automation, and lead recovery systems for South African small businesses. Stop losing leads to missed calls — setup from R10,725.",
  keywords: [
    "small business automation South Africa",
    "AI voice agent SA",
    "WhatsApp business automation",
    "missed calls lead recovery",
    "website for small business South Africa",
    "lead follow up automation",
    "Google Business Profile setup SA",
    "CRM for small business",
    "business automation Johannesburg",
    "AI receptionist South Africa",
  ],
  openGraph: {
    title: "45% Off — Stop Losing Leads to Missed Calls | VantageStack",
    description:
      "42% of calls to SA SMBs go unanswered. We build the AI systems that catch every lead, answer every call, and follow up automatically. Limited 45% discount — setup from R10,725.",
    type: "website",
    url: "https://vantagestack.co.za/promotions",
    siteName: "VantageStack",
  },
  twitter: {
    card: "summary_large_image",
    title: "45% Off Business Automation | VantageStack SA",
    description:
      "Stop losing leads. AI voice agents, WhatsApp automation, websites & CRM — 45% off for a limited time.",
  },
  alternates: {
    canonical: "https://vantagestack.co.za/promotions",
  },
};

export default function PromotionsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
