"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type ClientProfile = {
  id: string;
  name: string;
  email?: string;
  company?: string;
  industry?: string;
  website_url?: string;
  whatsapp?: string;
  monthly_budget?: number;
  success_goals?: string;
  current_marketing?: string;
  challenges?: string[] | string;
  competitors?: string[] | string;
  tools_used?: string[] | string;
  revenue_range?: string;
  status: string;
  created_at: string;
  blueprint_markdown?: string | null;
  social_instagram?: string | null;
  social_tiktok?: string | null;
  social_facebook?: string | null;
  social_x?: string | null;
  social_youtube?: string | null;
  social_insights?: unknown;
};

type Report = {
  id: string;
  report_type: string;
  created_at: string;
  status?: string;
};

type Tab = "intake" | "research" | "blueprint" | "send";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "intake", label: "Intake Form", icon: "📝" },
  { key: "research", label: "Research", icon: "🔍" },
  { key: "blueprint", label: "Blueprint", icon: "📋" },
  { key: "send", label: "Send to Client", icon: "📤" },
];

// ─── Blueprint Renderer ───────────────────────────────────────────────────────

type ParsedSection = {
  heading: string;
  level: number;
  body: string[];
};

function parseBlueprint(md: string): ParsedSection[] {
  const lines = md.split("\n");
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;

  for (const line of lines) {
    const h2 = line.match(/^## (.+)/);
    const h3 = line.match(/^### (.+)/);
    const h1 = line.match(/^# (.+)/);

    if (h1) {
      if (current) sections.push(current);
      current = { heading: h1[1], level: 1, body: [] };
    } else if (h2) {
      if (current) sections.push(current);
      current = { heading: h2[1], level: 2, body: [] };
    } else if (h3) {
      if (current) sections.push(current);
      current = { heading: h3[1], level: 3, body: [] };
    } else {
      if (current) current.body.push(line);
    }
  }
  if (current) sections.push(current);
  return sections;
}

function renderLine(line: string, idx: number): React.ReactNode {
  if (!line.trim() || line === "---") return null;

  // Table row detection
  if (line.startsWith("|")) {
    return null; // handled by block renderer
  }

  // Bullet list
  if (line.match(/^[-*] /)) {
    const text = line.replace(/^[-*] /, "");
    return (
      <li key={idx} className="flex items-start gap-2 text-sm text-textPrimary/80">
        <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent/60" />
        <span dangerouslySetInnerHTML={{ __html: formatInline(text) }} />
      </li>
    );
  }

  // Numbered list
  if (line.match(/^\d+\. /)) {
    const num = line.match(/^(\d+)\. /)?.[1];
    const text = line.replace(/^\d+\. /, "");
    return (
      <li key={idx} className="flex items-start gap-3 text-sm text-textPrimary/80">
        <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent/20 text-[10px] font-bold text-accent">
          {num}
        </span>
        <span dangerouslySetInnerHTML={{ __html: formatInline(text) }} />
      </li>
    );
  }

  // Blockquote / callout
  if (line.startsWith(">")) {
    const text = line.replace(/^>\s*/, "");
    return (
      <div key={idx} className="rounded-lg border-l-2 border-accent bg-accent/5 px-4 py-3">
        <p className="text-sm text-textPrimary/90 leading-relaxed" dangerouslySetInnerHTML={{ __html: formatInline(text) }} />
      </div>
    );
  }

  // Bold key-value pair: **Key:** Value
  if (line.match(/^\*\*[^*]+:\*\*/)) {
    return (
      <p key={idx} className="text-sm text-textPrimary/80 leading-relaxed" dangerouslySetInnerHTML={{ __html: formatInline(line) }} />
    );
  }

  // Plain text
  if (line.trim()) {
    return (
      <p key={idx} className="text-sm text-textPrimary/80 leading-relaxed" dangerouslySetInnerHTML={{ __html: formatInline(line) }} />
    );
  }

  return null;
}

function formatInline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-textPrimary">$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em class="italic text-textPrimary/70">$1</em>')
    .replace(/`([^`]+)`/g, '<code class="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs text-accent">$1</code>');
}

function renderTableBlock(lines: string[]): React.ReactNode {
  const rows = lines.filter((l) => l.startsWith("|") && !l.match(/^\|[-| ]+\|$/));
  if (rows.length === 0) return null;

  const parseRow = (row: string) =>
    row
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

  const [header, ...body] = rows;
  const headerCells = parseRow(header);

  return (
    <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/[0.08] bg-white/[0.03]">
            {headerCells.map((c, i) => (
              <th key={i} className="px-4 py-2.5 text-left font-semibold text-textMuted uppercase tracking-wider">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
              {parseRow(row).map((c, ci) => (
                <td
                  key={ci}
                  className={`px-4 py-2.5 ${ci === 0 ? "font-medium text-textPrimary" : "text-textPrimary/70"}`}
                  dangerouslySetInnerHTML={{ __html: formatInline(c) }}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionIcon({ heading }: { heading: string }) {
  const h = heading.toLowerCase();
  if (h.includes("business") || h.includes("overview")) return <span className="text-blue-400">🏢</span>;
  if (h.includes("competitor")) return <span className="text-amber-400">⚔️</span>;
  if (h.includes("benchmark") || h.includes("industry")) return <span className="text-purple-400">📊</span>;
  if (h.includes("gap") || h.includes("revenue") || h.includes("opportunity")) return <span className="text-emerald-400">💰</span>;
  if (h.includes("strategy") || h.includes("recommend")) return <span className="text-accent">🎯</span>;
  if (h.includes("website") || h.includes("seo")) return <span className="text-blue-400">🌐</span>;
  if (h.includes("paid") || h.includes("ads")) return <span className="text-amber-400">📢</span>;
  if (h.includes("content") || h.includes("social")) return <span className="text-pink-400">✍️</span>;
  if (h.includes("analytics") || h.includes("tracking")) return <span className="text-cyan-400">📈</span>;
  if (h.includes("next step")) return <span className="text-emerald-400">✅</span>;
  if (h.includes("goal") || h.includes("objective")) return <span className="text-accent">🎯</span>;
  if (h.includes("challenge")) return <span className="text-rose-400">⚠️</span>;
  if (h.includes("tool") || h.includes("platform")) return <span className="text-cyan-400">🛠️</span>;
  if (h.includes("marketing")) return <span className="text-pink-400">📣</span>;
  if (h.includes("research")) return <span className="text-purple-400">🔬</span>;
  return <span className="text-textMuted">📌</span>;
}

function renderSectionBody(lines: string[]): React.ReactNode {
  const nonEmpty = lines.filter((l) => l.trim() && l !== "---");

  // Check if there's a table
  const hasTable = nonEmpty.some((l) => l.startsWith("|"));
  if (hasTable) {
    const tableLines = nonEmpty.filter((l) => l.startsWith("|"));
    const otherLines = nonEmpty.filter((l) => !l.startsWith("|"));
    const hasBullets = otherLines.some((l) => l.match(/^[-*\d]/));

    return (
      <div className="space-y-3">
        {otherLines.length > 0 && (
          <div className={hasBullets ? "space-y-1.5" : "space-y-2"}>
            {hasBullets ? (
              <ul className="space-y-1.5">{otherLines.map((l, i) => renderLine(l, i))}</ul>
            ) : (
              otherLines.map((l, i) => renderLine(l, i))
            )}
          </div>
        )}
        {renderTableBlock(tableLines)}
      </div>
    );
  }

  const hasBullets = nonEmpty.some((l) => l.match(/^[-*] /));
  const hasNumbered = nonEmpty.some((l) => l.match(/^\d+\. /));
  const hasBlockquote = nonEmpty.some((l) => l.startsWith(">"));

  if (hasBullets) {
    const bullets = nonEmpty.filter((l) => l.match(/^[-*] /));
    const rest = nonEmpty.filter((l) => !l.match(/^[-*] /));
    return (
      <div className="space-y-3">
        {rest.map((l, i) => renderLine(l, i))}
        <ul className="space-y-1.5">{bullets.map((l, i) => renderLine(l, i))}</ul>
      </div>
    );
  }

  if (hasNumbered) {
    const numbered = nonEmpty.filter((l) => l.match(/^\d+\. /));
    const rest = nonEmpty.filter((l) => !l.match(/^\d+\. /));
    return (
      <div className="space-y-3">
        {rest.map((l, i) => renderLine(l, i))}
        <ol className="space-y-2">{numbered.map((l, i) => renderLine(l, i))}</ol>
      </div>
    );
  }

  if (hasBlockquote) {
    return <div className="space-y-2">{nonEmpty.map((l, i) => renderLine(l, i))}</div>;
  }

  return <div className="space-y-2">{nonEmpty.map((l, i) => renderLine(l, i))}</div>;
}

function BlueprintRenderer({ markdown, clientName, company }: { markdown: string; clientName: string; company?: string }) {
  const sections = parseBlueprint(markdown);
  const header = sections.find((s) => s.level === 1);
  // Skip level-1 (title) and the subtitle h2 that contains "Generated:" in its body
  const bodySections = sections.filter((s) => {
    if (s.level < 2) return false;
    // Skip the subtitle section (e.g. "## Thabo Nkosi — Company" with Generated date)
    if (s.level === 2 && s.body.some((l) => l.startsWith("Generated:"))) return false;
    return true;
  });

  // Group h3s under their parent h2
  const grouped: { section: ParsedSection; children: ParsedSection[] }[] = [];
  for (const s of bodySections) {
    if (s.level === 2) {
      grouped.push({ section: s, children: [] });
    } else if (s.level === 3 && grouped.length > 0) {
      grouped[grouped.length - 1].children.push(s);
    }
  }

  const generatedDate = header?.body.find((l) => l.startsWith("Generated:"))?.replace("Generated:", "").trim();

  return (
    <div className="space-y-4">
      {/* Document Header */}
      <div className="rounded-xl border border-white/[0.08] bg-gradient-to-br from-[#1a1025] to-[#16161A] overflow-hidden">
        <div className="border-b border-white/[0.06] bg-purple-500/5 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-purple-400/80">VantageStack</span>
                <span className="text-purple-500/40">·</span>
                <span className="text-[10px] tracking-widest uppercase text-textMuted/50">Digital Blueprint</span>
              </div>
              <h2 className="text-xl font-bold text-textPrimary">{company || clientName}</h2>
              {company && company !== clientName && (
                <p className="text-sm text-textMuted mt-0.5">{clientName}</p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-[10px] font-semibold text-purple-300">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
                CONFIDENTIAL
              </div>
              {generatedDate && (
                <p className="text-xs text-textMuted/50 mt-2">{generatedDate}</p>
              )}
            </div>
          </div>
        </div>

        {/* Key stats strip from Business Overview */}
        {(() => {
          const overview = grouped.find((g) => g.section.heading.toLowerCase().includes("overview") || g.section.heading.toLowerCase().includes("business"));
          if (!overview) return null;
          const kvLines = overview.section.body.filter((l) => l.match(/^\*\*[^*]+:\*\*/));
          if (kvLines.length === 0) return null;
          const pairs = kvLines.map((l) => {
            const m = l.match(/^\*\*([^*]+):\*\*\s*(.*)/);
            return m ? { key: m[1], val: m[2] } : null;
          }).filter(Boolean) as { key: string; val: string }[];

          return (
            <div className="grid grid-cols-2 divide-x divide-y divide-white/[0.05] sm:grid-cols-4">
              {pairs.slice(0, 4).map(({ key, val }) => (
                <div key={key} className="px-5 py-3">
                  <div className="text-[10px] uppercase tracking-wider text-textMuted/50 mb-0.5">{key}</div>
                  <div className="text-sm font-medium text-textPrimary truncate" title={val}>
                    {val.includes("❌") ? (
                      <span className="text-rose-400">{val}</span>
                    ) : val.includes("✅") ? (
                      <span className="text-emerald-400">{val}</span>
                    ) : val}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Body Sections */}
      {grouped.map(({ section, children }, gi) => {
        // Skip the overview since we rendered it in the header
        const isOverview = section.heading.toLowerCase().includes("business overview") || section.heading.match(/^1\./);
        const sectionNum = section.heading.match(/^(\d+)\./)?.[1];
        const sectionTitle = section.heading.replace(/^\d+\.\s*/, "");
        const isEmpty = section.body.filter((l) => l.trim() && l !== "---").length === 0 && children.length === 0;

        if (isEmpty && !children.length) return null;

        // Special style for revenue / opportunity callout
        const isRevenue = sectionTitle.toLowerCase().includes("revenue") || sectionTitle.toLowerCase().includes("opportunity") || sectionTitle.toLowerCase().includes("gap");
        const isNextSteps = sectionTitle.toLowerCase().includes("next step");

        return (
          <div
            key={gi}
            className={`rounded-xl border overflow-hidden ${
              isRevenue
                ? "border-emerald-500/20 bg-emerald-500/5"
                : isNextSteps
                ? "border-accent/20 bg-accent/5"
                : "border-white/[0.08] bg-[#16161A]"
            }`}
          >
            {/* Section header */}
            <div className={`flex items-center gap-3 px-5 py-4 border-b ${
              isRevenue ? "border-emerald-500/10" : isNextSteps ? "border-accent/10" : "border-white/[0.06]"
            }`}>
              {sectionNum && (
                <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  isRevenue ? "bg-emerald-500/20 text-emerald-400" : isNextSteps ? "bg-accent/20 text-accent" : "bg-white/[0.06] text-textMuted"
                }`}>
                  {sectionNum}
                </span>
              )}
              <SectionIcon heading={sectionTitle} />
              <h3 className={`text-sm font-semibold ${isRevenue ? "text-emerald-300" : isNextSteps ? "text-accent" : "text-textPrimary"}`}>
                {sectionTitle}
              </h3>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Section own body (skip overview kv since it's in header strip) */}
              {!isOverview && section.body.filter((l) => l.trim() && l !== "---").length > 0 && (
                renderSectionBody(section.body)
              )}

              {/* Child subsections (h3) */}
              {children.length > 0 && (
                <div className="space-y-4">
                  {children.map((child, ci) => (
                    <div key={ci} className="rounded-lg border border-white/[0.06] bg-black/20 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <SectionIcon heading={child.heading} />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-textMuted">{child.heading}</h4>
                      </div>
                      {renderSectionBody(child.body)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Footer */}
      <div className="rounded-xl border border-white/[0.06] bg-[#16161A] px-6 py-4 text-center">
        <p className="text-xs text-textMuted/50">
          Prepared exclusively for <strong className="text-textMuted">{company || clientName}</strong> by{" "}
          <strong className="text-purple-400/80">VantageStack</strong>. All information is confidential and proprietary.
        </p>
      </div>
    </div>
  );
}

// ─── Social Media Card ────────────────────────────────────────────────────────

const SOCIAL_PLATFORMS = [
  { key: "social_instagram" as const, label: "Instagram", icon: "📸", color: "pink" },
  { key: "social_tiktok"   as const, label: "TikTok",    icon: "🎵", color: "cyan" },
  { key: "social_facebook" as const, label: "Facebook",  icon: "👤", color: "blue" },
  { key: "social_x"        as const, label: "X/Twitter", icon: "✖️",  color: "slate" },
  { key: "social_youtube"  as const, label: "YouTube",   icon: "▶️",  color: "red" },
];

function SocialMediaCard({
  profile,
  onScraped,
}: {
  profile: ClientProfile;
  onScraped: (updated: Partial<ClientProfile>) => void;
}) {
  const [scraping, setScraping] = useState(false);
  const [scrapeMsg, setScrapeMsg] = useState<string | null>(null);

  const activeSocials = SOCIAL_PLATFORMS.filter((p) => profile[p.key]);
  const hasInsights = Boolean(profile.social_insights);

  async function handleScrape() {
    setScraping(true);
    setScrapeMsg(null);
    try {
      const res = await fetch("/api/crm/social-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: profile.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setScrapeMsg(`Error: ${json.error || "Scraping failed"}`);
      } else {
        setScrapeMsg(`✅ Scraped ${json.insightCount} platform(s). Refresh to see insights in blueprint.`);
        onScraped({ social_insights: json.insights });
      }
    } catch (e) {
      setScrapeMsg(`Error: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setScraping(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#16161A] p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-textPrimary">Social Media Profiles</h2>
        {activeSocials.length > 0 && (
          <button
            type="button"
            onClick={handleScrape}
            disabled={scraping}
            className="flex items-center gap-1.5 rounded-lg bg-pink-500/20 border border-pink-500/30 px-3 py-1.5 text-xs font-semibold text-pink-200 hover:bg-pink-500/30 transition disabled:opacity-50"
          >
            {scraping ? "Scraping…" : hasInsights ? "🔄 Re-scrape Socials" : "🔍 Scrape Socials"}
          </button>
        )}
      </div>

      {activeSocials.length === 0 ? (
        <p className="text-sm text-textMuted/60">No social media links provided by this client.</p>
      ) : (
        <div className="flex flex-wrap gap-3 mb-3">
          {activeSocials.map((s) => (
            <a
              key={s.key}
              href={profile[s.key]!}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/5 px-3 py-2 text-xs text-textPrimary hover:bg-white/10 transition"
            >
              <span>{s.icon}</span>
              <span>{s.label}</span>
            </a>
          ))}
        </div>
      )}

      {hasInsights && (
        <p className="text-xs text-green-400 mt-1">✅ Social insights scraped — included in blueprint generation.</p>
      )}
      {scrapeMsg && <p className="text-xs mt-2 text-textMuted">{scrapeMsg}</p>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BlueprintReviewDetail() {
  const { clientId } = useParams<{ clientId: string }>();
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("intake");

  const [blueprintText, setBlueprintText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genErr, setGenErr] = useState<string | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [auditStatus, setAuditStatus] = useState<string | null>(null);
  const [blueprintMode, setBlueprintMode] = useState<"preview" | "edit">("preview");
  const [copied, setCopied] = useState(false);

  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendChannel, setSendChannel] = useState<"email" | "whatsapp">("email");

  const [researchLoading, setResearchLoading] = useState(false);
  const [researchMsg, setResearchMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    fetch(`/api/crm/clients/${clientId}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((detail) => {
        const p: ClientProfile = detail.profile ?? null;
        setProfile(p);
        setReports(detail.reports ?? []);
        if (p?.blueprint_markdown) {
          setBlueprintText(p.blueprint_markdown);
          setTab("blueprint");
        }
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [clientId]);

  async function runResearch() {
    if (!profile) return;
    setResearchLoading(true);
    setResearchMsg(null);
    try {
      const res = await fetch("/api/research/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ client: { id: profile.id, name: profile.name, email: profile.email, website_url: profile.website_url, industry: profile.industry } }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Research trigger failed");
      setResearchMsg("✅ Research job queued! This may take a few minutes.");
    } catch (e: any) {
      setResearchMsg("❌ " + (e.message ?? "Failed to trigger research"));
    } finally {
      setResearchLoading(false);
    }
  }

  async function runAuditAndGenerate() {
    if (!profile) return;
    setAuditing(true);
    setGenErr(null);
    setAuditStatus("Running PageSpeed, SEO scan, domain lookup & ad check…");
    try {
      const res = await fetch(`/api/crm/blueprint-review/${clientId}/enrich`, { method: "POST", credentials: "same-origin" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Audit failed");
      setBlueprintText(j.blueprint ?? "");
      setAuditStatus(null);
      setTab("blueprint");
      setBlueprintMode("preview");
    } catch (e: any) {
      setGenErr(e.message ?? "Audit failed");
      setAuditStatus(null);
    } finally {
      setAuditing(false);
    }
  }

  async function generateBlueprint() {
    if (!profile) return;
    setGenerating(true);
    setGenErr(null);
    try {
      const res = await fetch(`/api/crm/blueprint-review/${clientId}/generate`, { method: "POST", credentials: "same-origin" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Generation failed");
      setBlueprintText(j.blueprint ?? "");
      setTab("blueprint");
      setBlueprintMode("preview");
    } catch (e: any) {
      setGenErr(e.message ?? "Failed to generate blueprint");
    } finally {
      setGenerating(false);
    }
  }

  async function sendBlueprint() {
    if (!profile || !blueprintText) return;
    setSending(true);
    setSendErr(null);
    setSendSuccess(false);
    try {
      const res = await fetch(`/api/crm/blueprint-review/${clientId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ channel: sendChannel, blueprint: blueprintText }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Send failed");
      setSendSuccess(true);
    } catch (e: any) {
      setSendErr(e.message ?? "Failed to send");
    } finally {
      setSending(false);
    }
  }

  function toStr(v: string[] | string | undefined): string {
    if (!v) return "";
    if (Array.isArray(v)) return v.join(", ");
    return String(v);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-textMuted py-12">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-accent" />
        Loading client data…
      </div>
    );
  }

  if (err || !profile) {
    return (
      <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300">
        {err ?? "Client not found"}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back + Header */}
      <div>
        <Link href="/crm/blueprint-review" className="text-xs text-textMuted hover:text-textPrimary flex items-center gap-1 mb-4">
          ← Blueprint Review
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-textPrimary">{profile.name}</h1>
            <p className="text-sm text-textMuted mt-1">
              {profile.company && <span>{profile.company} · </span>}
              {profile.industry && <span>{profile.industry} · </span>}
              <span className="inline-flex items-center rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-300 ml-1">
                Blueprint Submitted
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            <Link href={`/crm/clients/${clientId}/edit`} className="rounded-lg bg-white/5 border border-white/[0.08] px-4 py-2 text-sm font-semibold text-textMuted hover:bg-white/10 transition">
              Edit Client
            </Link>
            <Link href={`/crm/clients/${clientId}`} className="rounded-lg bg-white/5 border border-white/[0.08] px-4 py-2 text-sm font-semibold text-textMuted hover:bg-white/10 transition">
              Full Profile
            </Link>
          </div>
        </div>
      </div>

      {/* Progress Tabs */}
      <div className="flex items-center gap-0">
        {TABS.map((t, i) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 border-b-2 text-sm font-semibold transition ${
              tab === t.key ? "border-accent text-accent" : "border-white/[0.08] text-textMuted hover:text-textPrimary"
            }`}
          >
            <span>{t.icon}</span>
            <span className="hidden sm:block">{t.label}</span>
            <span className="ml-1 text-xs text-textMuted/50">({i + 1})</span>
          </button>
        ))}
      </div>

      {/* ── Intake Tab ── */}
      {tab === "intake" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/[0.08] bg-[#16161A] p-6">
            <h2 className="text-base font-semibold text-textPrimary mb-5">Client Intake Information</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { label: "Full Name", value: profile.name },
                { label: "Email", value: profile.email },
                { label: "Company", value: profile.company },
                { label: "Industry", value: profile.industry },
                { label: "Website", value: profile.website_url },
                { label: "WhatsApp", value: profile.whatsapp },
                { label: "Revenue Range", value: profile.revenue_range },
                { label: "Monthly Budget", value: profile.monthly_budget ? `R${profile.monthly_budget.toLocaleString()}` : undefined },
              ].filter((f) => f.value).map((f) => (
                <div key={f.label}>
                  <div className="text-xs uppercase tracking-wider text-textMuted/50 mb-1">{f.label}</div>
                  <div className="text-sm text-textPrimary">{f.value}</div>
                </div>
              ))}
            </div>
            {profile.success_goals && (
              <div className="mt-5">
                <div className="text-xs uppercase tracking-wider text-textMuted/50 mb-1">Business Goals</div>
                <p className="text-sm text-textPrimary leading-relaxed">{profile.success_goals}</p>
              </div>
            )}
            {profile.challenges && (
              <div className="mt-4">
                <div className="text-xs uppercase tracking-wider text-textMuted/50 mb-1">Current Challenges</div>
                {Array.isArray(profile.challenges) ? (
                  <ul className="list-disc list-inside space-y-1">
                    {profile.challenges.map((c: string, i: number) => <li key={i} className="text-sm text-textPrimary">{c}</li>)}
                  </ul>
                ) : (
                  <p className="text-sm text-textPrimary leading-relaxed">{String(profile.challenges)}</p>
                )}
              </div>
            )}
            {profile.competitors && (
              <div className="mt-4">
                <div className="text-xs uppercase tracking-wider text-textMuted/50 mb-1">Known Competitors</div>
                {Array.isArray(profile.competitors) ? (
                  <div className="flex flex-wrap gap-2">
                    {profile.competitors.map((c: string, i: number) => (
                      <span key={i} className="rounded-full bg-white/5 border border-white/[0.08] px-3 py-1 text-xs text-textPrimary">{c}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-textPrimary leading-relaxed">{String(profile.competitors)}</p>
                )}
              </div>
            )}
            {profile.current_marketing && (
              <div className="mt-4">
                <div className="text-xs uppercase tracking-wider text-textMuted/50 mb-1">Current Marketing</div>
                <p className="text-sm text-textPrimary leading-relaxed">{profile.current_marketing}</p>
              </div>
            )}
            {profile.tools_used && (
              <div className="mt-4">
                <div className="text-xs uppercase tracking-wider text-textMuted/50 mb-1">Tools & Platforms Used</div>
                {Array.isArray(profile.tools_used) ? (
                  <div className="flex flex-wrap gap-2">
                    {profile.tools_used.map((t: string, i: number) => (
                      <span key={i} className="rounded-full bg-blue-500/10 border border-blue-500/20 px-3 py-1 text-xs text-blue-300">{t}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-textPrimary leading-relaxed">{String(profile.tools_used)}</p>
                )}
              </div>
            )}
          </div>

          {/* Social media card */}
          <SocialMediaCard profile={profile} onScraped={(updated) => setProfile((p) => p ? { ...p, ...updated } : p)} />

          <button type="button" onClick={() => setTab("research")} className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white hover:bg-accent/90 transition">
            Next: Run Research →
          </button>
        </div>
      )}

      {/* ── Research Tab ── */}
      {tab === "research" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/[0.08] bg-[#16161A] p-6">
            <h2 className="text-base font-semibold text-textPrimary mb-2">Research Pipeline</h2>
            <p className="text-sm text-textMuted mb-6">
              Run the automated research pipeline to gather competitor data, SEO analysis, website audit, and industry insights.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 mb-6">
              {[
                { icon: "🌐", title: "Website Audit", desc: "PageSpeed, technical SEO, Core Web Vitals" },
                { icon: "🔍", title: "SEO Analysis", desc: "Keyword opportunities, backlink profile" },
                { icon: "⚔️", title: "Competitor Research", desc: "Traffic estimates, ad spend, positioning" },
                { icon: "📰", title: "Industry Intelligence", desc: "Market trends, news, opportunities" },
                { icon: "📊", title: "SimilarWeb Data", desc: "Traffic sources and audience demographics" },
                { icon: "📋", title: "WHOIS & Domain", desc: "Domain age, history, technical details" },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-3 rounded-lg border border-white/[0.06] bg-black/20 p-3">
                  <span className="text-xl">{item.icon}</span>
                  <div>
                    <div className="text-sm font-semibold text-textPrimary">{item.title}</div>
                    <div className="text-xs text-textMuted mt-0.5">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            {reports.length > 0 && (
              <div className="mb-5">
                <div className="text-xs uppercase tracking-wider text-textMuted/50 mb-2">Existing Reports ({reports.length})</div>
                <div className="space-y-2">
                  {reports.map((r) => (
                    <div key={r.id} className="flex items-center justify-between rounded-lg bg-black/20 border border-white/[0.06] px-4 py-2.5">
                      <div>
                        <span className="text-sm font-medium text-textPrimary">{r.report_type}</span>
                        <span className="ml-3 text-xs text-textMuted">{String(r.created_at).slice(0, 10)}</span>
                      </div>
                      <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">Complete</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={runResearch}
              disabled={researchLoading}
              className="flex items-center gap-2 rounded-lg bg-blue-500/20 border border-blue-500/30 px-5 py-3 text-sm font-semibold text-blue-200 hover:bg-blue-500/30 transition disabled:opacity-50"
            >
              {researchLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200/20 border-t-blue-200" /> : "🚀"}
              {researchLoading ? "Queuing research…" : "Run Research Pipeline"}
            </button>
            {researchMsg && <p className="mt-3 text-sm text-textMuted">{researchMsg}</p>}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setTab("intake")} className="flex-1 rounded-lg bg-white/5 px-4 py-3 text-sm font-semibold text-textMuted hover:bg-white/10 transition">← Back</button>
            <button type="button" onClick={generateBlueprint} disabled={generating} className="flex-1 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white hover:bg-accent/90 transition disabled:opacity-50">
              {generating ? "Generating…" : "Generate Blueprint →"}
            </button>
          </div>
        </div>
      )}

      {/* ── Blueprint Tab ── */}
      {tab === "blueprint" && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-[#16161A] p-1">
              <button
                type="button"
                onClick={() => setBlueprintMode("preview")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${blueprintMode === "preview" ? "bg-white/10 text-textPrimary" : "text-textMuted hover:text-textPrimary"}`}
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                Preview
              </button>
              <button
                type="button"
                onClick={() => setBlueprintMode("edit")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${blueprintMode === "edit" ? "bg-white/10 text-textPrimary" : "text-textMuted hover:text-textPrimary"}`}
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                Edit
              </button>
            </div>

            <div className="flex items-center gap-2">
              {blueprintText && (
                <>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(blueprintText); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                    className="flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/[0.08] px-3 py-1.5 text-xs font-semibold text-textMuted hover:bg-white/10 transition"
                  >
                    {copied ? "✓ Copied" : "📋 Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={generateBlueprint}
                    disabled={generating || auditing}
                    className="flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/[0.08] px-3 py-1.5 text-xs font-semibold text-textMuted hover:bg-white/10 transition disabled:opacity-50"
                  >
                    ↺ Regenerate
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={runAuditAndGenerate}
                disabled={auditing || generating || !profile?.website_url}
                title={!profile?.website_url ? "No website URL on file" : undefined}
                className="flex items-center gap-1.5 rounded-lg bg-purple-500/20 border border-purple-500/30 px-3 py-1.5 text-xs font-semibold text-purple-200 hover:bg-purple-500/30 transition disabled:opacity-50"
              >
                {auditing ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-purple-200/20 border-t-purple-200" /> : "🔍"}
                {auditing ? (auditStatus ?? "Auditing…") : "Audit & Regenerate"}
              </button>
            </div>
          </div>

          {genErr && <p className="text-sm text-rose-300">{genErr}</p>}

          {/* Empty state */}
          {!blueprintText && !generating && (
            <div className="rounded-xl border border-white/[0.08] bg-[#16161A] py-16 text-center">
              <div className="text-5xl mb-4">📋</div>
              <p className="text-sm font-semibold text-textPrimary mb-1">No blueprint yet</p>
              <p className="text-xs text-textMuted mb-6">Generate from intake data or run a full website audit first.</p>
              <button
                type="button"
                onClick={generateBlueprint}
                disabled={generating}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent/90 transition disabled:opacity-50"
              >
                {generating ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" /> : "📋"}
                {generating ? "Generating…" : "Generate Blueprint"}
              </button>
            </div>
          )}

          {generating && (
            <div className="rounded-xl border border-white/[0.08] bg-[#16161A] py-16 text-center">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-accent mx-auto block mb-4" />
              <p className="text-sm text-textMuted">Generating blueprint…</p>
            </div>
          )}

          {/* Preview mode */}
          {blueprintText && blueprintMode === "preview" && (
            <BlueprintRenderer
              markdown={blueprintText}
              clientName={profile.name}
              company={profile.company}
            />
          )}

          {/* Edit mode */}
          {blueprintText && blueprintMode === "edit" && (
            <div className="rounded-xl border border-white/[0.08] bg-[#16161A] p-4">
              <p className="text-xs text-textMuted mb-3">Edit the raw markdown below. Switch to Preview to see the formatted document.</p>
              <textarea
                value={blueprintText}
                onChange={(e) => setBlueprintText(e.target.value)}
                rows={35}
                className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-4 py-3 font-mono text-xs text-textPrimary leading-relaxed focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30 resize-y"
              />
            </div>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={() => setTab("research")} className="flex-1 rounded-lg bg-white/5 px-4 py-3 text-sm font-semibold text-textMuted hover:bg-white/10 transition">← Back</button>
            <button
              type="button"
              onClick={() => setTab("send")}
              disabled={!blueprintText}
              className="flex-1 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white hover:bg-accent/90 transition disabled:opacity-40"
            >
              Next: Send to Client →
            </button>
          </div>
        </div>
      )}

      {/* ── Send Tab ── */}
      {tab === "send" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/[0.08] bg-[#16161A] p-6">
            <h2 className="text-base font-semibold text-textPrimary mb-5">Send Blueprint to Client</h2>
            <div className="space-y-4 mb-6">
              <div>
                <div className="text-xs uppercase tracking-wider text-textMuted/50 mb-2">Recipient</div>
                <div className="rounded-lg bg-black/20 border border-white/[0.06] px-4 py-3 text-sm text-textPrimary">
                  {profile.name} {profile.email ? `<${profile.email}>` : ""} {profile.whatsapp ? `| WhatsApp: ${profile.whatsapp}` : ""}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-textMuted/50 mb-2">Delivery Channel</div>
                <div className="flex gap-3">
                  {(["email", "whatsapp"] as const).map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setSendChannel(ch)}
                      className={`flex-1 rounded-lg border px-4 py-3 text-sm font-semibold transition ${
                        sendChannel === ch ? "border-accent bg-accent/15 text-accent" : "border-white/[0.08] bg-white/5 text-textMuted hover:bg-white/10"
                      }`}
                    >
                      {ch === "email" ? "📧 Email" : "💬 WhatsApp"}
                    </button>
                  ))}
                </div>
              </div>
              {!blueprintText && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-300">
                  ⚠️ No blueprint generated yet. Go back to the Blueprint tab first.
                </div>
              )}
            </div>
            {sendSuccess && (
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-300 mb-4">
                ✅ Blueprint sent successfully via {sendChannel}!
              </div>
            )}
            {sendErr && (
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300 mb-4">
                ❌ {sendErr}
              </div>
            )}
            <button
              type="button"
              onClick={sendBlueprint}
              disabled={sending || !blueprintText || sendSuccess}
              className="w-full rounded-lg bg-emerald-500/80 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 transition disabled:opacity-40"
            >
              {sending ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                  Sending…
                </span>
              ) : sendSuccess ? "✅ Sent!" : `Send Blueprint via ${sendChannel === "email" ? "Email" : "WhatsApp"}`}
            </button>
          </div>
          <button type="button" onClick={() => setTab("blueprint")} className="w-full rounded-lg bg-white/5 px-4 py-3 text-sm font-semibold text-textMuted hover:bg-white/10 transition">
            ← Back to Blueprint
          </button>
        </div>
      )}
    </div>
  );
}
