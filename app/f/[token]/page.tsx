import { cache } from "react";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { connectCrmDb } from "@/lib/crm/db";
import { getLinkByToken } from "@/lib/crm/proposal-feedback";
import { FeedbackRoom } from "@/components/feedback/FeedbackRoom";
import { googleFontsHref } from "@/lib/crm/feedback-brand";

export const dynamic = "force-dynamic";

// One lookup per request, shared by metadata, viewport and the page.
const loadLink = cache(async (token: string) => {
  const db = await connectCrmDb();
  if (!db) throw new Error("Database unavailable");
  return getLinkByToken(db, token);
});

const isHex = (v: string) => /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);

/** The mobile browser bar takes the client's page colour, not our app's dark shell. */
export async function generateViewport({ params }: { params: Promise<{ token: string }> }): Promise<Viewport> {
  const { token } = await params;
  const link = await loadLink(token);
  const bg = link && isHex(link.brand.bg) ? link.brand.bg : "#0b0b0c";
  return { themeColor: bg, colorScheme: link?.brand.mode ?? "dark", viewportFit: "cover", width: "device-width", initialScale: 1 };
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const link = await loadLink(token);
  // WhatsApp/iMessage build the link preview from these tags without running JS, so this never marks the link opened.
  const title = link ? `${link.title} · Feedback` : "Proposal feedback";
  const description = link
    ? `Your private feedback room for the ${link.title}. Talk us through it, pin or draw on anything you'd like changed.`
    : "Private proposal feedback room.";
  const mark = link?.brand.icon ?? link?.brand.logo;
  return {
    title,
    description,
    robots: { index: false, follow: false },
    icons: mark ? { icon: mark, apple: mark } : undefined,
    openGraph: {
      title,
      description,
      siteName: link?.brand.name ?? "Vantage Stack",
      images: mark ? [{ url: mark }] : undefined,
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
  const link = await loadLink(token);
  if (!link) notFound();
  const embeddable = await canEmbed(link.proposal_url);
  const firstName = link.client_name.trim().split(/\s+/)[0] || "there";

  return (
    <>
      {/* Overscroll and the area behind the browser bars show the client's colour, not our dark app shell. */}
      {isHex(link.brand.bg) ? <style>{`html,body{background:${link.brand.bg}!important}`}</style> : null}
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
    </>
  );
}
