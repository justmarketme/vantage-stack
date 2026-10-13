import { z } from "zod";

const hex = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
export const BrandOverride = z
  .object({
    name: z.string().trim().max(60).optional(),
    accent: hex.optional(),
    logo: z
      .string()
      .trim()
      .max(20000)
      .refine((v) => /^https:\/\//i.test(v) || /^data:image\/(svg\+xml|png|jpeg|webp)[;,]/i.test(v), "Logo must be an https URL or an image data URL")
      .optional(),
    mode: z.enum(["light", "dark"]).optional(),
  })
  .strict();
