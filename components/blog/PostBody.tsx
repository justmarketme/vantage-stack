"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";

// Renders trusted post markdown through the design system. remark-gfm gives us
// GFM tables. Internal links (/route) use next/link for client nav.
export function PostBody({ markdown }: { markdown: string }) {
  return (
    <div className="text-[0.95rem] md:text-base">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ node, ...p }) => <h2 className="mb-3 mt-10 font-heading text-2xl text-textPrimary" {...p} />,
          h3: ({ node, ...p }) => <h3 className="mb-2 mt-8 font-heading text-lg text-textPrimary/95" {...p} />,
          p: ({ node, ...p }) => <p className="my-4 leading-relaxed text-textMuted" {...p} />,
          ul: ({ node, ...p }) => <ul className="my-4 list-disc space-y-1.5 pl-5 text-textMuted" {...p} />,
          ol: ({ node, ...p }) => <ol className="my-4 list-decimal space-y-1.5 pl-5 text-textMuted" {...p} />,
          li: ({ node, ...p }) => <li className="leading-relaxed" {...p} />,
          strong: ({ node, ...p }) => <strong className="font-semibold text-textPrimary" {...p} />,
          em: ({ node, ...p }) => <em className="text-textPrimary/90" {...p} />,
          hr: () => <hr className="my-8 border-white/10" />,
          blockquote: ({ node, ...p }) => (
            <blockquote className="my-4 border-l-2 border-accent pl-4 italic text-textMuted" {...p} />
          ),
          code: ({ node, ...p }) => (
            <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[0.85em] text-textPrimary" {...p} />
          ),
          a: ({ node, href, ...p }) => {
            const h = href ?? "#";
            return h.startsWith("/") ? (
              <Link href={h} className="font-medium text-accent hover:underline" {...p} />
            ) : (
              <a href={h} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline" {...p} />
            );
          },
          table: ({ node, ...p }) => (
            <div className="my-6 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm" {...p} />
            </div>
          ),
          thead: ({ node, ...p }) => <thead className="bg-surface text-textPrimary" {...p} />,
          th: ({ node, ...p }) => (
            <th className="border-b border-white/10 px-4 py-3 text-left font-heading font-medium" {...p} />
          ),
          td: ({ node, ...p }) => <td className="border-b border-white/10 px-4 py-3 text-textMuted" {...p} />,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
