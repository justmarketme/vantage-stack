import type { Metadata, Viewport } from "next";
import "./globals.css";
import { IsabelWidget } from "../components/IsabelWidget";

export const metadata: Metadata = {
  title: "VantageStack — Business Optimization & Revenue Systems",
  description:
    "Turn your business into a revenue engine with intelligent systems, premium web design, and AI-powered automation.",
  icons: {
    icon: "/images/vs-logo.png",
    apple: "/images/vs-logo.png",
  },
};

// viewportFit:'cover' is the prerequisite for env(safe-area-inset-*) on notched
// phones — without it every safe-area offset is a no-op. themeColor darkens the
// mobile browser chrome to match the app.
export const viewport: Viewport = {
  themeColor: "#0b0b0c",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-textPrimary font-body antialiased">
        {children}
        <IsabelWidget />
      </body>
    </html>
  );
}
