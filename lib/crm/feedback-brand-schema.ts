import { z } from "zod";

const hex = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
// Google Fonts family names only (they are loaded from fonts.googleapis.com).
const font = z.string().trim().regex(/^[A-Za-z0-9 ]{2,40}$/, "Use a Google Fonts family name");

/** Every brand token a link can override; anything omitted falls back to what was detected from the proposal site. */
export const BrandOverride = z
  .object({
    name: z.string().trim().max(60).optional(),
    logo: z
      .string()
      .trim()
      .max(20000)
      .refine((v) => /^https:\/\//i.test(v) || /^data:image\/(svg\+xml|png|jpeg|webp)[;,]/i.test(v), "Logo must be an https URL or an image data URL")
      .optional(),
    logoWide: z.boolean().optional(),
    icon: z.string().trim().max(2000).refine((v) => /^https:\/\//i.test(v), "Icon must be an https URL").optional(),
    mode: z.enum(["light", "dark"]).optional(),
    bg: hex.optional(),
    surface: hex.optional(),
    text: hex.optional(),
    muted: hex.optional(),
    border: hex.optional(),
    accent: hex.optional(),
    accentText: hex.optional(),
    highlight: hex.optional(),
    displayFont: font.optional(),
    bodyFont: font.optional(),
    radius: z.number().int().min(0).max(24).optional(),
    headingCase: z.enum(["none", "uppercase"]).optional(),
    headingWeight: z.number().int().min(300).max(900).optional(),
    numeralFont: font.optional(),
    ornament: hex.optional(),
    band: z
      .object({
        bg: hex,
        text: hex,
        headline: hex,
        logo: z.string().trim().max(20000).refine((v) => /^https:\/\//i.test(v), "Band logo must be an https URL").optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
