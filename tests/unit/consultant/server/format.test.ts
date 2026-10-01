import { callCommunication, formatDuration, summaryToMarkdown, transcriptForPrompt } from "../../../../lib/consultant/server/format";
import { SAMPLE_SUMMARY } from "./fixtures";

describe("summaryToMarkdown", () => {
  const md = summaryToMarkdown(SAMPLE_SUMMARY);

  test("has every section a consultant needs, in order", () => {
    const order = ["## Summary", "## Key points", "## Objections", "## NEPQ stages", "## Next steps", "## Coaching tips", "## Recommendation", "## Captured details"];
    const idx = order.map((h) => md.indexOf(h));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });

  test("objections show handled state, the exact quote and a better response", () => {
    expect(md).toContain("- **Already have a receptionist** — handled");
    expect(md).toContain('  > "we already have a receptionist"');
    expect(md).toContain("- **Send an email** — not handled");
    expect(md).toContain("  - Better response: Happy to");
  });

  test("NEPQ stages are listed in canonical order with checkboxes", () => {
    const conn = md.indexOf("[x] Connection");
    const sit = md.indexOf("[x] Situation — Asked about call volume");
    const cons = md.indexOf("[ ] Consequence — Never asked");
    expect(conn).toBeGreaterThan(-1);
    expect(conn).toBeLessThan(sit);
    expect(sit).toBeLessThan(cons);
  });

  test("recommendation uses labels; empty sections are omitted", () => {
    expect(md).toContain("- Stage: Discovery booked");
    expect(md).toContain("- Disposition: Demo booked");
    const bare = summaryToMarkdown({ ...SAMPLE_SUMMARY, keyPoints: [], objections: [], nextSteps: [], coachingTips: [], nepqStages: [] });
    expect(bare).not.toContain("## Key points");
    expect(bare).not.toContain("## Objections");
    expect(bare).not.toContain("## NEPQ stages");
  });
});

describe("transcriptForPrompt", () => {
  test("labels speakers, orders by seq and collapses whitespace", () => {
    const out = transcriptForPrompt([
      { seq: 2, speaker: "prospect", text: "Who is  this?\n" },
      { seq: 1, speaker: "consultant", text: "Hi, it's Thabo from VantageStack." },
      { seq: 3, speaker: "prospect", text: "   " },
    ]);
    expect(out).toBe("[1] Consultant: Hi, it's Thabo from VantageStack.\n[2] Clinic: Who is this?");
  });

  test("empty transcript → empty string", () => {
    expect(transcriptForPrompt([])).toBe("");
  });
});

describe("callCommunication (CRM client_communications row)", () => {
  test("preview is the summary when ready", () => {
    const c = callCommunication({ status: "completed", disposition: "demo_booked", talkSec: 185, summary: SAMPLE_SUMMARY });
    expect(c.subject).toBe("Call · 3m 05s · Demo booked");
    expect(c.preview).toBe(SAMPLE_SUMMARY.summary);
  });

  test("falls back to the subject and caps the preview length", () => {
    expect(callCommunication({ status: "failed", disposition: null, talkSec: 0, summary: null })).toEqual({
      subject: "Call · 0s · Failed",
      preview: "Call · 0s · Failed",
    });
    const long = callCommunication({ status: "completed", disposition: null, talkSec: 5, summary: { ...SAMPLE_SUMMARY, summary: "x".repeat(2000) } });
    expect(long.preview.length).toBeLessThanOrEqual(500);
    expect(long.preview.endsWith("…")).toBe(true);
  });

  test("formatDuration", () => {
    expect(formatDuration(null)).toBe("0s");
    expect(formatDuration(59)).toBe("59s");
    expect(formatDuration(60)).toBe("1m 00s");
  });
});
