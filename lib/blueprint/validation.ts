import { z } from "zod";

export const BlueprintSubmissionSchema = z.object({
  businessName: z.string().min(1),
  industry: z.string().min(1),
  websiteStatus: z.enum(["yes", "no", "outdated"]),
  websiteUrl: z.string().url().optional().or(z.literal("")),
  leadSource: z.string().min(1),
  responseSpeed: z.string().min(1),
  biggestChallenge: z.string().min(1),
  revenueRange: z.string().optional().or(z.literal("")),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(6),
});

export type BlueprintSubmission = z.infer<typeof BlueprintSubmissionSchema>;

export function validateBlueprintSubmission(input: unknown) {
  const parsed = BlueprintSubmissionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.flatten() };
  }
  const data = parsed.data;

  // If user says they have a website, require a URL.
  if (data.websiteStatus !== "no" && !String(data.websiteUrl || "").trim()) {
    return {
      ok: false as const,
      error: { formErrors: ["websiteUrl is required when websiteStatus is yes/outdated"], fieldErrors: { websiteUrl: ["Required"] } },
    };
  }

  return { ok: true as const, data };
}

