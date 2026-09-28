import type { Metadata } from "next";

/**
 * Internal tool — kept out of search results. It is not secret (no client data
 * is reachable from it), but it is not a marketing page and should never appear
 * in a site: query or get indexed alongside the real pages.
 */
export const metadata: Metadata = {
  title: "Demo Sandbox — Vantage Stack",
  description: "Internal rehearsal surface for live agent demos. Not a public page.",
  robots: { index: false, follow: false, nocache: true },
};

export default function SandboxLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
