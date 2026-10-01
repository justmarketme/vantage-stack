import { consultantConfig } from "../../../../lib/consultant/config";
import { mintVoiceToken } from "../../../../lib/consultant/auth/voiceToken";

const ID = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b";

function cfgWith(twilio: Partial<ReturnType<typeof consultantConfig>["twilio"]>) {
  const base = consultantConfig();
  return {
    ...base,
    twilio: {
      ...base.twilio,
      accountSid: "AC00000000000000000000000000000000",
      apiKeySid: "SK00000000000000000000000000000000",
      apiKeySecret: "test_secret_value",
      twimlAppSid: "AP00000000000000000000000000000000",
      tokenTtlSec: 600,
      ...twilio,
    },
  };
}

type Claims = {
  iss: string;
  sub: string;
  iat: number;
  exp: number;
  grants: { identity: string; voice: { outgoing: { application_sid: string }; incoming?: { allow: boolean } } };
};

function payload(jwt: string): Claims {
  return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"));
}

describe("mintVoiceToken", () => {
  it("mints an outgoing-only voice grant for the consultant identity", () => {
    const now = Date.UTC(2026, 8, 30, 12);
    const t = mintVoiceToken(ID, cfgWith({}), now);
    expect(t).not.toBeNull();
    expect(t!.identity).toBe(`consultant_${ID}`);
    expect(t!.expiresAt).toBe(new Date(now + 600_000).toISOString());

    const p = payload(t!.token);
    expect(p.iss).toBe("SK00000000000000000000000000000000");
    expect(p.sub).toBe("AC00000000000000000000000000000000");
    expect(p.grants.identity).toBe(`consultant_${ID}`);
    expect(p.grants.voice.outgoing.application_sid).toBe("AP00000000000000000000000000000000");
    // Twilio omits `incoming` unless allowed; absent == no inbound calls to the browser.
    expect(p.grants.voice.incoming?.allow ?? false).toBe(false);
    expect(p.exp - p.iat).toBe(600);
  });

  it.each(["accountSid", "apiKeySid", "apiKeySecret", "twimlAppSid"] as const)("returns null without %s", (k) => {
    expect(mintVoiceToken(ID, cfgWith({ [k]: "" }))).toBeNull();
  });

  it("refuses a non-uuid member id", () => {
    expect(() => mintVoiceToken("legacy_admin", cfgWith({}))).toThrow();
  });
});
