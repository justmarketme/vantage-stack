import type { EmmaTemplate } from "../../../../ai-configs/emma/templates";

/**
 * Template rendering — pure. `{{name}}` placeholders are filled from the variables; a missing
 * required variable is an error (the message is dead-lettered, never sent half-filled).
 * Values are single-lined and length-capped so a variable can't smuggle in extra paragraphs.
 */

export class TemplateError extends Error {
  constructor(readonly code: "unknown_template" | "wrong_audience" | "missing_variables") {
    super(code);
    this.name = "TemplateError";
  }
}

const MAX_VALUE = 300;

export function cleanValue(v: string): string {
  return v.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, MAX_VALUE);
}

/** First name for a friendly greeting: "Thandi Nkosi" → "Thandi"; a title is kept ("Dr Nkosi"). */
export function greetingName(full: string | null | undefined, fallback = "there"): string {
  const s = cleanValue(full ?? "");
  if (!s) return fallback;
  const parts = s.split(" ");
  const titles = /^(dr|mr|mrs|ms|miss|prof)\.?$/i;
  return titles.test(parts[0]) && parts[1] ? `${parts[0]} ${parts[1]}` : parts[0];
}

export function placeholders(body: string): string[] {
  return [...new Set([...body.matchAll(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g)].map((m) => m[1]))];
}

export type Rendered = { body: string; contentVariables: Record<string, string> | null };

export function renderTemplate(t: EmmaTemplate, vars: Record<string, string>): Rendered {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) if (typeof v === "string") clean[k] = cleanValue(v);
  const needed = new Set([...placeholders(t.body), ...t.variables, ...(t.contentVariables ?? [])]);
  const missing = [...needed].filter((k) => !clean[k]);
  if (missing.length) throw new TemplateError("missing_variables");
  const body = t.body.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (_m, k: string) => clean[k]);
  const contentVariables = t.contentVariables
    ? Object.fromEntries(t.contentVariables.map((k, i) => [String(i + 1), clean[k]]))
    : null;
  return { body, contentVariables };
}
