import { createHmac } from "node:crypto";
import { signBody, verifyBody } from "../../../../lib/consultant/auth/signing";

const SECRET = "test-signing-secret-0123456789abcdef";
const BODY = JSON.stringify({ id: "evt_1", type: "deal.paid", data: { amount: 12500 } });
const NOW = 1_790_000_000;
const TOL = 300;

describe("signBody", () => {
  it("produces t=<unix>,v1=<hex HMAC-SHA256 of '<t>.<body>'>", () => {
    const expected = createHmac("sha256", SECRET).update(`${NOW}.${BODY}`).digest("hex");
    expect(signBody(SECRET, BODY, NOW)).toBe(`t=${NOW},v1=${expected}`);
  });
  it("floors fractional seconds and refuses an empty secret", () => {
    expect(signBody(SECRET, BODY, NOW + 0.9)).toMatch(new RegExp(`^t=${NOW},v1=[0-9a-f]{64}$`));
    expect(() => signBody("", BODY, NOW)).toThrow();
  });
});

describe("verifyBody", () => {
  const header = signBody(SECRET, BODY, NOW);

  it("accepts its own signature inside the window (past and future)", () => {
    expect(verifyBody(SECRET, BODY, header, TOL, NOW)).toBe(true);
    expect(verifyBody(SECRET, BODY, header, TOL, NOW + TOL)).toBe(true);
    expect(verifyBody(SECRET, BODY, header, TOL, NOW - TOL)).toBe(true);
  });

  it("rejects stale and far-future timestamps", () => {
    expect(verifyBody(SECRET, BODY, header, TOL, NOW + TOL + 1)).toBe(false);
    expect(verifyBody(SECRET, BODY, header, TOL, NOW - TOL - 1)).toBe(false);
  });

  it("detects a tampered body, timestamp or signature", () => {
    expect(verifyBody(SECRET, BODY.replace("12500", "99999"), header, TOL, NOW)).toBe(false);
    expect(verifyBody(SECRET, BODY, header.replace(`t=${NOW}`, `t=${NOW + 1}`), TOL, NOW)).toBe(false);
    const sig = header.split("v1=")[1];
    const flipped = (sig[0] === "a" ? "b" : "a") + sig.slice(1);
    expect(verifyBody(SECRET, BODY, `t=${NOW},v1=${flipped}`, TOL, NOW)).toBe(false);
  });

  it("rejects the wrong secret", () => {
    expect(verifyBody("another-secret", BODY, header, TOL, NOW)).toBe(false);
  });

  it("fails closed on missing / malformed input", () => {
    for (const h of [null, "", "garbage", `t=${NOW}`, "v1=abc", `t=abc,v1=${"0".repeat(64)}`, `t=${NOW},v1=zz`, `t=${NOW},v1=${"0".repeat(63)}`]) {
      expect(verifyBody(SECRET, BODY, h, TOL, NOW)).toBe(false);
    }
    expect(verifyBody("", BODY, header, TOL, NOW)).toBe(false);
    expect(verifyBody(SECRET, BODY, header, Number.NaN, NOW)).toBe(false);
    expect(verifyBody(SECRET, BODY, header, -1, NOW)).toBe(false);
  });

  it("accepts any matching v1 during secret rotation, ignores unknown schemes", () => {
    const old = signBody("old-secret", BODY, NOW).split("v1=")[1];
    const current = header.split("v1=")[1];
    expect(verifyBody(SECRET, BODY, `t=${NOW},v1=${old},v1=${current}`, TOL, NOW)).toBe(true);
    expect(verifyBody(SECRET, BODY, `t=${NOW},v0=deadbeef,v1=${current}`, TOL, NOW)).toBe(true);
    expect(verifyBody(SECRET, BODY, `t=${NOW},v1=${old}`, TOL, NOW)).toBe(false);
  });

  it("uses the real clock by default", () => {
    expect(verifyBody(SECRET, BODY, signBody(SECRET, BODY), TOL)).toBe(true);
  });
});
