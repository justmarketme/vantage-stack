import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getAllPosts, getPostBySlug } from "../../../lib/blog/posts";
import { SITE_URL, BLOG_BEHIND_REVIEW, pillarLabel, formatDate } from "../../../lib/blog/config";
import { PostBody } from "../../../components/blog/PostBody";
import { RelatedReading } from "../../../components/blog/RelatedReading";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};
  const url = `${SITE_URL}/blog/${post.slug}`;
  const noindex = BLOG_BEHIND_REVIEW || !post.approved;
  return {
    title: `${post.frontmatter.title} | Vantage Stack`,
    description: post.frontmatter.meta_description,
    authors: [{ name: post.frontmatter.author }],
    alternates: { canonical: url },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      type: "article",
      title: post.frontmatter.title,
      description: post.frontmatter.meta_description,
      url,
      publishedTime: post.frontmatter.date,
      modifiedTime: post.frontmatter.date,
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const fm = post.frontmatter;
  const url = `${SITE_URL}/blog/${post.slug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        "@id": `${url}#article`,
        headline: fm.title,
        description: fm.meta_description,
        author: { "@type": "Organization", name: fm.author },
        publisher: { "@type": "Organization", name: "Vantage Stack", url: SITE_URL },
        datePublished: fm.date,
        dateModified: fm.date,
        mainEntityOfPage: url,
        articleSection: fm.pillar,
        ...(fm.primary_keyword || fm.secondary_keywords
          ? { keywords: [fm.primary_keyword, ...(fm.secondary_keywords ?? [])].filter(Boolean).join(", ") }
          : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
          { "@type": "ListItem", position: 3, name: fm.title, item: url },
        ],
      },
      ...(post.faq.length > 0
        ? [
            {
              "@type": "FAQPage",
              mainEntity: post.faq.map((f) => ({
                "@type": "Question",
                name: f.question,
                acceptedAnswer: { "@type": "Answer", text: f.answer },
              })),
            },
          ]
        : []),
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <article className="vs-section">
        <div className="vs-container max-w-3xl">
          <nav className="flex items-center gap-2 text-xs text-textMuted/70">
            <Link href="/blog" className="hover:text-textPrimary">Blog</Link>
            <span>/</span>
            <span className="text-textMuted">{pillarLabel(fm.pillar)}</span>
          </nav>

          {!post.approved && (
            <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-100/90">
              <span className="font-semibold uppercase tracking-[0.14em] text-amber-300">⚠ Draft</span> — awaiting review.
              Not listed publicly and <code className="text-amber-200">noindex</code> until its frontmatter{" "}
              <code className="text-amber-200">status</code> is set to <code className="text-amber-200">approved</code>.
            </div>
          )}

          <h1 className="mt-5 font-heading text-[30px] font-medium leading-tight text-textPrimary md:text-[40px] md:leading-[1.1]">
            {fm.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-textMuted/70">
            <span>{formatDate(fm.date)}</span>
            <span>·</span>
            <span>{fm.author}</span>
            <span>·</span>
            <span className="rounded-full border border-white/10 bg-white/[0.02] px-2 py-0.5 uppercase tracking-[0.14em] text-accent/90">
              {pillarLabel(fm.pillar)}
            </span>
          </div>

          {post.tldr && (
            <div className="my-7 rounded-r-xl border border-white/10 border-l-2 border-l-accent bg-white/[0.03] px-5 py-4">
              <span className="font-heading text-xs font-semibold uppercase tracking-[0.16em] text-accent">TL;DR</span>
              <p className="mt-1.5 text-sm leading-relaxed text-textPrimary/90 md:text-base">{post.tldr}</p>
            </div>
          )}

          {post.reviewNotes.map((note, i) => (
            <div
              key={i}
              className="my-4 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200/90"
            >
              <span className="mt-px font-semibold uppercase tracking-[0.14em] text-amber-300">⚠ Review</span>
              <span className="text-amber-100/80">{note}</span>
            </div>
          ))}

          <div className="mt-6">
            <PostBody markdown={post.body} />
          </div>
        </div>
      </article>

      <RelatedReading pillar={fm.pillar} excludeSlug={post.slug} heading="More in this pillar" />
    </>
  );
}
