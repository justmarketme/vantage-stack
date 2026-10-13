/**
 * Detects a proposal site's brand (colours, fonts, logo, name) so the client's
 * feedback room looks like *their* product, not ours. Everything has a safe
 * fallback; the CRM can override any field per link.
 */
export type FeedbackBrand = {
  name: string;
  logo: string | null;
  mode: "light" | "dark";
  bg: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentText: string;
  highlight: string;
  displayFont: string;
  bodyFont: string;
  radius: number;
  /** Optional brand-specific finishing touches; the room falls back to neutral defaults. */
  headingCase?: "none" | "uppercase";
  headingWeight?: number;
  numeralFont?: string;
  /** Decorative-only colour (outlines, ornaments) that may be too light for text. */
  ornament?: string;
  /** A dark "band" for the thank-you page: background, text, headline colour, and a logo that reads on it. */
  band?: { bg: string; text: string; headline: string; logo?: string };
};

export const DEFAULT_BRAND: FeedbackBrand = {
  name: "Vantage Stack",
  logo: null,
  mode: "dark",
  bg: "#0b0d12",
  surface: "#151a22",
  text: "#eef2f7",
  muted: "#97a3b6",
  border: "#2a3342",
  accent: "#5ea8ff",
  accentText: "#06121f",
  highlight: "#5ea8ff",
  displayFont: "Inter",
  bodyFont: "Inter",
  radius: 12,
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function expand(hex: string) {
  const h = hex.replace("#", "");
  return h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
}

export function luminance(hex: string) {
  const h = expand(hex);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** Pick black or white text for a filled accent button, whichever reads better. */
function onColor(bg: string) {
  return contrast(bg, "#ffffff") >= contrast(bg, "#111111") ? "#ffffff" : "#111111";
}

function mix(hex: string, toward: string, amount: number) {
  const a = expand(hex);
  const b = expand(toward);
  const out = [0, 2, 4]
    .map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - amount) + parseInt(b.slice(i, i + 2), 16) * amount))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  return `#${out}`;
}

