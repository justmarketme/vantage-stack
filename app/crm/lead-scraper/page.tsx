"use client";

import { useState, useRef, useEffect } from "react";

const INDUSTRIES: Array<{ label: string; icon: string }> = [
  { label: "Plumbing & Trades",   icon: "🔧" },
  { label: "Aesthetic Clinic",    icon: "💉" },
  { label: "Dental Practice",     icon: "🦷" },
  { label: "Medical Practice",    icon: "🏥" },
  { label: "Hair & Beauty Salon", icon: "💇" },
  { label: "Chiropractor",        icon: "🦴" },
  { label: "Financial Services",  icon: "💳" },
  { label: "Real Estate",         icon: "🏠" },
  { label: "Construction",        icon: "🏗️" },
  { label: "Education",           icon: "🎓" },
  { label: "Hospitality",         icon: "🍽️" },
  { label: "Technology",          icon: "💻" },
  { label: "E-commerce",          icon: "🛒" },
  { label: "Other",               icon: "📁" },
];

// ── Custom Industry Dropdown ────────────────────────────────────────────────
function IndustryDropdown({
  value, onChange,
}: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = INDUSTRIES.find((i) => i.label === value);
  const filtered = INDUSTRIES.filter((i) =>
    i.label.toLowerCase().includes(search.toLowerCase()),
  );

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  function select(label: string) {
    onChange(label);
    setOpen(false);
    setSearch("");
  }

  return (
    <div ref={ref} className="relative w-full">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm transition-all ${
          value
            ? "border-accent/40 bg-accent/8 text-textPrimary"
            : "border-white/[0.08] bg-black/30 text-textMuted/50 hover:border-white/[0.14] hover:bg-white/[0.03]"
        } focus:outline-none`}
      >
        <span className="flex items-center gap-2.5">
          {selected ? (
            <>
              <span className="text-base leading-none">{selected.icon}</span>
              <span className="font-medium text-textPrimary">{selected.label}</span>
            </>
          ) : (
            <span className="text-textMuted/50">— Select industry to enable import —</span>
          )}
        </span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`flex-shrink-0 text-textMuted transition-transform ${open ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 z-50 rounded-xl border border-white/[0.1] bg-[#1c1c20] shadow-2xl overflow-hidden">
          {/* Search */}
          <div className="px-3 pt-3 pb-2 border-b border-white/[0.06]">
            <div className="flex items-center gap-2 rounded-lg bg-white/[0.05] border border-white/[0.08] px-3 py-2">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-textMuted/50 flex-shrink-0">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search industries…"
                className="flex-1 bg-transparent text-sm text-textPrimary placeholder:text-textMuted/40 focus:outline-none"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-textMuted/40 hover:text-textMuted transition text-base leading-none">×</button>
              )}
            </div>
          </div>

          {/* Options grid */}
          <div className="p-2 max-h-72 overflow-y-auto grid grid-cols-2 gap-1">
            {filtered.length === 0 ? (
              <div className="col-span-2 py-6 text-center text-xs text-textMuted/50">No industries match "{search}"</div>
            ) : filtered.map((ind) => {
              const isSelected = value === ind.label;
              return (
                <button
                  key={ind.label}
                  type="button"
                  onClick={() => select(ind.label)}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-left transition-all ${
                    isSelected
                      ? "bg-accent/15 border border-accent/30 text-accent"
                      : "hover:bg-white/[0.05] border border-transparent text-textMuted hover:text-textPrimary"
                  }`}
                >
                  <span className="text-base leading-none flex-shrink-0">{ind.icon}</span>
                  <span className="text-xs font-medium leading-tight">{ind.label}</span>
                  {isSelected && (
                    <svg className="ml-auto flex-shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </button>
              );
            })}
          </div>

          {/* Clear selection */}
          {value && (
            <div className="px-3 py-2 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); }}
                className="w-full text-xs text-textMuted/50 hover:text-rose-400 transition text-center py-1"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type AdSpend = "Low" | "Medium" | "High" | null;

type ScrapedLead = {
  id: string;
  placeId?: string;
  businessName: string;
  phone: string | null;
  email: string | null;
  address: string;
  website: string | null;
  fbHandle: string | null;
  igHandle: string | null;
  category: string | null;
  adsRunning: boolean | null;
  adLibraryUrl: string | null;
  adSpend: AdSpend;
  reviewCount: number | null;
  rating: number | null;
  yearsInBusiness: number | null;
  ownerName: string | null;
  status: "new" | "importing" | "imported" | "duplicate";
  selected: boolean;
};

type ColKey =
  | "businessName" | "phone" | "email" | "website" | "social"
  | "category" | "adsRunning" | "adSpend" | "reviewCount"
  | "rating" | "yearsInBusiness" | "ownerName" | "status";

type ColDef = { key: ColKey; label: string; width: string; enriched?: boolean };

// enriched: true = data only available when "Enrich all leads" is toggled on
const ALL_COLS: ColDef[] = [
  { key: "businessName",   label: "Business Name",         width: "min-w-[180px]" },
  { key: "phone",          label: "Phone Number",          width: "min-w-[150px]" },
  { key: "email",          label: "Email",                 width: "min-w-[200px]", enriched: true },
  { key: "website",        label: "Website",               width: "min-w-[130px]" },
  { key: "social",         label: "FB / IG Handle",        width: "min-w-[150px]", enriched: true },
  { key: "category",       label: "Business Category",     width: "min-w-[150px]" },
  { key: "adsRunning",     label: "Running FB Ads?",       width: "min-w-[130px]", enriched: true },
  { key: "adSpend",        label: "Est. Monthly Spend",    width: "min-w-[140px]", enriched: true },
  { key: "reviewCount",    label: "Google Reviews",        width: "min-w-[120px]" },
  { key: "rating",         label: "Avg Rating",            width: "min-w-[110px]" },
  { key: "yearsInBusiness",label: "Years in Business",     width: "min-w-[130px]", enriched: true },
  { key: "ownerName",      label: "Owner Name",            width: "min-w-[140px]", enriched: true },
  { key: "status",         label: "Status",                width: "min-w-[100px]" },
];

const DEFAULT_VISIBLE = new Set<ColKey>(ALL_COLS.map((c) => c.key));

type ScrapeStatus = "idle" | "running" | "done" | "error";

// ── Ad spend badge ──────────────────────────────────────────────────────────
function AdSpendBadge({ spend }: { spend: AdSpend }) {
  if (!spend) return <span className="text-textMuted/30 text-xs">—</span>;
  const map: Record<string, string> = {
    Low:    "bg-blue-500/10 border-blue-500/20 text-blue-300",
    Medium: "bg-amber-500/10 border-amber-500/20 text-amber-300",
    High:   "bg-rose-500/10 border-rose-500/20 text-rose-300",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${map[spend]}`}>
      {spend}
    </span>
  );
}

// ── Star rating ─────────────────────────────────────────────────────────────
function StarRating({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-textMuted/30 text-xs">—</span>;
  const full = Math.floor(rating);
  const half = rating - full >= 0.4;
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="11" height="11" viewBox="0 0 24 24" fill={i < full ? "#fbbf24" : i === full && half ? "url(#half)" : "none"} stroke="#fbbf24" strokeWidth="1.5">
          {i === full && half && (
            <defs>
              <linearGradient id="half"><stop offset="50%" stopColor="#fbbf24" /><stop offset="50%" stopColor="transparent" /></linearGradient>
            </defs>
          )}
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
      <span className="ml-1 text-xs text-textPrimary font-medium">{rating.toFixed(1)}</span>
    </span>
  );
}

// ── Column picker modal ─────────────────────────────────────────────────────
function ColumnPicker({
  visible, onChange, onClose,
}: {
  visible: Set<ColKey>;
  onChange: (v: Set<ColKey>) => void;
  onClose: () => void;
}) {
  const toggle = (k: ColKey) => {
    const next = new Set(visible);
    if (next.has(k)) { if (next.size > 2) next.delete(k); } else next.add(k);
    onChange(next);
  };
  return (
    <div className="absolute right-0 top-10 z-50 w-64 rounded-xl border border-white/[0.1] bg-[#1a1a1e] shadow-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-textPrimary">Customize Columns</span>
        <button onClick={onClose} className="text-textMuted hover:text-textPrimary transition text-lg leading-none">×</button>
      </div>
      <div className="space-y-1">
        {ALL_COLS.map((col) => (
          <label key={col.key} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/5 cursor-pointer transition">
            <input
              type="checkbox"
              checked={visible.has(col.key)}
              onChange={() => toggle(col.key)}
              className="h-3.5 w-3.5 rounded accent-accent"
            />
            <span className="text-xs text-textMuted">{col.label}</span>
          </label>
        ))}
      </div>
      <button
        onClick={() => onChange(new Set(ALL_COLS.map((c) => c.key)))}
        className="mt-3 w-full rounded-lg bg-white/5 px-3 py-1.5 text-xs text-textMuted hover:bg-white/10 transition"
      >
        Reset to default
      </button>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function LeadScraperPage() {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("Pretoria");
  const [radius, setRadius] = useState("20");
  const [maxLeads, setMaxLeads] = useState("25");
  const [enrichAll, setEnrichAll] = useState(true);
  const [leads, setLeads] = useState<ScrapedLead[]>([]);
  const [scrapeStatus, setScrapeStatus] = useState<ScrapeStatus>("idle");
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [industry, setIndustry] = useState("");
  const [moving, setMoving] = useState(false);
  const [moveSuccess, setMoveSuccess] = useState<number | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(DEFAULT_VISIBLE);
  const [showColPicker, setShowColPicker] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const selected = leads.filter((l) => l.selected && l.status !== "imported");
  const allSelectable = leads.filter((l) => l.status !== "imported");
  const allChecked = allSelectable.length > 0 && allSelectable.every((l) => l.selected);

  const activeCols = ALL_COLS.filter((c) => visibleCols.has(c.key));

  function toggleAll() {
    setLeads((prev) => prev.map((l) => l.status !== "imported" ? { ...l, selected: !allChecked } : l));
  }
  function toggleOne(id: string) {
    setLeads((prev) => prev.map((l) => l.id === id && l.status !== "imported" ? { ...l, selected: !l.selected } : l));
  }

  async function startScraping() {
    if (!query.trim()) return;
    setScrapeStatus("running");
    setScrapeError(null);
    setLeads([]);
    setProgress(0);
    setProgressLabel("Connecting to Places API…");
    setMoveSuccess(null);
    setMoveError(null);
    abortRef.current = new AbortController();

    try {
      setProgressLabel(enrichAll ? "Searching & enriching leads…" : "Searching Google Places…");
      setProgress(10);

      const res = await fetch("/api/crm/lead-scraper/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          query: query.trim(), location: location.trim(),
          radius: Number(radius) * 1000,
          maxResults: Number(maxLeads),
          enrich: enrichAll,
        }),
        signal: abortRef.current.signal,
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Scrape failed");

      const raw: any[] = json.results ?? [];
      setProgress(55);
      setProgressLabel(`Found ${raw.length} businesses — loading results…`);

      for (let i = 0; i < raw.length; i++) {
        const r = raw[i];
        const lead: ScrapedLead = {
          id: r.placeId ?? `lead-${i}`,
          placeId: r.placeId,
          businessName: r.name ?? "—",
          phone: r.phone ?? null,
          email: r.email ?? null,
          address: r.address ?? "—",
          website: r.website ?? null,
          fbHandle: r.fbHandle ?? null,
          igHandle: r.igHandle ?? null,
          category: r.category ?? null,
          adsRunning: r.adsRunning ?? null,
          adLibraryUrl: r.adLibraryUrl ?? null,
          adSpend: r.adSpend ?? null,
          reviewCount: r.ratingCount ?? null,
          rating: r.rating ?? null,
          yearsInBusiness: r.yearsInBusiness ?? null,
          ownerName: r.ownerName ?? null,
          status: r.isDuplicate ? "duplicate" : "new",
          selected: !r.isDuplicate,
        };
        setLeads((prev) => [...prev, lead]);
        setProgress(55 + Math.round((i / raw.length) * 40));
        await new Promise((r) => setTimeout(r, 50));
      }

      setProgress(100);
      setProgressLabel(`Done — ${raw.length} leads found`);
      setScrapeStatus("done");
    } catch (e: any) {
      if (e.name === "AbortError") { setScrapeStatus("idle"); setProgressLabel("Cancelled"); }
      else { setScrapeStatus("error"); setScrapeError(e.message ?? "Something went wrong"); }
    }
  }

  async function moveToContacts() {
    if (!industry || selected.length === 0) return;
    setMoving(true); setMoveError(null); setMoveSuccess(null);
    const ids = selected.map((l) => l.id);
    setLeads((prev) => prev.map((l) => ids.includes(l.id) ? { ...l, status: "importing" } : l));
    try {
      const res = await fetch("/api/crm/lead-scraper/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ leads: selected, industry }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Import failed");
      setLeads((prev) => prev.map((l) => ids.includes(l.id) ? { ...l, status: "imported", selected: false } : l));
      setMoveSuccess(json.imported ?? selected.length);
    } catch (e: any) {
      setLeads((prev) => prev.map((l) => ids.includes(l.id) ? { ...l, status: "new" } : l));
      setMoveError(e.message ?? "Import failed");
    } finally { setMoving(false); }
  }

  const canMove = industry && selected.length > 0 && !moving;

  // ── Cell renderer ──────────────────────────────────────────────────────────
  function renderCell(col: ColDef, lead: ScrapedLead) {
    switch (col.key) {
      case "businessName":
        return (
          <span className="font-medium text-textPrimary truncate max-w-[170px] block" title={lead.businessName}>
            {lead.businessName}
          </span>
        );
      case "phone":
        return lead.phone
          ? <a href={`tel:${lead.phone}`} className="text-xs text-accent hover:underline whitespace-nowrap font-mono">{lead.phone}</a>
          : <span className="text-textMuted/30 text-xs">—</span>;
      case "email":
        return lead.email
          ? <a href={`mailto:${lead.email}`} className="text-xs text-accent hover:underline truncate max-w-[190px] block" title={lead.email}>{lead.email}</a>
          : <span className="text-textMuted/30 text-xs">—</span>;
      case "website":
        return lead.website
          ? (
            <a href={lead.website} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              Visit
            </a>
          )
          : <span className="inline-flex items-center gap-1 text-[11px] text-rose-400/60">✕ None</span>;
      case "social": {
        const fb = lead.fbHandle;
        const ig = lead.igHandle;
        if (!fb && !ig) return <span className="text-textMuted/30 text-xs">—</span>;
        return (
          <div className="flex flex-col gap-0.5">
            {fb && <a href={`https://facebook.com/${fb}`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-400 hover:underline">fb/{fb}</a>}
            {ig && <a href={`https://instagram.com/${ig}`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-pink-400 hover:underline">@{ig}</a>}
          </div>
        );
      }
      case "category":
        return lead.category
          ? <span className="text-xs text-textMuted truncate max-w-[140px] block" title={lead.category}>{lead.category}</span>
          : <span className="text-textMuted/30 text-xs">—</span>;
      case "adsRunning":
        if (lead.adsRunning === true) {
          const url = lead.adLibraryUrl ?? `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ZA&q=${encodeURIComponent(lead.businessName)}`;
          return (
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-green-500/15 border border-green-500/25 px-2 py-0.5 text-[10px] font-semibold text-green-300 hover:bg-green-500/25 transition">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              Yes — View Ads
            </a>
          );
        }
        if (lead.adsRunning === false)
          return <span className="inline-flex items-center rounded-full bg-white/5 border border-white/[0.08] px-2 py-0.5 text-[10px] text-textMuted/50">No</span>;
        return <span className="text-textMuted/30 text-xs">—</span>;
      case "adSpend":
        return <AdSpendBadge spend={lead.adSpend} />;
      case "reviewCount":
        return lead.reviewCount !== null
          ? <span className="text-xs text-textPrimary font-medium">{lead.reviewCount.toLocaleString()}</span>
          : <span className="text-textMuted/30 text-xs">—</span>;
      case "rating":
        return <StarRating rating={lead.rating} />;
      case "yearsInBusiness":
        return lead.yearsInBusiness !== null
          ? <span className="text-xs text-textPrimary">{lead.yearsInBusiness} yr{lead.yearsInBusiness !== 1 ? "s" : ""}</span>
          : <span className="text-textMuted/30 text-xs">—</span>;
      case "ownerName":
        return lead.ownerName
          ? <span className="text-xs text-textPrimary">{lead.ownerName}</span>
          : <span className="text-textMuted/30 text-xs">—</span>;
      case "status":
        if (lead.status === "importing")
          return <span className="flex items-center gap-1.5 text-[10px] text-accent"><span className="h-2.5 w-2.5 rounded-full border-2 border-accent/20 border-t-accent animate-spin"/>Importing…</span>;
        if (lead.status === "imported")
          return <span className="inline-flex items-center rounded-full bg-green-500/15 border border-green-500/20 px-2 py-0.5 text-[10px] font-semibold text-green-300">✓ Imported</span>;
        if (lead.status === "duplicate")
          return <span className="inline-flex items-center rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] text-amber-300/70">Duplicate</span>;
        return <span className="inline-flex items-center rounded-full bg-accent/10 border border-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent">New</span>;
    }
  }

  return (
    <div className="space-y-5 max-w-[1400px]">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">Lead Scraper</h1>
          <p className="text-sm text-textMuted mt-1">Search Google Places, enrich business data, and import leads directly into Contacts.</p>
        </div>
        {leads.length > 0 && (
          <div className="flex items-center gap-3 text-xs bg-white/5 border border-white/[0.08] rounded-lg px-3 py-2">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent"/>{leads.filter(l => l.status !== "duplicate").length} leads</span>
            {leads.filter(l => l.status === "duplicate").length > 0 && <span className="text-amber-400/70">{leads.filter(l => l.status === "duplicate").length} duplicate</span>}
            {leads.filter(l => l.status === "imported").length > 0 && <span className="text-green-400">{leads.filter(l => l.status === "imported").length} imported</span>}
          </div>
        )}
      </div>

      {/* ── Enrichment toggle ────────────────────────────────────────────── */}
      <div className={`flex items-center justify-between rounded-xl border px-5 py-3.5 transition-colors ${enrichAll ? "border-amber-500/25 bg-amber-500/5" : "border-white/[0.08] bg-white/[0.02]"}`}>
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg text-base transition-colors ${enrichAll ? "bg-amber-500/15 text-amber-400" : "bg-white/[0.06] text-textMuted"}`}>⚡</div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-textPrimary">Enrich all leads with full contact & ad data</p>
              {enrichAll && (
                <span className="rounded-full bg-amber-500/15 border border-amber-500/25 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                  6 extra columns
                </span>
              )}
            </div>
            <p className="text-xs text-textMuted mt-0.5">
              {enrichAll
                ? "Email · Social handles · FB Ads status · Ad spend · Owner name · Years in business"
                : "Pulls email, social handles, ad status, owner name, and years in business for every result"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEnrichAll((v) => !v)}
          className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200 focus:outline-none ${enrichAll ? "bg-accent" : "bg-white/10"}`}
          role="switch"
          aria-checked={enrichAll}
        >
          <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${enrichAll ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>

      {/* ── Scraper config ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-white/[0.08] bg-[#16161A] p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent text-sm">🔍</div>
          <h2 className="text-sm font-semibold text-textPrimary">Scrape New Leads</h2>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="col-span-2">
            <label className="block text-[11px] font-medium text-textMuted/70 mb-1.5">Search Query <span className="text-accent">*</span></label>
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && scrapeStatus !== "running" && startScraping()}
              placeholder='"plumbers in Pretoria East"'
              className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm text-textPrimary placeholder:text-textMuted/30 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/20 transition" />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-textMuted/70 mb-1.5">Location</label>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm text-textPrimary focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/20 transition" />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-textMuted/70 mb-1.5">Radius</label>
            <select value={radius} onChange={(e) => setRadius(e.target.value)}
              className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm text-textPrimary focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/20 transition">
              {["5","10","20","30","50"].map(r => <option key={r} value={r}>{r} km</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-textMuted/70 mb-1.5">Max Leads</label>
            <select value={maxLeads} onChange={(e) => setMaxLeads(e.target.value)}
              className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm text-textPrimary focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/20 transition">
              {["10","25","50","100"].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div className="flex items-end">
            {scrapeStatus === "running"
              ? <button type="button" onClick={() => abortRef.current?.abort()}
                  className="w-full flex items-center justify-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-300 hover:bg-rose-500/20 transition">
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-rose-300/20 border-t-rose-300 animate-spin"/>Stop
                </button>
              : <button type="button" onClick={startScraping} disabled={!query.trim()}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  Start Scraping
                </button>
            }
          </div>
        </div>

        {(scrapeStatus === "running" || (scrapeStatus === "done" && progress > 0)) && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1"><span className="text-xs text-textMuted">{progressLabel}</span><span className="text-xs text-textMuted">{progress}%</span></div>
            <div className="h-1 w-full rounded-full bg-white/[0.06]">
              <div className="h-1 rounded-full bg-accent transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
        {scrapeError && <div className="mt-3 rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-2.5 text-sm text-rose-300">{scrapeError}</div>}
      </div>

      {/* ── Results table ────────────────────────────────────────────────── */}
      {(leads.length > 0 || scrapeStatus === "running") && (
        <div className="rounded-xl border border-white/[0.08] bg-[#16161A] overflow-hidden">

          {/* Table toolbar */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06] gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-textPrimary">Scraped Results</h2>
              {scrapeStatus === "running" && (
                <span className="flex items-center gap-1.5 text-xs text-accent"><span className="h-2 w-2 rounded-full bg-accent animate-pulse"/>Live</span>
              )}
              <span className="text-xs text-textMuted">{leads.length} total</span>
              {/* Enrichment legend */}
              {enrichAll && (
                <div className="flex items-center gap-2 ml-1">
                  <span className="h-3 w-px bg-white/[0.08]"/>
                  <span className="flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/8 px-2.5 py-0.5 text-[10px] font-semibold text-amber-300/80">
                    <span className="text-amber-400">⚡</span> Enriched columns highlighted
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-textMuted/50">
                    <span className="inline-block h-2 w-2 rounded-sm bg-white/[0.07] border border-white/[0.1]"/>Basic
                    <span className="inline-block h-2 w-2 rounded-sm bg-amber-500/15 border border-amber-500/25"/>Enriched
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 relative">
              {/* Stats pills */}
              <div className="flex items-center gap-2 text-xs">
                {leads.filter(l => l.status === "duplicate").length > 0 && <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-amber-300/70">{leads.filter(l => l.status === "duplicate").length} dup</span>}
                {leads.filter(l => l.adsRunning === true).length > 0 && <span className="rounded-full bg-green-500/10 border border-green-500/20 px-2 py-0.5 text-green-300">{leads.filter(l => l.adsRunning === true).length} running ads</span>}
                {leads.filter(l => !l.website).length > 0 && <span className="rounded-full bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 text-rose-300/70">{leads.filter(l => !l.website).length} no website</span>}
              </div>
              {/* Column picker button */}
              <button
                type="button"
                onClick={() => setShowColPicker((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/[0.08] px-3 py-1.5 text-xs font-medium text-textMuted hover:bg-white/10 hover:text-textPrimary transition"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                Customize Columns
                <span className="rounded-full bg-accent/20 text-accent px-1.5 py-px text-[10px] font-bold">{visibleCols.size}</span>
              </button>
              {showColPicker && (
                <ColumnPicker visible={visibleCols} onChange={setVisibleCols} onClose={() => setShowColPicker(false)} />
              )}
            </div>
          </div>

          {/* Scrollable table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: `${activeCols.length * 130 + 50}px` }}>
              <thead>
                <tr className="border-b border-white/[0.05] bg-black/20">
                  <th className="sticky left-0 z-10 bg-[#0f0f11] w-10 px-4 py-3">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll}
                      className="h-3.5 w-3.5 rounded border-white/20 accent-accent cursor-pointer" />
                  </th>
                  {activeCols.map((col) => (
                    <th key={col.key} className={`px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap ${col.width} ${
                      col.enriched && enrichAll
                        ? "text-amber-400/70 bg-amber-500/[0.04] border-b border-amber-500/10"
                        : "text-textMuted/50"
                    }`}>
                      <span className="flex items-center gap-1">
                        {col.label}
                        {col.enriched && enrichAll && (
                          <span className="text-amber-400 text-[9px] leading-none" title="Enriched data">⚡</span>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {leads.map((lead) => (
                  <tr key={lead.id} className={`transition-colors group ${
                    lead.status === "imported" ? "bg-green-500/[0.03] opacity-60"
                    : lead.status === "duplicate" ? "opacity-40"
                    : lead.selected ? "bg-accent/[0.04]"
                    : "hover:bg-white/[0.015]"
                  }`}>
                    <td className="sticky left-0 z-10 bg-inherit px-4 py-3">
                      <input type="checkbox" checked={lead.selected}
                        disabled={lead.status === "imported" || lead.status === "importing"}
                        onChange={() => toggleOne(lead.id)}
                        className="h-3.5 w-3.5 rounded border-white/20 accent-accent cursor-pointer disabled:cursor-default" />
                    </td>
                    {activeCols.map((col) => (
                      <td key={col.key} className={`px-4 py-3 align-middle ${
                        col.enriched && enrichAll ? "bg-amber-500/[0.03] border-l border-amber-500/[0.06]" : ""
                      }`}>
                        {renderCell(col, lead)}
                      </td>
                    ))}
                  </tr>
                ))}

                {/* Skeleton rows while loading */}
                {scrapeStatus === "running" && leads.length < Number(maxLeads) && Array.from({ length: 4 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="animate-pulse">
                    <td className="px-4 py-3"><div className="h-3.5 w-3.5 rounded bg-white/[0.06]"/></td>
                    {activeCols.map((col) => (
                      <td key={col.key} className="px-4 py-3">
                        <div className="h-3 rounded bg-white/[0.05]" style={{ width: `${50 + Math.random() * 50}%` }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Move to contacts ─────────────────────────────────────────────── */}
      {leads.filter(l => l.status !== "imported").length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-[#16161A] p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/15 text-purple-300 text-sm">📥</div>
            <h2 className="text-sm font-semibold text-textPrimary">Move to Contacts</h2>
            <span className="text-xs text-textMuted">{selected.length} lead{selected.length !== 1 ? "s" : ""} selected</span>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex items-center gap-2.5 rounded-lg bg-black/20 border border-white/[0.06] px-4 py-3 cursor-pointer self-start">
              <input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-4 w-4 rounded border-white/20 accent-accent cursor-pointer" />
              <span className="text-sm text-textMuted select-none">Select all <span className="text-textPrimary font-medium">({allSelectable.length})</span></span>
            </label>

            <div className="flex-1">
              <label className="block text-[11px] font-medium text-textMuted/70 mb-1.5">
                Tag with Industry <span className="text-accent">*</span>
                <span className="ml-2 text-textMuted/40 font-normal">(required)</span>
              </label>
              <IndustryDropdown value={industry} onChange={setIndustry} />
            </div>

            <button type="button" onClick={moveToContacts} disabled={!canMove}
              className={`flex items-center justify-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold whitespace-nowrap transition ${canMove
                ? "bg-accent text-white hover:bg-accent/90 shadow-lg shadow-accent/20"
                : "bg-white/5 border border-white/[0.08] text-textMuted/40 cursor-not-allowed"}`}>
              {moving
                ? <><span className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white animate-spin"/>Importing…</>
                : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>Move {selected.length > 0 ? `${selected.length} ` : ""}to Contacts</>
              }
            </button>
          </div>

          {!industry && selected.length > 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-300/80">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              Select an industry to enable the import button
            </p>
          )}

          {moveSuccess !== null && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-3 text-sm text-green-300">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <span><strong>{moveSuccess} leads</strong> imported as <strong>{industry}</strong> contacts. <a href="/crm/clients" className="underline hover:text-green-200 transition">View in Contacts →</a></span>
            </div>
          )}
          {moveError && <div className="mt-4 rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300">{moveError}</div>}
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {scrapeStatus === "idle" && leads.length === 0 && (
        <div className="rounded-xl border border-dashed border-white/[0.08] bg-[#16161A]/50 py-20 text-center">
          <div className="text-5xl mb-4">🗺️</div>
          <p className="text-sm font-semibold text-textPrimary">No results yet</p>
          <p className="text-xs text-textMuted mt-2 max-w-xs mx-auto">
            Enter a search query and click <span className="text-accent font-medium">Start Scraping</span> to pull live business data from Google Places.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-textMuted/50">
            {['"dentists in Sandton"','"hair salons Cape Town"','"plumbers Durban North"','"chiropractors Pretoria"'].map(ex => (
              <button key={ex} type="button" onClick={() => setQuery(ex.replace(/"/g,""))}
                className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 hover:bg-white/[0.07] hover:text-textMuted transition">
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
