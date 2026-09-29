import {
  DEV_SKIP,
  expectedTwilioSignature,
  formToParams,
  validTwilioSignature,
} from "../../../../lib/clinic-crm/auth/twilioSignature";

// Twilio's documented example — https://www.twilio.com/docs/usage/security
const TOKEN = "12345";
const URL_ = "https://example.com/myapp.php?foo=1&bar=2";
const PARAMS = {
  Digits: "1234",
  To: "+18005551212",
  From: "+14158675310",
  Caller: "+14158675310",
  CallSid: "CA1234567890ABCDE",
};
const DOCUMENTED = "L/OH5YylLD5NRKLltdqwSvS0BnU=";

describe("Twilio signature", () => {
  it("DEV_SKIP is off under test", () => {
    expect(DEV_SKIP).toBe(false);
  });

  it("reproduces Twilio's documented example vector", () => {
    expect(expectedTwilioSignature(TOKEN, URL_, PARAMS)).toBe(DOCUMENTED);
  });

  it("accepts the documented signature", () => {
    expect(validTwilioSignature(URL_, PARAMS, DOCUMENTED, TOKEN)).toBe(true);
  });

  it("is independent of parameter insertion order", () => {
    const reversed = Object.fromEntries(Object.entries(PARAMS).reverse());
    expect(validTwilioSignature(URL_, reversed, DOCUMENTED, TOKEN)).toBe(true);
  });

  it("rejects a tampered parameter, URL, token, or signature", () => {
    expect(validTwilioSignature(URL_, { ...PARAMS, Digits: "9999" }, DOCUMENTED, TOKEN)).toBe(false);
    expect(validTwilioSignature(URL_.replace("foo=1", "foo=2"), PARAMS, DOCUMENTED, TOKEN)).toBe(false);
    expect(validTwilioSignature(URL_, PARAMS, DOCUMENTED, "54321")).toBe(false);
    expect(validTwilioSignature(URL_, PARAMS, DOCUMENTED.replace("L", "M"), TOKEN)).toBe(false);
  });

  it("fails closed on missing signature or token", () => {
    expect(validTwilioSignature(URL_, PARAMS, null, TOKEN)).toBe(false);
    expect(validTwilioSignature(URL_, PARAMS, "", TOKEN)).toBe(false);
    expect(validTwilioSignature(URL_, PARAMS, DOCUMENTED, "")).toBe(false);
  });

  it("accepts the URL with or without the default port", () => {
    const withPort = "https://example.com:443/myapp.php?foo=1&bar=2";
    expect(validTwilioSignature(withPort, PARAMS, DOCUMENTED, TOKEN)).toBe(true);
    const sigWithPort = expectedTwilioSignature(TOKEN, withPort, PARAMS);
    expect(validTwilioSignature(URL_, PARAMS, sigWithPort, TOKEN)).toBe(true);
  });

  it("sorts keys case-sensitively (Unix order)", () => {
    const p = { b: "1", B: "2", a: "3" };
    const manual = expectedTwilioSignature(TOKEN, "https://x.test/h", {});
    expect(manual).not.toBe(expectedTwilioSignature(TOKEN, "https://x.test/h", p));
    // "B" (0x42) sorts before "a" (0x61) and "b" (0x62)
    const concatenated = expectedTwilioSignature(TOKEN, "https://x.test/hB2a3b1", {});
    expect(expectedTwilioSignature(TOKEN, "https://x.test/h", p)).toBe(concatenated);
  });

  it("does not trim whitespace in values", () => {
    const sig = expectedTwilioSignature(TOKEN, URL_, { Body: " hi " });
    expect(validTwilioSignature(URL_, { Body: "hi" }, sig, TOKEN)).toBe(false);
    expect(validTwilioSignature(URL_, { Body: " hi " }, sig, TOKEN)).toBe(true);
  });

  it("formToParams flattens a urlencoded body", () => {
    const form = new URLSearchParams("From=%2B27821234567&Body=Hello+there");
    expect(formToParams(form)).toEqual({ From: "+27821234567", Body: "Hello there" });
  });
});
