import twilio from "twilio";
import { verifyTwilioRequest } from "../../../../lib/consultant/auth/twilioSignature";

const TOKEN = "test_auth_token_0123456789abcdef";
const ORIGIN = "https://portal.example.com";
const PATH = "/api/consultant-voice/status?callId=3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b";
const PARAMS = { CallSid: "CA123", CallStatus: "completed", From: "client:consultant_x" };

const saved = { ...process.env };
function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe("verifyTwilioRequest", () => {
  beforeEach(() => {
    process.env = { ...saved };
    setEnv({
      TWILIO_AUTH_TOKEN: TOKEN,
      CONSULTANT_PUBLIC_URL: `${ORIGIN}/`,
      NEXT_PUBLIC_APP_URL: undefined,
      CONSULTANT_TWILIO_SKIP_SIGNATURE: undefined,
    });
  });
  afterAll(() => {
    process.env = saved;
  });

  const sign = (url: string, params = PARAMS) => twilio.getExpectedTwilioSignature(TOKEN, url, params);

  it("accepts a valid signature over the configured origin + path + query", () => {
    expect(verifyTwilioRequest(PATH, PARAMS, sign(`${ORIGIN}${PATH}`))).toBe(true);
  });

  it("accepts Twilio's with-port form", () => {
    expect(verifyTwilioRequest(PATH, PARAMS, sign(`https://portal.example.com:443${PATH}`))).toBe(true);
  });

  it("rejects tampered params, query or host", () => {
    const sig = sign(`${ORIGIN}${PATH}`);
    expect(verifyTwilioRequest(PATH, { ...PARAMS, CallStatus: "in-progress" }, sig)).toBe(false);
    expect(verifyTwilioRequest(PATH.replace("3f2b", "0000"), PARAMS, sig)).toBe(false);
    expect(verifyTwilioRequest(PATH, PARAMS, sign(`https://evil.example${PATH}`))).toBe(false);
  });

  it("fails closed without signature, token or public URL", () => {
    const sig = sign(`${ORIGIN}${PATH}`);
    expect(verifyTwilioRequest(PATH, PARAMS, null)).toBe(false);
    setEnv({ TWILIO_AUTH_TOKEN: "" });
    expect(verifyTwilioRequest(PATH, PARAMS, sig)).toBe(false);
    setEnv({ TWILIO_AUTH_TOKEN: TOKEN, CONSULTANT_PUBLIC_URL: "" });
    expect(verifyTwilioRequest(PATH, PARAMS, sig)).toBe(false);
  });

  it("rejects paths that could change the host", () => {
    expect(verifyTwilioRequest("//evil.example/x", PARAMS, sign("https://evil.example/x"))).toBe(false);
    expect(verifyTwilioRequest("@evil.example/x", PARAMS, "sig")).toBe(false);
  });

  it("honours the dev skip flag outside production only", () => {
    setEnv({ CONSULTANT_TWILIO_SKIP_SIGNATURE: "true", NODE_ENV: "development" });
    expect(verifyTwilioRequest(PATH, PARAMS, null)).toBe(true);
    setEnv({ NODE_ENV: "production" });
    expect(verifyTwilioRequest(PATH, PARAMS, null)).toBe(false);
  });
});
