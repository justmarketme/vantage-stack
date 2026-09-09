import type { Metadata } from "next";
import { Navbar } from "../../components/layout/Navbar";
import { Footer } from "../../components/layout/Footer";
import { BLOG_BEHIND_REVIEW } from "../../lib/blog/config";

// Real app shell for the blog. While BLOG_BEHIND_REVIEW, the whole blog is
// noindex (per-post metadata may also set noindex for drafts). Remove at go-live
// by flipping BLOG_BEHIND_REVIEW in lib/blog/config.ts.
export const metadata: Metadata = BLOG_BEHIND_REVIEW ? { robots: { index: false, follow: false } } : {};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <Navbar />
      <main className="pt-28">{children}</main>
      <Footer />
    </div>
  );
}
