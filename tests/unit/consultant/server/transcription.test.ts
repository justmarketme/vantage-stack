import { parseTranscriptionEvent, speakerForTrack } from "../../../../lib/consultant/server/transcription";

const content = (over: Record<string, string> = {}) => ({
  TranscriptionEvent: "transcription-content",
  TranscriptionData: JSON.stringify({ transcript: "  We already  have a receptionist ", confidence: 0.93 }),
  Track: "outbound_track",
  Final: "true",
  Timestamp: "2026-09-30T08:15:02.123Z",
  ...over,
});

describe("speakerForTrack (parent / browser leg)", () => {
  test("inbound_track is the consultant, outbound_track is the clinic", () => {
    expect(speakerForTrack("inbound_track")).toBe("consultant");
    expect(speakerForTrack("outbound_track")).toBe("prospect");
    expect(speakerForTrack("both_tracks")).toBeNull();
    expect(speakerForTrack(undefined)).toBeNull();
  });
});

describe("parseTranscriptionEvent", () => {
  test("final content → normalised text, speaker and Twilio timestamp", () => {
    expect(parseTranscriptionEvent(content())).toEqual({
      kind: "content",
      speaker: "prospect",
      text: "We already have a receptionist",
      at: new Date("2026-09-30T08:15:02.123Z"),
    });
    expect(parseTranscriptionEvent(content({ Track: "inbound_track" }))).toMatchObject({ speaker: "consultant" });
  });

  test("partial results are never stored", () => {
    expect(parseTranscriptionEvent(content({ Final: "false" }))).toEqual({ kind: "ignored" });
    expect(parseTranscriptionEvent(content({ Final: "" }))).toEqual({ kind: "ignored" });
  });

  test("malformed or empty data is ignored", () => {
    expect(parseTranscriptionEvent(content({ TranscriptionData: "{not json" }))).toEqual({ kind: "ignored" });
    expect(parseTranscriptionEvent(content({ TranscriptionData: JSON.stringify({ transcript: "   " }) }))).toEqual({ kind: "ignored" });
    expect(parseTranscriptionEvent(content({ Track: "mystery" }))).toEqual({ kind: "ignored" });
  });

  test("missing timestamp falls back to now", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(parseTranscriptionEvent(content({ Timestamp: "" }), now)).toMatchObject({ at: now });
  });

  test.each([
    ["transcription-started", "started"],
    ["transcription-stopped", "stopped"],
    ["transcription-error", "error"],
    ["something-else", "ignored"],
  ])("%s → %s", (event, kind) => {
    expect(parseTranscriptionEvent({ TranscriptionEvent: event })).toEqual({ kind });
  });
});
