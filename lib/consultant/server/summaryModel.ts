import { z } from "zod/v4";
import { CALL_DISPOSITIONS, NEPQ_STAGES, SALES_STAGES, type CallSummary } from "../types";

/**
 * Coach Alex post-call analysis — the model contract (3.2 lens).
 *
 * `CallSummarySchema` mirrors `CallSummary` in types.ts exactly (compile-time parity check
 * below + a unit test) and is sent as the structured-output format, so the API constrains
 * decoding to it and the SDK validates the result. It uses `zod/v4` because the SDK's output
 * format helpers are built on it.
 */
export const CallSummarySchema = z.object({
  summary: z.string(),
  keyPoints: z.array(z.string()),
  objections: z.array(
    z.object({
      objection: z.string(),
      handled: z.boolean(),
      quote: z.string().nullable(),
      betterResponse: z.string().nullable(),
    }),
  ),
  nepqStages: z.array(
    z.object({
      stage: z.enum(NEPQ_STAGES),
      reached: z.boolean(),
      note: z.string().nullable(),
    }),
  ),
  nextSteps: z.array(z.string()),
  recommendedStage: z.enum(SALES_STAGES).nullable(),
  recommendedDisposition: z.enum(CALL_DISPOSITIONS).nullable(),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  coachingTips: z.array(z.string()),
  extracted: z.object({
    email: z.string().nullable(),
    website: z.string().nullable(),
    decisionMaker: z.string().nullable(),
    painPoints: z.array(z.string()),
  }),
});

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
/** Fails to compile if the schema and the CallSummary contract drift apart. */
export type CallSummaryParity = Assert<Equals<z.infer<typeof CallSummarySchema>, CallSummary>>;

/**
 * Stable system prompt — lives in `ai-configs/coach-alex/review-prompt.ts` (prompt isolation).
 * Re-exported here so existing imports keep working.
 */
export { COACH_ALEX_SYSTEM } from "../../../ai-configs/coach-alex/review-prompt";

