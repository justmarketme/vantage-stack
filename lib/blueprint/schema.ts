import { z } from "zod";

function normalizePhone(input: string) {
  const raw = (input || "").trim();
  if (!raw) return "";
  const plus = raw.startsWith("+") ? "+" : "";
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? plus + digits : "";
}

export function isValidWhatsapp(input: string): boolean {
  const norm = normalizePhone(input);
  const digits = norm.replace(/[^\d]/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

export function normalizeWebsiteUrl(input: string): string {
  const raw = (input || "").trim();
  if (!raw) return "";
  const withProto = raw.includes("://") ? raw : `https://${raw}`;
  try {
    const u = new URL(withProto);
    if (!u.hostname) return "";
    u.hash = "";
    if (u.pathname === "/") u.pathname = "";
    return u.toString();
  } catch {
    return "";
  }
}

export function parseMonthlyBudgetToInt(input: string | undefined): number | null {
  const raw = (input || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase().replace(/[,]/g, "");
  const m = lower.match(/(\d+(\.\d+)?)(\s*(k|m))?/);
  if (!m) return null;
  let n = Number(m[1]);
  const unit = m[4];
  if (unit === "k") n *= 1_000;
  if (unit === "m") n *= 1_000_000;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

export function splitListish(v: string): string[] {
  const raw = (v || "").trim();
  if (!raw) return [];
  const lines = raw
    .split(/\r?\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const parts: string[] = [];
  for (const line of lines.length ? lines : [raw]) {
    const dense = (line.match(/[,;•]/g) || []).length >= 1;
    if (dense) {
      parts.push(
        ...line
          .split(/[,;•]+/g)
          .map((s) => s.trim())
          .filter(Boolean),
      );
    } else {
      parts.push(line);
    }
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

export const BlueprintSubmitSchema = z.object({
  // ── Step 1 ──────────────────────────────────────────────────────
  clientName: z.string().trim().min(1, "Name is required."),
  email: z.string().trim().toLowerCase().email("Please enter a valid email address."),
  whatsapp: z
    .string()
    .trim()
    .min(1, "WhatsApp number is required.")
    .refine(isValidWhatsapp, "Please enter a valid WhatsApp number (include country code if possible)."),
  industry: z.string().trim().min(1, "Industry is required."),
  revenueRange: z.string().trim().min(1, "Revenue range is required."),

  // Branch trigger — LEADS | PRESENCE | AUTOMATION | EXPLORE
  primaryIntent: z.string().trim().optional(),

  // ── Step 2 Path A (LEADS) ────────────────────────────────────────
  enquiryVolume: z.string().trim().optional(),
  followUpMethod: z.string().trim().optional(),
  missedCallHandling: z.string().trim().optional(),

  // ── Step 2 Path B (PRESENCE) ─────────────────────────────────────
  currentWebsiteStatus: z.string().trim().optional(),
  googleMapsStatus: z.string().trim().optional(),
  // Multi-select: what visitors should do
  websiteGoal: z
    .union([z.array(z.string()), z.string()])
    .optional()
    .transform((v) => (Array.isArray(v) ? v : splitListish(v || ""))),
  serveArea: z.string().trim().optional(),

  // ── Step 2 Path C (AUTOMATION) ───────────────────────────────────
  // Multi-select (max 2): biggest time drains
  biggestTimeWaste: z
    .union([z.array(z.string()), z.string()])
    .optional()
    .transform((v) => (Array.isArray(v) ? v : splitListish(v || ""))),
  toolsUsed: z
    .union([z.array(z.string()), z.string()])
    .optional()
    .transform((v) => (Array.isArray(v) ? v : splitListish(v || ""))),
  teamSize: z.string().trim().optional(),

  // ── Step 2 Path D (EXPLORE) ──────────────────────────────────────
  biggestFrustration: z.string().trim().optional(),
  packagePreference: z.string().trim().optional(),

  // ── Shared across paths ──────────────────────────────────────────
  clientAcquisition: z.string().trim().optional(),
  monthlyBudget: z.string().trim().optional(),

  // ── Step 3 (Contact) ─────────────────────────────────────────────
  websiteUrl: z
    .string()
    .trim()
    .optional()
    .transform((v) => v ?? "")
    .refine((v) => (v ? Boolean(normalizeWebsiteUrl(v)) : true), "Please enter a valid website URL (or leave blank)."),
  preferredContactTime: z.string().trim().optional(),

  // ── Detailed mode / CRM fields (kept for backward compat) ────────
  challenges: z
    .union([z.array(z.string()), z.string()])
    .optional()
    .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : splitListish(v))),
  competitors: z
    .union([z.array(z.string()), z.string()])
    .optional()
    .transform((v) => (Array.isArray(v) ? v : splitListish(v || ""))),
  currentMarketing: z.string().trim().optional().default(""),
  packageIntent: z.string().trim().optional(),
  successGoals: z.string().trim().optional(),
  existingCrmStatus: z.string().trim().optional(),

  // Social media
  socialInstagram: z.string().trim().optional().default(""),
  socialTiktok: z.string().trim().optional().default(""),
  socialFacebook: z.string().trim().optional().default(""),
  socialX: z.string().trim().optional().default(""),
  socialYoutube: z.string().trim().optional().default(""),
});

export type BlueprintSubmit = z.infer<typeof BlueprintSubmitSchema>;
