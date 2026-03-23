import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { connectCrmDb } from "../../../../lib/crm/db";
import { getReportPublicByShareToken } from "../../../../lib/crm/report-review";

export const metadata = {
  title: "Your VantageStack report",
};

export default async function PublicReportSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await connectCrmDb();
  if (!db) {
    return (
      <div className="vs-container py-24 text-textMuted">
        Service unavailable.
      </div>
    );
  }
  try {
    const out = await getReportPublicByShareToken(db, token);
    if (!out.ok) {
      return (
        <div className="vs-container py-24">
          <p className="text-textMuted">This report link is invalid or expired.</p>
          <Link href="/" className="mt-4 inline-block text-accent">
            Home
          </Link>
        </div>
      );
    }
    const video = typeof out.video_url === "string" ? out.video_url : "";
    return (
      <div className="min-h-screen bg-background text-textPrimary">
        <div className="vs-container py-16 md:py-24 max-w-3xl">
          <p className="vs-section-heading">VantageStack</p>
          <h1 className="font-heading text-2xl md:text-3xl text-textPrimary mb-2">{out.client_name}</h1>
          <p className="text-textMuted text-sm mb-10">Your personalized analysis</p>

          {video ? (
            <section className="vs-card mb-10" aria-labelledby="video-heading">
              <h2 id="video-heading" className="text-lg font-semibold text-textPrimary mb-4">
                Video walkthrough
              </h2>
              <video controls className="w-full rounded-xl border border-white/10 bg-black max-h-[480px]" preload="metadata">
                <source src={video} type="video/mp4" />
                <a href={video} className="text-accent underline">
                  Open video
                </a>
              </video>
            </section>
          ) : null}

          <section className="vs-card prose prose-invert prose-sm max-w-none" aria-labelledby="report-heading">
            <h2 id="report-heading" className="text-lg font-semibold text-textPrimary mb-4 not-prose">
              Full written report
            </h2>
            <div className="text-textPrimary/90 leading-relaxed space-y-4 [&_a]:text-accent [&_ul]:list-disc [&_ul]:pl-5">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{out.narrative}</ReactMarkdown>
            </div>
          </section>

          <p className="mt-10 text-center text-sm text-textMuted">
            Questions? Reply to your VantageStack email or{" "}
            <Link href="/contact" className="text-accent underline">
              contact us
            </Link>
            .
          </p>
        </div>
      </div>
    );
  } finally {
    await db.end({ timeout: 5 });
  }
}
