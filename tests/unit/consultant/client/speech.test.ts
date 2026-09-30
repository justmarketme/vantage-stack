import {
  normaliseDictation,
  normaliseMedicalTerms,
  normaliseSpokenEmail,
  normaliseSpokenPhone,
  normaliseSpokenUrl,
  validateSpoken,
} from "../../../../lib/consultant/client/speech";

describe("normaliseSpokenEmail", () => {
  it.each([
    ["jane dot smith at gmail dot com", "jane.smith@gmail.com"],
    ["my email is j a n e underscore doe at the rate outlook dot com", "jane_doe@outlook.com"],
    ["info at glow clinic dot co dot za", "info@glowclinic.co.za"],
    ["jane twenty three at gmail", "jane23@gmail.com"],
    ["bookings dash cpt plus spam at mweb", "bookings-cpt+spam@mweb.co.za"],
    ["reception hyphen one at skin clinic dot co za", "reception-1@skinclinic.co.za"],
    ["double l a at hotmail dot com", "lla@hotmail.com"],
    ["Jane.Smith@Gmail.com", "jane.smith@gmail.com"],
    ["sarah at gmial dot com", "sarah@gmail.com"],
    ["dr sarah at the skin clinic co za", "drsarah@theskinclinic.co.za"],
    ["it's thandi at sign telkomsa", "thandi@telkomsa.net"],
    ["capital J ane at icloud", "jane@icloud.com"],
    ["", ""],
  ])("%s → %s", (input, expected) => {
    expect(normaliseSpokenEmail(input)).toBe(expected);
  });
});

describe("normaliseSpokenUrl", () => {
  it.each([
    ["www dot glow clinic dot co dot za slash book", "https://www.glowclinic.co.za/book"],
    ["glow clinic dot co dot za", "https://glowclinic.co.za"],
    ["www glow clinic dot co dot za", "https://www.glowclinic.co.za"],
    ["h t t p s colon slash slash the one clinic dot com", "https://theoneclinic.com"],
    ["http colon slash slash old site dot co dot za", "http://oldsite.co.za"],
    ["triple w dot skin twenty four seven dot com", "https://www.skin247.com"],
    ["dub dub dub dot la belle dash aesthetics dot co dot za slash bookings", "https://www.labelle-aesthetics.co.za/bookings"],
    ["the website is glow clinic dot coza", "https://glowclinic.co.za"],
    ["https://www.glowclinic.co.za/book.", "https://www.glowclinic.co.za/book"],
  ])("%s → %s", (input, expected) => {
    expect(normaliseSpokenUrl(input)).toBe(expected);
  });
});

describe("normaliseSpokenPhone", () => {
  it.each([
    ["oh eight two five five five one two three four", "+27825551234"],
    ["zero eight two five five five one two three four", "+27825551234"],
    ["plus two seven double seven one two three four five six seven", "+27771234567"],
    ["zero twenty one, four eight oh, one two three four", "+27214801234"],
    ["082 555 1234", "+27825551234"],
    ["+27 82 555 1234", "+27825551234"],
    ["my number is oh seven two triple five, eight nine oh one", "+27725558901"],
    ["oh eight two five five five one two", "08255512"], // too short → best effort, not E.164
  ])("%s → %s", (input, expected) => {
    expect(normaliseSpokenPhone(input)).toBe(expected);
  });
});

describe("normaliseMedicalTerms", () => {
  it.each([
    ["she wants botox and dermal fillas", "she wants Botox and dermal fillers"],
    ["some hyaluronic acid", "some hyaluronic acid"],
    ["high a luronic acid", "hyaluronic acid"],
    ["micro needling or p r p", "microneedling or PRP"],
    ["r f micro needling", "RF microneedling"],
    ["hydra facials and chemical peals", "HydraFacials and chemical peels"],
    ["cool sculpting, morpheus eight and i p l", "CoolSculpting, Morpheus8 and IPL"],
    ["lip filla and a thread lift", "lip filler and a thread lift"],
    ["juvederm, restylane, pro filo", "Juvéderm, Restylane, Profhilo"],
    ["laser hair removal and a c o two laser", "laser hair removal and a CO2 laser"],
    ["h i f u and derma planing", "HIFU and dermaplaning"],
    ["Profhilo and Botox stay as is", "Profhilo and Botox stay as is"],
  ])("%s → %s", (input, expected) => {
    expect(normaliseMedicalTerms(input)).toBe(expected);
  });

  it("dictation: spoken punctuation + terms + sentence case", () => {
    expect(
      normaliseDictation("patient asked about lip fillers full stop call back tuesday comma after two question mark"),
    ).toBe("Patient asked about lip fillers. Call back tuesday, after two?");
    expect(normaliseDictation("owner loves botox new line follow up friday")).toBe("Owner loves Botox\nFollow up friday");
  });
});

describe("validateSpoken (contract zod)", () => {
  it("email", () => {
    expect(validateSpoken("email", "jane at gmail")).toEqual({ ok: true, value: "jane@gmail.com" });
    const bad = validateSpoken("email", "jane smith");
    expect(bad.ok).toBe(false);
    expect(bad.value).toBe("janesmith");
    expect(bad.error).toBeTruthy();
    expect(validateSpoken("email", "").ok).toBe(false);
  });
  it("url", () => {
    expect(validateSpoken("url", "www dot glow clinic dot co dot za slash book")).toEqual({
      ok: true,
      value: "https://www.glowclinic.co.za/book",
    });
    expect(validateSpoken("url", "glow clinic").ok).toBe(false); // no TLD
  });
  it("phone", () => {
    expect(validateSpoken("phone", "oh eight two five five five one two three four")).toEqual({ ok: true, value: "+27825551234" });
    const short = validateSpoken("phone", "oh eight two");
    expect(short.ok).toBe(false);
    expect(short.value).toBe("082");
  });
  it("text", () => {
    expect(validateSpoken("text", "wants botox full stop")).toEqual({ ok: true, value: "Wants Botox." });
    expect(validateSpoken("text", "   ").ok).toBe(false);
  });
});
