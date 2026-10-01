import { CUE_MAX_WORDS, cueFor, detectOutput, pickVoice } from "../../../../lib/consultant/client/coachAudio";
import { COACH_CARDS } from "../../../../lib/consultant/coach/cards";

const out = (label: string, deviceId = "default") => ({ kind: "audiooutput", label, deviceId });

describe("Coach Alex audio cues", () => {
  it("detectOutput: headset vs speaker vs unknown (best effort)", () => {
    expect(detectOutput([out("Default - Jabra Evolve2 65 (0b0e:030c)")])).toBe("headset");
    expect(detectOutput([out("Default - AirPods Pro")])).toBe("headset");
    expect(detectOutput([out("Default - MacBook Pro Speakers (Built-in)")])).toBe("speaker");
    expect(detectOutput([out("Default - Realtek HD Audio")])).toBe("unknown");
    expect(detectOutput([out("", "abc")])).toBe("unknown"); // no labels before mic permission
    expect(detectOutput([{ kind: "audioinput", label: "Headset mic", deviceId: "x" }])).toBe("unknown");
    // No "default" entry: only a single output is trusted.
    expect(detectOutput([out("Bluetooth Headphones", "a1")])).toBe("headset");
    expect(detectOutput([out("Bluetooth Headphones", "a1"), out("Speakers", "a2")])).toBe("unknown");
  });

  it("cueFor: ≤6 words, only high-risk and stall cards", () => {
    expect(cueFor({ severity: "high_risk", title: "Too expensive / “What does it cost?”" })).toBe("Objection: too expensive");
    expect(cueFor({ severity: "stall", title: "Gatekeeper: “What's this regarding?”" })).toBe("Stall: gatekeeper");
    expect(cueFor({ severity: "guide", title: "Connection — earn thirty seconds" })).toBeNull();
    for (const card of COACH_CARDS) {
      const cue = cueFor(card);
      if (card.severity === "guide") expect(cue).toBeNull();
      else expect(cue!.split(/\s+/).length).toBeLessThanOrEqual(CUE_MAX_WORDS);
    }
  });

  it("pickVoice prefers en-ZA, then en-GB, then any English", () => {
    const v = (lang: string) => ({ lang, name: lang });
    expect(pickVoice([v("en-US"), v("en_ZA"), v("en-GB")])!.lang).toBe("en_ZA");
    expect(pickVoice([v("en-US"), v("en-GB")])!.lang).toBe("en-GB");
    expect(pickVoice([v("af-ZA"), v("en-AU")])!.lang).toBe("en-AU");
    expect(pickVoice([v("zu-ZA")])).toBeNull();
  });
});
