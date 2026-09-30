/**
 * The Claude request shape for Coach Alex, verified against a mocked SDK: model from config,
 * explicit effort, beta server-side fallback with fallbacks:"default", structured output,
 * NO thinking / budget_tokens (400 on claude-opus-5-5), stop_reason checked before content.
 */
const parse = jest.fn();

jest.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status: number | undefined;
    constructor(status?: number) {
      super("api error");
      this.status = status;
    }
  }
  class RateLimitError extends APIError {}
  class AuthenticationError extends APIError {}
  class PermissionDeniedError extends APIError {}
  class BadRequestError extends APIError {}
  class NotFoundError extends APIError {}
  class Anthropic {
    static APIError = APIError;
    static RateLimitError = RateLimitError;
    static AuthenticationError = AuthenticationError;
    static PermissionDeniedError = PermissionDeniedError;
    static BadRequestError = BadRequestError;
    static NotFoundError = NotFoundError;
    beta = { messages: { parse: (...a: unknown[]) => parse(...a) } };
  }
  return { __esModule: true, default: Anthropic };
});

import Anthropic from "@anthropic-ai/sdk";
import { buildUserTurn, requestSummary, talkSeconds } from "../../../../lib/consultant/server/summarise";
import { COACH_ALEX_SYSTEM } from "../../../../lib/consultant/server/summaryModel";
import { MESSAGES } from "../../../../lib/consultant/server/constants";
import { SAMPLE_SUMMARY } from "./fixtures";

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("requestSummary", () => {
  test("sends the Opus 5.5 request shape", async () => {
    parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: SAMPLE_SUMMARY, content: [] });
    const out = await requestSummary("TURN");
    expect(out).toEqual({ ok: true, summary: SAMPLE_SUMMARY });

    const req = parse.mock.calls[0][0];
    expect(req.model).toBe(process.env.CONSULTANT_AI_MODEL?.trim() || "claude-opus-5-5");
    expect(req.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(req.fallbacks).toBe("default");
    expect(req.output_config.effort).toBe("medium");
    expect(req.output_config.format.type).toBe("json_schema");
    expect(req).not.toHaveProperty("thinking");
    expect(JSON.stringify(req)).not.toContain("budget_tokens");
    expect(req.system).toEqual([{ type: "text", text: COACH_ALEX_SYSTEM, cache_control: { type: "ephemeral" } }]);
    expect(req.messages).toEqual([{ role: "user", content: "TURN" }]);
  });

  test("a refusal is a failure that exhausts retries, without reading content", async () => {
    parse.mockResolvedValue({ stop_reason: "refusal", parsed_output: SAMPLE_SUMMARY });
    expect(await requestSummary("x")).toEqual({ ok: false, reason: MESSAGES.summaryRefused, exhaust: true });
  });

  test("max_tokens truncation retries", async () => {
    parse.mockResolvedValue({ stop_reason: "max_tokens", parsed_output: null });
    expect(await requestSummary("x")).toEqual({ ok: false, reason: MESSAGES.summaryTruncated });
  });

  test("unparseable output fails", async () => {
    parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: { summary: 1 } });
    expect(await requestSummary("x")).toMatchObject({ ok: false, reason: MESSAGES.summaryFailed });
  });

  test("rate limits are retryable; auth errors exhaust; nothing leaks the SDK message", async () => {
    const A = Anthropic as unknown as Record<string, new (s?: number) => Error>;
    parse.mockRejectedValueOnce(new A.RateLimitError(429));
    expect(await requestSummary("x")).toEqual({ ok: false, reason: MESSAGES.summaryFailed, exhaust: false });
    parse.mockRejectedValueOnce(new A.AuthenticationError(401));
    expect(await requestSummary("x")).toEqual({ ok: false, reason: MESSAGES.summaryFailed, exhaust: true });
    parse.mockRejectedValueOnce(new Error("socket hang up"));
    expect(await requestSummary("x")).toEqual({ ok: false, reason: MESSAGES.summaryFailed });
  });
});

describe("helpers", () => {
  test("talkSeconds uses answer → end, else 0 when never answered", () => {
    const answered = new Date("2026-09-30T10:00:00Z");
    expect(talkSeconds({ answered_at: answered, ended_at: new Date("2026-09-30T10:02:05Z"), duration_sec: 999 })).toBe(125);
    expect(talkSeconds({ answered_at: null, ended_at: new Date(), duration_sec: 40 })).toBe(0);
    expect(talkSeconds({ answered_at: answered, ended_at: null, duration_sec: 40 })).toBe(40);
  });

  test("the user turn wraps the transcript and carries call facts only", () => {
    const turn = buildUserTurn({ clinicName: "Glow Clinic", talkSec: 65, transcript: "[1] Clinic: Hello" });
    expect(turn).toContain("- Clinic: Glow Clinic");
    expect(turn).toContain("- Talk time: 1m 05s");
    expect(turn).toContain("<transcript>\n[1] Clinic: Hello\n</transcript>");
  });
});
