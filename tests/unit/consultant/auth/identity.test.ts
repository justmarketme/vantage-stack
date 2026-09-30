import { memberIdFromIdentity, voiceIdentity } from "../../../../lib/consultant/auth/identity";

const ID = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b";

describe("voice identity", () => {
  it("round-trips a member id", () => {
    expect(voiceIdentity(ID)).toBe(`consultant_${ID}`);
    expect(memberIdFromIdentity(voiceIdentity(ID))).toBe(ID);
  });

  it("accepts the client: scheme Twilio puts in From", () => {
    expect(memberIdFromIdentity(`client:consultant_${ID}`)).toBe(ID);
  });

  it("normalises case", () => {
    expect(voiceIdentity(ID.toUpperCase())).toBe(`consultant_${ID}`);
    expect(memberIdFromIdentity(`consultant_${ID.toUpperCase()}`)).toBe(ID);
  });

  it.each([
    "",
    ID,
    `consultant_`,
    `consultant_${ID}x`,
    `consultant_${ID}\n`,
    `xconsultant_${ID}`,
    `client:client:consultant_${ID}`,
    `consultant_not-a-uuid`,
    `+27821234567`,
    `client:someoneelse_${ID}`,
  ])("rejects %p", (bad) => {
    expect(memberIdFromIdentity(bad)).toBeNull();
  });

  it("refuses to build an identity from a non-uuid", () => {
    expect(() => voiceIdentity("admin")).toThrow();
  });
});
