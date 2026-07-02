import type { Metadata } from "next";
import { listSummaries } from "../../lib/blog/posts";
import { BlogIndexClient } from "../../components/blog/BlogIndexClient";
import { SITE_URL } from "../../lib/blog/config";

export const metadata: Metadata = {
  title: "Blog — Business Automation Insights | Vantage Stack",
  description:
    "Practical guides on AI voice agents, CRM & system automation, WhatsApp assistants, personal AI, and paid ads for South African businesses.",
  alternates: { canonical: `${SITE_URL}/blog` },
};

export default function BlogIndexPage() {
  const posts = listSummaries();
  return (
    <section className="vs-section">
      <div className="vs-container">
        <p className="vs-section-heading">Vantage Stack blog</p>
        <h1 className="vs-section-title">Business automation, explained for South African teams.</h1>
        <p className="mt-3 max-w-2xl text-sm text-textMuted md:text-base">
          Practical guides on AI voice agents, system automation, WhatsApp assistants, personal AI and paid ads — how they
          work, what they cost locally, and how to get started.
        </p>
        <BlogIndexClient posts={posts} />
      </div>
    </section>
  );
}
