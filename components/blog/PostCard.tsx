import Link from "next/link";
import { pillarLabel, formatDate } from "../../lib/blog/config";
import type { PostSummary } from "../../lib/blog/posts";

// Works in both server (RelatedReading) and client (BlogIndexClient) trees —
// no hooks, and it only imports the fs-free config module + a type.
export function PostCard({ post }: { post: PostSummary }) {
  return (
    <Link href={`/blog/${post.slug}`} className="vs-card vs-card-hover block border border-white/10">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em]">
        <span className="rounded-full border border-white/10 bg-white/[0.02] px-2 py-0.5 text-accent/90">
          {pillarLabel(post.pillar)}
        </span>
        {!post.approved && (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-300">
            Draft
          </span>
        )}
        <span className="ml-auto normal-case tracking-normal text-textMuted/60">{formatDate(post.date)}</span>
      </div>
      <h3 className="mt-3 font-heading text-lg text-textPrimary/95">{post.title}</h3>
      <p className="mt-2 line-clamp-3 text-sm text-textMuted">{post.description}</p>
      <span className="mt-3 inline-block text-xs font-medium text-accent">Read →</span>
    </Link>
  );
}
