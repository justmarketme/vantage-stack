import type { Metadata } from "next";
import { Navbar } from "../../components/layout/Navbar";
import { Footer } from "../../components/layout/Footer";

// ───────────────────────────────────────────────────────────────────────────
// (marketing) route group — the real app shell for every service landing page.
// It provides the actual Navbar (real logo + nav) and Footer, so page
// components are BODY SECTIONS ONLY (per cowork-handoff/DESIGN_SPEC.md).
//
// BEHIND REVIEW: robots noindex is set here once for the whole group, and no
// public nav links point at these routes. Remove this robots block at go-live.
// ───────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <Navbar />
      <main className="pt-28">{children}</main>
      <Footer />
    </div>
  );
}
