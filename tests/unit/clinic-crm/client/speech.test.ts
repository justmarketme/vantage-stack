import {
  SPEECH_CONFIG,
  SPEECH_ERRORS,
  extractPhone,
  mapSpeechError,
  normalizeTranscript,
  validateTranscript,
} from "../../../../lib/clinic-crm/client/speech";

describe("normalizeTranscript", () => {
  it("trims, collapses whitespace and capitalises the first letter", () => {
    expect(normalizeTranscript("   patient   called  back  ")).toBe("Patient called back");
  });
  it("turns spoken punctuation into symbols", () => {
    expect(normalizeTranscript("hi thandi comma your appointment is confirmed full stop see you tomorrow")).toBe(
      "Hi thandi, your appointment is confirmed. See you tomorrow",
    );
    expect(normalizeTranscript("can you come in earlier question mark")).toBe("Can you come in earlier?");
    expect(normalizeTranscript("great exclamation mark")).toBe("Great!");
  });
  it("does not treat the word period as punctuation (clinical word)", () => {
    expect(normalizeTranscript("last period two weeks ago")).toBe("Last period two weeks ago");
  });
  it("keeps decimals and times intact", () => {
    expect(normalizeTranscript("dose 2.5 mg at 10:30")).toBe("Dose 2.5 mg at 10:30");
  });
  it("handles empty input", () => {
    expect(normalizeTranscript("")).toBe("");
    expect(normalizeTranscript("  comma  ")).toBe("");
  });
});

describe("validateTranscript", () => {
  it("rejects empty", () => {
    expect(validateTranscript("  ")).toBe(SPEECH_ERRORS.empty);
  });
  it("rejects below the configured confidence threshold", () => {
    expect(SPEECH_CONFIG.minConfidence).toBe(0.6);
    expect(validateTranscript("hello", { confidence: 0.4 })).toBe(SPEECH_ERRORS["low-confidence"]);
    expect(validateTranscript("hello", { confidence: 0.7 })).toBeNull();
    expect(validateTranscript("hello", { confidence: 0.7, minConfidence: 0.8 })).toBe(
      SPEECH_ERRORS["low-confidence"],
    );
  });
  it("treats 0/undefined confidence as unreported unless required", () => {
    expect(validateTranscript("hello", { confidence: 0 })).toBeNull();
    expect(validateTranscript("hello")).toBeNull();
    expect(validateTranscript("hello", { requireConfidence: true })).toBe(SPEECH_ERRORS["low-confidence"]);
  });
  it("rejects over-length", () => {
    expect(validateTranscript("x".repeat(11), { maxLen: 10 })).toBe(SPEECH_ERRORS["too-long"]);
    expect(validateTranscript("x".repeat(10), { maxLen: 10 })).toBeNull();
  });
});

describe("extractPhone", () => {
  it.each([
    ["082 555 1234", "+27825551234"],
    ["oh eight two five five five one two three four", "+27825551234"],
    ["zero eight two double five five one two three four", "+27825551234"],
    ["oh eighty two triple five twelve thirty four", "+27825551234"],
    ["my number is 082-555-1234 thanks", "+27825551234"],
    ["plus two seven eight two five five five one two three four", "+27825551234"],
    ["+27 82 555 1234", "+27825551234"],
    ["number for Thandi is oh eight two five five five one two three four", "+27825551234"],
    ["oh eight two five to five one two three four", "+27825251234"],
  ])("%s -> %s", (spoken, expected) => {
    expect(extractPhone(spoken)).toBe(expected);
  });
  it("returns null when there is no plausible number", () => {
    expect(extractPhone("call me tomorrow")).toBeNull();
    expect(extractPhone("five five five")).toBeNull();
    expect(extractPhone("")).toBeNull();
    expect(extractPhone("constructor toString")).toBeNull();
  });
});

describe("mapSpeechError", () => {
  it("maps known codes to friendly text and ignores user aborts", () => {
    expect(mapSpeechError("not-allowed")).toMatch(/Microphone access is blocked/);
    expect(mapSpeechError("no-speech")).toBe(SPEECH_ERRORS["no-speech"]);
    expect(mapSpeechError("network")).toBe(SPEECH_ERRORS.network);
    expect(mapSpeechError("weird")).toBe(SPEECH_ERRORS.unknown);
    expect(mapSpeechError("aborted")).toBeNull();
  });
});
