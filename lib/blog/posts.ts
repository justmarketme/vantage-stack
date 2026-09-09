import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { BLOG_BEHIND_REVIEW } from "./config";

// Server-only: reads content/blog/*.md at build/request time.
const BLOG_DIR = path.join(process.cwd(), "content", "blog");

export type PostFrontmatter = {
  title: string;
  slug: string;
  meta_description: string;
  primary_keyword?: string;
  secondary_keywords?: string[];
  pillar: string;
  internal_links?: string[];
  author: string;
  date: string;
  status: string;
};

export type FaqItem = { question: string; answer: string };

export type Post = {
  slug: string;
  frontmatter: PostFrontmatter;
  approved: boolean;
  tldr: string | null;
  body: string; // markdown minus the leading H1, the TL;DR line, and review comments
  faq: FaqItem[];
  reviewNotes: string[];
};

// Slim, serialisable shape for listings (safe to pass to client components).
export type PostSummary = {
  slug: string;
  title: string;
  description: string;
  date: string;
  pillar: string;
  approved: boolean;
};

export function isApproved(status: string | undefined): boolean {
  return (status ?? "").trim().toLowerCase().startsWith("approved");
}

function stripLeadingH1(md: string): string {
  return md.replace(/^\s*#\s+.*(?:\r?\n)+/, "");
}

function extractReviewNotes(md: string): { notes: string[]; rest: string } {
  const notes: string[] = [];
  const rest = md.replace(/<!--\s*>>>\s*REVIEW:?\s*([\s\S]*?)-->/gi, (_m, p1) => {
    notes.push(String(p1).trim());
    return "";
  });
  return { notes, rest };
}

function extractTldr(md: string): { tldr: string | null; rest: string } {
  const lines = md.split(/\r?\n/);
  const idx = lines.findIndex((l) => /^\*\*TL;DR:?\*\*/i.test(l.trim()));
  if (idx === -1) return { tldr: null, rest: md };
  const tldr = lines[idx].trim().replace(/^\*\*TL;DR:?\*\*\s*/i, "").trim();
  lines.splice(idx, 1);
  return { tldr, rest: lines.join("\n") };
}

// Parse the "## Frequently asked questions" (or "## FAQ") section: each
// bold-only line is a question, following prose is its answer.
function extractFaq(md: string): FaqItem[] {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{2,3}\s+(frequently asked questions|faqs?)\b/i.test(l.trim()));
  if (start === -1) return [];
  const items: FaqItem[] = [];
  let q: string | null = null;
  let a: string[] = [];
  const flush = () => {
    if (q) items.push({ question: q, answer: a.join(" ").replace(/\s+/g, " ").trim() });
    q = null;
    a = [];
  };
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^#{1,3}\s+/.test(t)) break; // next heading ends the FAQ
    if (/^-{3,}\s*$/.test(t)) break; // horizontal rule ends the FAQ
    const qm = t.match(/^\*\*(.+?)\*\*:?\s*$/); // whole line is bold -> a question
    if (qm) {
      flush();
      q = qm[1].trim();
      continue;
    }
    if (q && t) a.push(t);
  }
  flush();
  return items;
}

let cache: Post[] | null = null;

export function getAllPosts(): Post[] {
  if (cache) return cache;
  let files: string[] = [];
  try {
    files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
  const posts = files.map((file) => {
    const raw = fs.readFileSync(path.join(BLOG_DIR, file), "utf8");
    const { data, content } = matter(raw);
    const fm = data as PostFrontmatter;
    const slug = (fm.slug || file.replace(/\.md$/, "")).trim();
    let md = stripLeadingH1(content);
    const rev = extractReviewNotes(md);
    md = rev.rest;
    const tl = extractTldr(md);
    md = tl.rest;
    const faq = extractFaq(md);
    return {
      slug,
      frontmatter: { ...fm, slug },
      approved: isApproved(fm.status),
      tldr: tl.tldr,
      body: md.trim(),
      faq,
      reviewNotes: rev.notes,
    } satisfies Post;
  });
  posts.sort((x, y) => (x.frontmatter.date < y.frontmatter.date ? 1 : -1)); // newest first
  cache = posts;
  return posts;
}

export function getPostBySlug(slug: string): Post | null {
  return getAllPosts().find((p) => p.slug === slug) ?? null;
}

// Posts eligible for listings: approved always; drafts too while behind review.
export function getListablePosts(): Post[] {
  return getAllPosts().filter((p) => p.approved || BLOG_BEHIND_REVIEW);
}

export function toSummary(p: Post): PostSummary {
  return {
    slug: p.slug,
    title: p.frontmatter.title,
    description: p.frontmatter.meta_description,
    date: p.frontmatter.date,
    pillar: p.frontmatter.pillar,
    approved: p.approved,
  };
}

export function listSummaries(): PostSummary[] {
  return getListablePosts().map(toSummary);
}

export function pillarSummaries(pillar: string): PostSummary[] {
  return getListablePosts()
    .filter((p) => p.frontmatter.pillar === pillar)
    .map(toSummary);
}
