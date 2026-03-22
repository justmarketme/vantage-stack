#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { dirname, extname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const tokensPath = join(__dirname, "tokens.json");

type Tokens = {
  brand?: { name?: string; positioning?: string };
  colors?: Record<string, string>;
  typography?: { fontFamily?: Record<string, string[]>; scale?: Record<string, string> };
  accessibility?: { minTapTargetPx?: number; focusVisibleRequired?: boolean };
  componentLibrary?: { root?: string; preferredSubdir?: string };
};

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

async function readTokens(): Promise<Tokens> {
  const raw = await readFile(tokensPath, "utf-8");
  return JSON.parse(raw) as Tokens;
}

function findHexColors(source: string): string[] {
  const matches = source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
  return uniq(matches.map((m) => m.toLowerCase()));
}

function includesDarkModeSignal(source: string) {
  return /\bdark:/.test(source) || /\bclassName=["'][^"']*\bdark\b/.test(source);
}

function hasTokenColorUsage(source: string) {
  return (
    /\b(bg|text)-(background|surface|accent|textPrimary|textMuted)\b/.test(source) ||
    /\btext-accent\b/.test(source)
  );
}

function findImgMissingAlt(source: string): number {
  const imgs = source.match(/<img\b[^>]*>/gi) ?? [];
  return imgs.filter((tag) => !/\balt\s*=/.test(tag)).length;
}

function findInteractiveElementsWithoutFocus(source: string): string[] {
  const lines = source.split(/\r?\n/);
  const offenders: string[] = [];
  for (const l of lines) {
    const isInteractive =
      /\b<button\b/.test(l) || /\bhref=/.test(l) || /\brole=["']button["']/.test(l) || /\bvs-button/.test(l);
    if (!isInteractive) continue;
    if (/focus-visible:|focus:|outline|ring-/.test(l)) continue;
    offenders.push(l.trim());
  }
  return offenders.slice(0, 6);
}

function findNonTokenTailwindColors(source: string): string[] {
  const tokens = source.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const t of tokens) {
    if (/\b(bg|text|border|from|to)-(background|surface|accent|textPrimary|textMuted)\b/.test(t)) continue;
    if (
      /^(bg|text|border|from|to)-(red|blue|green|slate|gray|zinc|neutral|stone|amber|orange|lime|teal|cyan|indigo|violet|purple|pink|rose)-/.test(
        t,
      )
    )
      out.push(t);
    if (t.includes("#")) out.push(t);
    if (/^(bg|text|border|from|to)-\[(#|rgb|hsl)/.test(t)) out.push(t);
  }
  return uniq(out);
}

async function listComponents(preferredDir: string) {
  const abs = join(repoRoot, preferredDir);
  if (!existsSync(abs)) return [];
  const entries = await readdir(abs, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && [".ts", ".tsx"].includes(extname(e.name)))
    .map((e) => join(preferredDir, e.name).replace(/\\/g, "/"));
}

async function ensureComponentLibraryDir(preferredDir: string) {
  const abs = join(repoRoot, preferredDir);
  await mkdir(abs, { recursive: true });
  const readme = join(abs, "README.md");
  if (!existsSync(readme)) {
    await writeFile(readme, `# UI Component Library\n\nReusable UI components enforced by the design-system MCP.\n`, "utf-8");
  }
}

const ValidateBrandConsistencyInput = z.object({
  component_name: z.string().min(1),
  component_source: z.string().min(1),
});

const ApplyColorPaletteInput = z.object({
  css_or_tailwind_source: z.string().min(1),
});

const EnsureTypographyInput = z.object({
  component_source: z.string().min(1),
});

const AccessComponentLibraryInput = z.object({
  query: z.string().optional(),
  include_source: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(200).optional(),
});

const CheckResponsiveInput = z.object({
  component_source: z.string().min(1),
});

const ValidateA11yInput = z.object({
  component_source: z.string().min(1),
});

const EnsureDarkModeInput = z.object({
  component_source: z.string().min(1),
});

const server = new Server({ name: "design-system", version: "0.2.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "validate-brand-consistency",
        description: "Validate-brand-consistency: palette + typography token usage, and flag off-brand colors.",
        inputSchema: zodToJsonSchema(ValidateBrandConsistencyInput),
      },
      {
        name: "apply-color-palette",
        description: "Apply-color-palette: suggest token-aligned replacements for raw hex / non-token Tailwind colors.",
        inputSchema: zodToJsonSchema(ApplyColorPaletteInput),
      },
      {
        name: "ensure-typography-standards",
        description: "Ensure-typography-standards: enforce font-heading/font-body and basic type hygiene.",
        inputSchema: zodToJsonSchema(EnsureTypographyInput),
      },
      {
        name: "access-component-library",
        description: "Access-component-library: list/search reusable components (preferred: components/ui).",
        inputSchema: zodToJsonSchema(AccessComponentLibraryInput),
      },
      {
        name: "check-responsive-design",
        description: "Check-responsive-design: breakpoints + fixed px sizing heuristics.",
        inputSchema: zodToJsonSchema(CheckResponsiveInput),
      },
      {
        name: "validate-accessibility-standards",
        description: "Validate-accessibility-standards: alt text, focus-visible, labels heuristics.",
        inputSchema: zodToJsonSchema(ValidateA11yInput),
      },
      {
        name: "ensure-dark-mode-compatibility",
        description: "Ensure-dark-mode-compatibility: require token theming and/or dark: variants.",
        inputSchema: zodToJsonSchema(EnsureDarkModeInput),
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params ?? {};
  const tokens = await readTokens();
  const palette = tokens.colors ?? {};
  const allowedHex = uniq(Object.values(palette).map((c) => c.toLowerCase()));
  const preferredDir = tokens.componentLibrary?.preferredSubdir ?? "components/ui";

  if (name === "access-component-library") {
    const parsed = AccessComponentLibraryInput.parse(args);
    await ensureComponentLibraryDir(preferredDir);
    const files = await listComponents(preferredDir);
    const q = parsed.query?.toLowerCase().trim();
    const filtered = q ? files.filter((f) => f.toLowerCase().includes(q)) : files;
    const limit = Math.max(1, Math.min(parsed.limit ?? 50, 200));
    const picked = filtered.slice(0, limit);
    const items = parsed.include_source
      ? await Promise.all(picked.map(async (p) => ({ path: p, source: await readFile(join(repoRoot, p), "utf-8") })))
      : picked.map((p) => ({ path: p }));
    return { content: [{ type: "text", text: JSON.stringify({ preferredDir, count: filtered.length, items }, null, 2) }] };
  }

  if (name === "validate-brand-consistency") {
    const parsed = ValidateBrandConsistencyInput.parse(args);
    const hexes = findHexColors(parsed.component_source);
    const offPalette = hexes.filter((h) => !allowedHex.includes(h));
    const nonTokenTailwind = findNonTokenTailwindColors(parsed.component_source);
    const issues: string[] = [];
    if (!hasTokenColorUsage(parsed.component_source)) {
      issues.push("Token color classes not detected (bg-background/bg-surface/bg-accent/text-textPrimary/text-textMuted).");
    }
    if (!/\bfont-(heading|body)\b/.test(parsed.component_source)) {
      issues.push("Typography tokens not detected (font-heading / font-body).");
    }
    if (offPalette.length) issues.push(`Found non-token hex colors: ${uniq(offPalette).join(", ")}`);
    if (nonTokenTailwind.length) issues.push(`Found non-token Tailwind colors: ${nonTokenTailwind.join(", ")}`);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              component: parsed.component_name,
              brand: tokens.brand ?? null,
              ok: issues.length === 0,
              issues,
              observations: { hex_colors_found: hexes, palette },
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  if (name === "apply-color-palette") {
    const parsed = ApplyColorPaletteInput.parse(args);
    const hexes = findHexColors(parsed.css_or_tailwind_source);
    const suggestions: Record<string, string[]> = {};
    for (const h of hexes) {
      if (allowedHex.includes(h)) continue;
      suggestions[h] = Object.entries(palette).map(([k, v]) => `${k}: ${v}`);
    }
    return { content: [{ type: "text", text: JSON.stringify({ suggestions, palette }, null, 2) }] };
  }

  if (name === "ensure-typography-standards") {
    const parsed = EnsureTypographyInput.parse(args);
    const issues: string[] = [];
    if (!/\bfont-body\b/.test(parsed.component_source)) issues.push("`font-body` not found; body/UI copy should use `font-body`.");
    if (/<h\d|role=["']heading["']/.test(parsed.component_source) && !/\bfont-heading\b/.test(parsed.component_source)) {
      issues.push("Heading detected but `font-heading` not found.");
    }
    if (!/\btext-/.test(parsed.component_source)) issues.push("No explicit text size utilities detected (text-sm/text-base/etc).");
    return { content: [{ type: "text", text: JSON.stringify({ ok: issues.length === 0, issues }, null, 2) }] };
  }

  if (name === "check-responsive-design") {
    const parsed = CheckResponsiveInput.parse(args);
    const issues: string[] = [];
    if (!/\b(sm:|md:|lg:|xl:|2xl:)/.test(parsed.component_source)) issues.push("No responsive breakpoint classes found (sm:/md:/lg:/xl:).");
    const fixedPx = parsed.component_source.match(/\bw-\[\d+px\]|\bh-\[\d+px\]|\bmax-w-\[\d+px\]/g) ?? [];
    if (fixedPx.length) issues.push(`Found fixed px sizing: ${uniq(fixedPx).join(", ")}`);
    return { content: [{ type: "text", text: JSON.stringify({ ok: issues.length === 0, issues }, null, 2) }] };
  }

  if (name === "validate-accessibility-standards") {
    const parsed = ValidateA11yInput.parse(args);
    const issues: string[] = [];
    const missingAlt = findImgMissingAlt(parsed.component_source);
    if (missingAlt) issues.push(`Found ${missingAlt} <img> tags missing alt text.`);
    const focusOffenders = findInteractiveElementsWithoutFocus(parsed.component_source);
    if (focusOffenders.length) issues.push("Some interactive elements appear to lack focus-visible styling.");
    if (/<input\b/.test(parsed.component_source) && !/\baria-label=|\baria-labelledby=|<label\b[^>]*htmlFor=/.test(parsed.component_source)) {
      issues.push("Inputs detected without aria-label/aria-labelledby and no associated <label htmlFor=…> detected.");
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ok: issues.length === 0,
              issues,
              focus_examples: focusOffenders,
              guidance: { minTapTargetPx: tokens.accessibility?.minTapTargetPx ?? 44 },
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  if (name === "ensure-dark-mode-compatibility") {
    const parsed = EnsureDarkModeInput.parse(args);
    const ok = includesDarkModeSignal(parsed.component_source) || hasTokenColorUsage(parsed.component_source);
    const issues: string[] = [];
    if (!ok) issues.push("No dark mode signal (dark:) and token colors not detected.");
    return { content: [{ type: "text", text: JSON.stringify({ ok, issues }, null, 2) }] };
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  if (existsSync(join(repoRoot, "package.json"))) {
    // keep alive for stdio transport
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

