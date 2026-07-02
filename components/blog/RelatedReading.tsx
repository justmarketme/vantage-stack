import { pillarSummaries } from "../../lib/blog/posts";
import { pillarLabel } from "../../lib/blog/config";
import { PostCard } from "./PostCard";

// Server component. Renders a pillar's posts as a "Related reading" section on
// landing pages (and "More in this pillar" on posts). Returns null when there
// are no listable posts for the pillar, so it never leaves an empty section.
export function RelatedReading({
  pillar,
  excludeSlug,
  heading = "Related reading",
}: {
  pillar: string;
  excludeSlug?: string;
  heading?: string;
}) {
  const posts = pillarSummaries(pillar)
    .filter((p) => p.slug !== excludeSlug)
    .slice(0, 3);
  if (posts.length === 0) return null;

  return (
    <section className="vs-section border-t border-white/5 bg-black/40">
      <div className="vs-container">
        <p className="vs-section-heading">From the blog</p>
        <h2 className="vs-section-title">
          {heading} — {pillarLabel(pillar)}
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (
            <PostCard key={p.slug} post={p} />
          ))}
        </div>
      </div>
    </section>
  );
}
