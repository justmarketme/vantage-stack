"use client";

import { useState } from "react";
import { PostCard } from "./PostCard";
import { PILLARS } from "../../lib/blog/config";
import type { PostSummary } from "../../lib/blog/posts";

export function BlogIndexClient({ posts }: { posts: PostSummary[] }) {
  const [active, setActive] = useState<string | null>(null);

  const pillarsPresent = PILLARS.filter((p) => posts.some((post) => post.pillar === p.value));
  const shown = active ? posts.filter((p) => p.pillar === active) : posts;

  return (
    <>
      {pillarsPresent.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          <FilterBtn label="All" active={active === null} onClick={() => setActive(null)} />
          {pillarsPresent.map((p) => (
            <FilterBtn key={p.value} label={p.label} active={active === p.value} onClick={() => setActive(p.value)} />
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="mt-8 text-sm text-textMuted">No published posts yet — check back soon.</p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => (
            <PostCard key={p.slug} post={p} />
          ))}
        </div>
      )}
    </>
  );
}

function FilterBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
        active
          ? "border-accent/50 bg-accent/15 text-accent"
          : "border-white/10 text-textMuted hover:bg-white/5 hover:text-textPrimary"
      }`}
    >
      {label}
    </button>
  );
}
