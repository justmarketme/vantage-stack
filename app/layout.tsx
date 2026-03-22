import type { Metadata } from "next";
import "./globals.css";
import { IsabelWidget } from "../components/IsabelWidget";

export const metadata: Metadata = {
  title: "VantageStack — Business Optimization & Revenue Systems",
  description:
    "Turn your business into a revenue engine with intelligent systems, premium web design, and AI-powered automation."
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
