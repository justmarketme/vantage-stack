import { backoffDelay, isFatalPollStatus, maxSeq, mergeSegments } from "../../../../lib/consultant/client/live";
import type { TranscriptSegment } from "../../../../lib/consultant/types";

const s = (seq: number): TranscriptSegment => ({ seq, speaker: seq % 2 ? "prospect" : "consultant", text: `t${seq}`, at: "" });

describe("live transcript helpers", () => {
  it("appends in order and returns the same reference when nothing is new", () => {
    const a = [s(1), s(2)];
    expect(mergeSegments(a, [])).toBe(a);
    expect(mergeSegments(a, [s(1), s(2)])).toBe(a);
    expect(mergeSegments(a, [s(3), s(4)]).map((x) => x.seq)).toEqual([1, 2, 3, 4]);
  });

  it("de-duplicates by seq and sorts out-of-order batches", () => {
    const merged = mergeSegments([s(1), s(3)], [s(2), s(3), s(5), s(4), s(5)]);
    expect(merged.map((x) => x.seq)).toEqual([1, 2, 3, 4, 5]);
  });

  it("maxSeq / backoff / fatal statuses", () => {
    expect(maxSeq([s(4), s(9), s(2)])).toBe(9);
    expect(maxSeq([], 3)).toBe(3);
    expect(backoffDelay(1000, 0)).toBe(1000);
    expect(backoffDelay(1000, 1)).toBe(2000);
    expect(backoffDelay(1000, 3)).toBe(8000);
    expect(backoffDelay(1000, 9)).toBe(15000);
    expect(isFatalPollStatus(404)).toBe(true);
    expect(isFatalPollStatus(503)).toBe(false);
  });
});
