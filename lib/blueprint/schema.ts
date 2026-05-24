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
  // E.164 allows up to 15 digits; WhatsApp numbers are typically >= 8 digits.
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
  clientName: z.string().trim().min(1, "Client name is required."),
  email: z.string().trim().toLowerCase().email("Please enter a valid email address."),
  whatsapp: z
    .string()
    .trim()
    .min(1, "WhatsApp number is required.")
    .refine(isValidWhatsapp, "Please enter a valid WhatsApp number (include country code if possible)."),
  websiteUrl: z
    .string()
    .trim()
    .optional()
    .transform((v) => v ?? "")
    .refine((v) => (v ? Boolean(normalizeWebsiteUrl(v)) : true), "Please enter a valid website URL (or leave blank)."),
  industry: z.string().trim().min(1, "Industry / niche is required."),
  revenueRange: z.string().trim().min(1, "Revenue range is required."),
  challenges: z
    .union([z.array(z.string()), z.string()])
    .optional()
    .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : splitListish(v))),
  competitors: z
    .union([z.array(z.string()), z.string()])
    .optional()
    .transform((v) => (Array.isArray(v) ? v : splitListish(v || ""))),
  currentMarketing: z.string().trim().min(1, "Please describe how you currently get clients."),
  toolsUsed: z
    .union([z.array(z.string()), z.string()])
    .optional()
    .transform((v) => (Array.isArray(v) ? v : splitListish(v || ""))),
  monthlyBudget: z.string().trim().optional(),
  packageIntent: z.string().trim().optional(),
  successGoals: z.string().trim().optional(),
  primaryIntent: z.string().trim().optional(),
  enquiryVolume: z.string().trim().optional(),
  followUpMethod: z.string().trim().optional(),
  missedCallHandling: z.string().trim().optional(),
  currentWebsiteStatus: z.string().trim().optional(),
  googleMapsStatus: z.string().trim().optional(),
  websiteGoal: z.string().trim().optional(),
  biggestTimeWaste: z.string().trim().optional(),
  existingCrmStatus: z.string().trim().optional(),
  preferredContactTime: z.string().trim().optional(),
  socialInstagram: z.string().trim().optional().default(""),
  socialTiktok: z.string().trim().optional().default(""),
  socialFacebook: z.string().trim().optional().default(""),
  socialX: z.string().trim().optional().default(""),
  socialYoutube: z.string().trim().optional().default(""),
});

export type BlueprintSubmit = z.infer<typeof BlueprintSubmitSchema>;

