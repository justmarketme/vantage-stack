import { z } from "zod";
import { BlueprintSubmitSchema } from "../blueprint/schema";

const JumpStatus = z.enum([
  "blueprint-submitted",
  "manually-added",
  "report-sent",
  "proposal-sent",
  "active-client",
  "upsell-sent",
  "churned",
]);

/** CRM API + manual forms: blueprint fields plus intake options. */
export const CrmClientIntakeSchema = BlueprintSubmitSchema.extend({
  company: z.string().trim().optional().default(""),
  intake_source: z.enum(["blueprint_form", "crm_manual"]).default("crm_manual"),
  created_by: z.string().trim().optional(),
  skip_research: z.boolean().optional(),
  jump_to_status: JumpStatus.optional(),
});

export type CrmClientIntakeBody = z.infer<typeof CrmClientIntakeSchema>;
