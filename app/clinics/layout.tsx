import type { Metadata } from "next";

/**
 * Metadata lives here because the page itself is a client component (it holds
 * the ROI state shared between the calculator and the blueprint form), and
 * Next cannot export `metadata` from a "use client" module.
 *
 * Title and description target the intent a clinic owner actually searches
 * with — the operational problem, not the product category. Someone hunting a
 * fix for missed calls does not search "clinic revenue system"; they search for
 * the symptom.
 */
export const metadata: Metadata = {
  title: "Clinic Revenue Systems for Private Practices | Vantage Stack",
  description:
    "Stop losing patients to missed calls, slow replies and no-shows. Vantage Stack connects enquiry, booking, confirmation and recall into one system — with a transparent ROI calculator and a free clinic revenue blueprint.",
  alternates: {
    canonical: "https://clinics.vantagestack.co.za/",
  },
  openGraph: {
    title: "Your clinic doesn't need another website. It needs a revenue system.",
    description:
      "Missed calls, late replies, no-shows and patients who never came back. See what those four gaps are worth at your own numbers.",
    url: "https://clinics.vantagestack.co.za/",
    siteName: "Vantage Stack",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function ClinicsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
