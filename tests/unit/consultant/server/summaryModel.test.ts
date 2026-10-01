import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { CallSummarySchema, COACH_ALEX_SYSTEM } from "../../../../lib/consultant/server/summaryModel";
import { CALL_DISPOSITIONS, NEPQ_STAGES, SALES_STAGES, type CallSummary } from "../../../../lib/consultant/types";
import { SAMPLE_SUMMARY } from "./fixtures";

describe("CallSummarySchema ↔ CallSummary parity", () => {
  test("a full CallSummary round-trips unchanged", () => {
    const parsed: CallSummary = CallSummarySchema.parse(SAMPLE_SUMMARY);
    expect(parsed).toEqual(SAMPLE_SUMMARY);
  });

  test("top-level and nested keys match the contract exactly", () => {
    expect(Object.keys(CallSummarySchema.shape).sort()).toEqual(Object.keys(SAMPLE_SUMMARY).sort());
    expect(Object.keys(CallSummarySchema.shape.extracted.shape).sort()).toEqual(Object.keys(SAMPLE_SUMMARY.extracted).sort());
  });

  test("enums are the contract vocabularies", () => {
    expect(CallSummarySchema.shape.recommendedStage.unwrap().options).toEqual([...SALES_STAGES]);
    expect(CallSummarySchema.shape.recommendedDisposition.unwrap().options).toEqual([...CALL_DISPOSITIONS]);
    expect(CallSummarySchema.shape.nepqStages.element.shape.stage.options).toEqual([...NEPQ_STAGES]);
  });

  test("rejects out-of-vocabulary values and missing fields", () => {
    expect(CallSummarySchema.safeParse({ ...SAMPLE_SUMMARY, sentiment: "ecstatic" }).success).toBe(false);
    expect(CallSummarySchema.safeParse({ ...SAMPLE_SUMMARY, recommendedStage: "closed" }).success).toBe(false);
    const missing: Partial<CallSummary> = { ...SAMPLE_SUMMARY };
    delete missing.coachingTips;
    expect(CallSummarySchema.safeParse(missing).success).toBe(false);
  });

  test("builds a JSON-schema structured-output format for the API", () => {
    const fmt = betaZodOutputFormat(CallSummarySchema);
    expect(fmt.type).toBe("json_schema");
    const schema = fmt.schema as { type: string; required: string[]; additionalProperties: boolean };
    expect(schema.type).toBe("object");
    expect([...schema.required].sort()).toEqual(Object.keys(SAMPLE_SUMMARY).sort());
    expect(schema.additionalProperties).toBe(false);
  });
});

describe("Coach Alex system prompt", () => {
  test("is a stable constant (cacheable): no dates, ids or per-call content", () => {
    expect(COACH_ALEX_SYSTEM).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(COACH_ALEX_SYSTEM).toContain("NEPQ");
    expect(COACH_ALEX_SYSTEM).toMatch(/exact words/);
    expect(COACH_ALEX_SYSTEM).toMatch(/use null/i);
  });
});
