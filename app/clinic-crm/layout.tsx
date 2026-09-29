import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import "./theme.css";
import { ClinicProviders, THEME_ROOT_ID, themeBootScript } from "@/components/clinic-crm/providers/ClinicProviders";
import { Toaster } from "@/components/clinic-crm/ui/Toast";
import { AppShell } from "@/components/clinic-crm/views/AppShell";

// Per-request rendering: the security headers set in middleware must apply to every page.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Clinic CRM — Vantage Stack",
  description: "Patient enquiries, reminders and follow-ups for your practice.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function ClinicCrmLayout({ children }: { children: ReactNode }) {
  // The CSP is nonce-based (middleware sets x-nonce): an inline script without it is blocked,
  // which silently disabled the no-flash theme boot.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    // data-theme is set by the boot script before paint (no flash), so React must not diff it.
    <div className="clinic-crm" id={THEME_ROOT_ID} suppressHydrationWarning>
      <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      <ClinicProviders>
        <AppShell>{children}</AppShell>
        <Toaster />
      </ClinicProviders>
    </div>
  );
}
