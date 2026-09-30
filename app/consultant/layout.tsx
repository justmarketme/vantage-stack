import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../../components/consultant/theme.css";
import { ConsultantShell } from "../../components/consultant/shell/ConsultantShell";

export const metadata: Metadata = {
  title: "Consultant · VantageStack",
  robots: { index: false, follow: false },
};

// The root layout already sets viewportFit: "cover" (safe-area insets work);
// this only matches the browser chrome to the portal's base colour.
export const viewport: Viewport = {
  themeColor: "#121212",
};

export default function ConsultantLayout({ children }: { children: ReactNode }) {
  return <ConsultantShell>{children}</ConsultantShell>;
}
