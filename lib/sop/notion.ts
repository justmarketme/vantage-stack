import type { SopProjectBrief } from "./schema";

function env(name: string): string {
  return (process.env[name] || "").trim();
}

const NOTION_VERSION = env("NOTION_VERSION") || "2022-06-28";

/** Accepts full Notion page URL or bare path; returns API page_id (UUID with hyphens). */
export function parseNotionPageIdFromUrlOrId(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // Already a UUID (with or without hyphens)
  const compact = s.replace(/-/g, "");
  if (/^[0-9a-f]{32}$/i.test(compact)) {
    return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`.toLowerCase();
  }

  try {
    const withProtocol = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    const u = new URL(withProtocol);
    const path = u.pathname;
    // .../Title-32hex or .../32hex
    const m32 = path.match(/([0-9a-f]{32})(?=\/|\?|$)/i);
    if (m32) {
      const h = m32[1];
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`.toLowerCase();
    }
  } catch {
    // ignore
  }
  return null;
}

/** Parent page for new SOP roots: NOTION_ROOT_PARENT_PAGE_ID, or parsed from NOTION_PARENT_PAGE_URL. */
export function getNotionParentPageId(): string | null {
  const explicit = env("NOTION_ROOT_PARENT_PAGE_ID");
  if (explicit) {
    const id = parseNotionPageIdFromUrlOrId(explicit);
    return id;
  }
  const url = env("NOTION_PARENT_PAGE_URL");
  if (url) return parseNotionPageIdFromUrlOrId(url);
  return null;
}

function hasNotionConfig() {
  return !!env("NOTION_API_TOKEN") && !!getNotionParentPageId();
}

type NotionCreatePageResult = { pageId: string; url?: string };

async function notionFetch<T>(path: string, init: RequestInit): Promise<T> {
  const token = env("NOTION_API_TOKEN");
  if (!token) throw new Error("NOTION_API_TOKEN missing");

  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Notion API failed (${res.status}): ${text}`);
  return JSON.parse(text) as T;
}

function escapeRichTextContent(s: string) {
  return s.replace(/\u0000/g, "");
}

function markdownToNotionBlocks(markdown: string): any[] {
  const lines = String(markdown ?? "").split(/\r?\n/);
  const blocks: any[] = [];

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      // Notion doesn't support empty blocks; skip.
      continue;
    }

    // Headings (very small subset).
    if (line.startsWith("### ")) {
      blocks.push({
        object: "block",
        type: "heading_3",
        heading_3: { rich_text: [{ type: "text", text: { content: escapeRichTextContent(line.slice(4)) } }] },
      });
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push({
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: [{ type: "text", text: { content: escapeRichTextContent(line.slice(3)) } }] },
      });
      continue;
    }

    // Bullets (single-level).
    if (/^-\s+/.test(line)) {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: [{ type: "text", text: { content: escapeRichTextContent(line.replace(/^-+\s+/, "")) } }] },
      });
      continue;
    }

    // Code fences: keep as plain paragraph; Notion code block formatting is more complex.
    if (line.startsWith("```")) {
      blocks.push({
        object: "block",
        type: "code",
        code: { rich_text: [{ type: "text", text: { content: escapeRichTextContent(line) } }] },
      });
      continue;
    }

    blocks.push({
      object: "block",
      type: "paragraph",
      paragraph: { rich_text: [{ type: "text", text: { content: escapeRichTextContent(line) } }] },
    });
  }

  return blocks;
}

async function notionCreatePage(params: { parentPageId: string; title: string; markdown: string }): Promise<NotionCreatePageResult> {
  const payload: any = {
    parent: { type: "page_id", page_id: params.parentPageId },
    properties: { title: { title: [{ type: "text", text: { content: params.title } }] } },
    children: markdownToNotionBlocks(params.markdown),
  };

  const out = await notionFetch<{ id: string }>(`/pages`, { method: "POST", body: JSON.stringify(payload) });
  return { pageId: out.id, url: `https://www.notion.so/${out.id.replaceAll("-", "")}` };
}

