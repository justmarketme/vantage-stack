import type { Metadata } from "next";
import "./globals.css";
import { IsabelWidget } from "../components/IsabelWidget";

export const metadata: Metadata = {
  title: "VantageStack — Premium Business Systems for South African Service Businesses",
  description:
    "VantageStack helps South African service businesses capture more leads, respond faster, and close more consistently — with premium web design, smart automation, and AI-assisted tools.",
  icons: {
    icon: "/images/vs-logo.png",
    apple: "/images/vs-logo.png",
  },
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
