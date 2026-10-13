import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connectCrmDb } from "@/lib/crm/db";
import { getLinkByToken } from "@/lib/crm/proposal-feedback";
import { FeedbackRoom } from "@/components/feedback/FeedbackRoom";
import { googleFontsHref } from "@/lib/crm/feedback-brand";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const db = await connectCrmDb();
  const link = db ? await getLinkByToken(db, token) : null;
  // WhatsApp/iMessage build the link preview from these tags without running JS, so this never marks the link opened.
  const title = link ? `${link.title} · Feedback` : "Proposal feedback";
  const description = link
    ? `Your private feedback room for the ${link.title}. Talk us through it, pin or draw on anything you'd like changed.`
    : "Private proposal feedback room.";
  return {
    title,
    description,
    robots: { index: false, follow: false },
    icons: link?.brand.logo ? { icon: link.brand.logo } : undefined,
    openGraph: {
      title,
      description,
      siteName: link?.brand.name ?? "Vantage Stack",
      images: link?.brand.logo ? [{ url: link.brand.logo }] : undefined,
    },
  };
}

/** A site that sends X-Frame-Options or a restrictive frame-ancestors can't sit inside our page. */
async function canEmbed(url: string) {
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(6000), cache: "no-store" });
    const xfo = (res.headers.get("x-frame-options") || "").toLowerCase();
    if (xfo.includes("deny") || xfo.includes("sameorigin")) return false;
    const fa = (res.headers.get("content-security-policy") || "").match(/frame-ancestors([^;]*)/i)?.[1]?.trim();
    if (fa && !fa.split(/\s+/).some((s) => s === "*" || s.includes("vantagestack.co.za"))) return false;
    return true;
  } catch {
    return true;
  }
}

export default async function FeedbackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await connectCrmDb();
  if (!db) throw new Error("Database unavailable");
  const link = await getLinkByToken(db, token);
  if (!link) notFound();
  const embeddable = await canEmbed(link.proposal_url);
  const firstName = link.client_name.trim().split(/\s+/)[0] || "there";

  return (
    <FeedbackRoom
      token={token}
      linkId={link.id}
      firstName={firstName}
      title={link.title}
      proposalUrl={link.proposal_url}
      embeddable={embeddable}
      brand={link.brand}
      fontsHref={googleFontsHref(link.brand)}
    />
  );
}
