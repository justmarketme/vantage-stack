import { consultantConfig, type ConsultantConfig } from "../../../../lib/consultant/config";
import {
  buildDialTwiml,
  buildHangupTwiml,
  buildRefusalTwiml,
  buildWhisperTwiml,
  isFinalStatus,
  mapTwilioCallStatus,
  statusRank,
  voiceUrl,
} from "../../../../lib/consultant/server/voice";

function cfg(): ConsultantConfig {
  const base = consultantConfig();
  return {
    ...base,
    publicUrl: "https://portal.example.com",
    twilio: {
      ...base.twilio,
      callerId: "+27210000000",
      dialTimeoutSec: 25,
      maxCallSec: 1800,
      transcriptionLanguage: "en-ZA",
    },
    recording: { notice: "This call is recorded.", noticeVoice: "Polly.Joanna-Neural" },
  };
}

const CALL_ID = "0b6f3f9e-2a41-4a3c-9d7e-1f2a3b4c5d6e";

/** Tiny attribute reader for the flat TwiML we emit (no nested quotes in values). */
function attrs(xml: string, tag: string): Record<string, string> {
  const m = xml.match(new RegExp(`<${tag}(\\s[^>]*)?/?>`));
  if (!m) throw new Error(`no <${tag}> in ${xml}`);
  const out: Record<string, string> = {};
  for (const a of (m[1] ?? "").matchAll(/(\w+)="([^"]*)"/g)) out[a[1]] = a[2].replace(/&amp;/g, "&");
  return out;
}

describe("buildDialTwiml", () => {
  const xml = buildDialTwiml(cfg(), { callId: CALL_ID, to: "+27821234567" });

  test("starts both-track final-only transcription on the parent leg before dialling", () => {
    expect(xml.indexOf("<Start>")).toBeLessThan(xml.indexOf("<Dial"));
    expect(attrs(xml, "Transcription")).toEqual({
      statusCallbackUrl: `https://portal.example.com/api/consultant-voice/transcription?callId=${CALL_ID}`,
      statusCallbackMethod: "POST",
      track: "both_tracks",
      languageCode: "en-ZA",
      partialResults: "false",
    });
  });

  test("dials with dual recording, config limits and absolute callback URLs", () => {
    expect(attrs(xml, "Dial")).toEqual({
      callerId: "+27210000000",
      record: "record-from-answer-dual",
      recordingStatusCallback: `https://portal.example.com/api/consultant-voice/recording?callId=${CALL_ID}`,
      recordingStatusCallbackMethod: "POST",
      recordingStatusCallbackEvent: "completed absent",
      timeLimit: "1800",
      timeout: "25",
      action: `https://portal.example.com/api/consultant-voice/dial-complete?callId=${CALL_ID}`,
      method: "POST",
      answerOnBridge: "true",
    });
  });

  test("the Number leg plays the whisper and reports status for the clinic leg", () => {
    expect(attrs(xml, "Number")).toEqual({
      url: "https://portal.example.com/api/consultant-voice/whisper",
      method: "POST",
      statusCallback: `https://portal.example.com/api/consultant-voice/status?callId=${CALL_ID}`,
      statusCallbackEvent: "initiated ringing answered completed",
      statusCallbackMethod: "POST",
    });
    expect(xml).toMatch(/<Number [^>]*>\+27821234567<\/Number>/);
  });

  test("callback URLs carry only the opaque callId (no phone number)", () => {
    const urls = [...xml.matchAll(/https:\/\/[^"]+/g)].map((m) => m[0]);
    expect(urls.length).toBeGreaterThanOrEqual(5);
    for (const u of urls) expect(u).not.toContain("27821234567");
  });
});

describe("other TwiML", () => {
  test("whisper says the configured POPIA notice with the configured voice", () => {
    const xml = buildWhisperTwiml(cfg());
    expect(xml).toContain('<Say voice="Polly.Joanna-Neural">This call is recorded.</Say>');
    expect(xml).not.toContain("<Dial");
  });

  test("refusal says the message then hangs up", () => {
    const xml = buildRefusalTwiml(cfg(), "Sorry.");
    expect(xml).toMatch(/<Say[^>]*>Sorry\.<\/Say><Hangup\/>/);
  });

  test("dial-complete hangs up the browser leg", () => {
    expect(buildHangupTwiml()).toContain("<Hangup/>");
  });

  test("voiceUrl encodes the id and omits the query when absent", () => {
    expect(voiceUrl({ publicUrl: "https://x.test" }, "/p", "a b")).toBe("https://x.test/p?callId=a%20b");
    expect(voiceUrl({ publicUrl: "https://x.test" }, "/p")).toBe("https://x.test/p");
  });
});

describe("call status mapping", () => {
  test.each([
    ["queued", "initiated"],
    ["initiated", "initiated"],
    ["ringing", "ringing"],
    ["in-progress", "in_progress"],
    ["answered", "in_progress"],
    ["completed", "completed"],
    ["busy", "completed"],
    ["no-answer", "completed"],
    ["canceled", "completed"],
    ["failed", "failed"],
  ])("%s → %s", (twilio, ours) => {
    expect(mapTwilioCallStatus(twilio)).toBe(ours);
  });

  test("unknown / missing status is ignored", () => {
    expect(mapTwilioCallStatus("weird")).toBeNull();
    expect(mapTwilioCallStatus(undefined)).toBeNull();
  });

  test("status only moves forward; completed and failed are final", () => {
    expect(statusRank("initiated")).toBeLessThan(statusRank("ringing"));
    expect(statusRank("ringing")).toBeLessThan(statusRank("in_progress"));
    expect(statusRank("in_progress")).toBeLessThan(statusRank("completed"));
    expect(isFinalStatus("completed")).toBe(true);
    expect(isFinalStatus("failed")).toBe(true);
    expect(isFinalStatus("in_progress")).toBe(false);
  });
});