export async function createNotionWorkspaceForSop(params: {
  brief: SopProjectBrief;
  rootTitle: string;
  sections: Array<{ title: string; markdown: string }>;
}): Promise<{
  notionWorkspaceUrl: string | null;
  notionRootPageId: string | null;
  notionPageIdsByTitle: Record<string, string>;
}> {
  if (!hasNotionConfig()) return { notionWorkspaceUrl: null, notionRootPageId: null, notionPageIdsByTitle: {} };

  const parentId = getNotionParentPageId();
  if (!parentId) throw new Error("Set NOTION_PARENT_PAGE_URL (full page URL) or NOTION_ROOT_PARENT_PAGE_ID (UUID).");

  // Root workspace page.
  const root = await notionCreatePage({
    parentPageId: parentId,
    title: params.rootTitle,
    markdown: `## ${params.brief.project_name}\nClient: ${params.brief.client_name}\n\nGenerated SOP workspace.`,
  });

  const pageIdsByTitle: Record<string, string> = {};
  for (const section of params.sections) {
    const created = await notionCreatePage({
      parentPageId: root.pageId,
      title: section.title,
      markdown: section.markdown,
    });
    pageIdsByTitle[section.title] = created.pageId;
  }

  return {
    notionWorkspaceUrl: root.url ?? null,
    notionRootPageId: root.pageId,
    notionPageIdsByTitle: pageIdsByTitle,
  };
}

export async function writeNotionPagesUnderRoot(params: {
  rootPageId: string;
  sections: Array<{ title: string; markdown: string }>;
}): Promise<Record<string, string>> {
  if (!hasNotionConfig()) return {};
  const pageIdsByTitle: Record<string, string> = {};

  for (const section of params.sections) {
    const created = await notionCreatePage({
      parentPageId: params.rootPageId,
      title: section.title,
      markdown: section.markdown,
    }).catch(() => null);
    if (created?.pageId) pageIdsByTitle[section.title] = created.pageId;
  }

  return pageIdsByTitle;
}

export async function upsertNotionOptimizationBacklog(params: {
  projectRootPageId: string | null;
  backlogPageId: string | null;
  title: string;
  items: Array<{
    id: string;
    version_number: number;
    priorityLabel: string;
    change_description: string;
    impact: string;
    effort: string;
    tradeoffs: string;
  }>;
}): Promise<{ backlogPageId: string | null }> {
  if (!hasNotionConfig() || !params.projectRootPageId) {
    return { backlogPageId: params.backlogPageId };
  }

  // If we don't have a backlog page yet, create it.
  if (!params.backlogPageId) {
    const created = await notionCreatePage({
      parentPageId: params.projectRootPageId,
      title: "OPTIMIZATION BACKLOG",
      markdown:
        `## ${params.title}\n\n` +
        params.items
          .map(
            (it) =>
              `- [ ] ${it.priorityLabel}: v${it.version_number} (${it.impact} / ${it.effort})\n  - Change: ${it.change_description}\n  - Trade-offs: ${it.tradeoffs}`,
          )
          .join("\n"),
    });
    return { backlogPageId: created.pageId };
  }

  // Update strategy: append a short summary block (safe + idempotent enough for automation).
  // Notion block append requires more bookkeeping; we do best-effort for now.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const token = env("NOTION_API_TOKEN");
  if (!token) return { backlogPageId: params.backlogPageId };

  const children = params.items.map((it) => ({
    object: "block",
    type: "to_do",
    to_do: {
      rich_text: [{ type: "text", text: { content: `v${it.version_number}: ${it.change_description}` } }],
      checked: false,
    },
  }));

  // Append to backlog page children.
  await notionFetch(`/blocks/${encodeURIComponent(params.backlogPageId)}/children`, {
    method: "PATCH",
    body: JSON.stringify({ children }),
  });

  return { backlogPageId: params.backlogPageId };
}

export async function updateNotionTechStackSelection(params: {
  pageId: string | null;
  content: string;
}): Promise<void> {
  if (!hasNotionConfig() || !params.pageId) return;

  // Best-effort: replace existing children with appended section.
  // This is simplified; for production you'd fetch current blocks and patch precisely.
  const children = markdownToNotionBlocks(`## Latest review\n${params.content}`);
  await notionFetch(`/blocks/${encodeURIComponent(params.pageId)}/children`, {
    method: "PATCH",
    body: JSON.stringify({ children }),
  }).catch(() => {});
}