/** next/font emits family names like "__Bricolage_Grotesque_3f2a1c"; turn that back into a Google family. */
function cleanFamily(raw: string) {
  let f = raw.replace(/['"]/g, "").split(",")[0].trim();
  f = f.replace(/^__/, "").replace(/_[0-9a-f]{5,}$/i, "").replace(/_Fallback.*$/i, "").replace(/_/g, " ").trim();
  if (!f || /^(var\(|inherit|system-ui|sans-serif|serif|monospace|ui-|-apple)/i.test(f)) return null;
  return f;
}

function cssVar(css: string, names: string[]) {
  for (const n of names) {
    const m = css.match(new RegExp(`--${n}\\s*:\\s*(#[0-9a-fA-F]{3,6})\\b`));
    if (m && HEX.test(m[1])) return m[1];
  }
  return null;
}

function abs(base: string, href: string) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

export async function detectBrand(url: string): Promise<FeedbackBrand> {
  const brand = { ...DEFAULT_BRAND };
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(7000), redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 VantageStackFeedback" } });
    const html = (await res.text()).slice(0, 400_000);
    const meta = (prop: string) =>
      html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${prop}["'][^>]*content=["']([^"']+)`, "i"))?.[1] ??
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:name|property)=["']${prop}["']`, "i"))?.[1] ??
      null;

    brand.name = (meta("og:site_name") || html.match(/<title>([^<]+)/i)?.[1]?.split(/\s[|–—-]\s/)[0] || new URL(url).hostname).trim().slice(0, 60);

    const icon =
      html.match(/<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]*href=["']([^"']+)/i)?.[1] ??
      html.match(/<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]*href=["']([^"']+\.(?:svg|png))/i)?.[1] ??
      null;
    brand.logo = icon ? abs(res.url, icon) : null;

    const cssHrefs = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)/gi)].map((m) => abs(res.url, m[1])).filter(Boolean) as string[];
    const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
    let css = inline;
    for (const href of cssHrefs.slice(0, 4)) {
      try {
        const r = await fetch(href, { signal: AbortSignal.timeout(5000) });
        css += "\n" + (await r.text()).slice(0, 600_000);
      } catch {
        /* ignore */
      }
    }

    // The base :root block is the site's default (light) palette for most design systems.
    const root = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? css;
    const bg = cssVar(root, ["surface", "background", "bg", "color-background", "page"]) ?? meta("theme-color");
    const text = cssVar(root, ["text-primary", "foreground", "fg", "text", "color-text"]);
    const accent = cssVar(root, ["accent", "primary", "brand", "color-primary"]);
    const highlight = cssVar(root, ["accent-bright", "accent", "primary", "brand"]);
    const surface = cssVar(root, ["surface-raised", "card", "surface-2", "panel"]);
    const border = cssVar(root, ["border", "line", "color-border"]);
    const muted = cssVar(root, ["text-secondary", "muted-foreground", "muted", "text-muted"]);

    if (bg && HEX.test(bg)) {
      brand.bg = bg;
      brand.mode = luminance(bg) > 0.4 ? "light" : "dark";
      brand.text = text && HEX.test(text) && contrast(text, bg) >= 4.5 ? text : brand.mode === "light" ? "#16130f" : "#f3efe9";
      brand.surface = surface && HEX.test(surface) ? surface : brand.mode === "light" ? "#ffffff" : mix(bg, "#ffffff", 0.06);
      brand.border = border && HEX.test(border) ? border : mix(bg, brand.text, 0.14);
      brand.muted = muted && HEX.test(muted) && contrast(muted, bg) >= 4.5 ? muted : mix(brand.text, bg, 0.38);
    }
    if (accent && HEX.test(accent)) {
      brand.accent = accent;
      brand.accentText = onColor(accent);
      brand.highlight = highlight && HEX.test(highlight) ? highlight : accent;
    }

    const families = [...css.matchAll(/font-family\s*:\s*([^;}]+)/gi)].map((m) => cleanFamily(m[1])).filter(Boolean) as string[];
    const counts = new Map<string, number>();
    for (const f of families) counts.set(f, (counts.get(f) ?? 0) + 1);
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f).filter((f) => !/mono|code/i.test(f));
    const display = ranked.find((f) => /grotesque|display|serif|fraunces|playfair|syne|clash|cabinet|bricolage/i.test(f));
    if (ranked[0]) brand.bodyFont = ranked.find((f) => f !== display) ?? ranked[0];
    brand.displayFont = display ?? brand.bodyFont;

    const r = root.match(/--radius(?:-md|-lg)?\s*:\s*(\d+(?:\.\d+)?)(px|rem)/);
    if (r) brand.radius = Math.min(20, Math.round(parseFloat(r[1]) * (r[2] === "rem" ? 16 : 1)));
  } catch {
    /* fall back to defaults */
  }
  return brand;
}

export function mergeBrand(detected: FeedbackBrand, override: Partial<FeedbackBrand> | null | undefined): FeedbackBrand {
  const b = { ...detected, ...(override ?? {}) };
  if (override?.accent && HEX.test(override.accent)) {
    if (!override.accentText) b.accentText = onColor(override.accent);
    if (!override.highlight) b.highlight = override.accent;
  }
  return b;
}

/** Text colour for small labels sitting on the highlight colour (pin numbers): whichever of the brand ink or white reads better. */
export function highlightText(b: FeedbackBrand) {
  if (!HEX.test(b.highlight)) return "#ffffff";
  const ink = HEX.test(b.text) && b.mode === "light" ? b.text : "#111111";
  return contrast(b.highlight, ink) >= contrast(b.highlight, "#ffffff") ? ink : "#ffffff";
}

export function googleFontsHref(b: FeedbackBrand) {
  const fams = [...new Set([b.displayFont, b.bodyFont, b.numeralFont].filter(Boolean) as string[])];
  const q = fams.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700`).join("&");
  return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}
