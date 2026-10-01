import { randomBytes } from "node:crypto";
import {
  decryptSecret,
  encryptSecret,
  parseKey,
  SecretDecryptError,
  SecretKeyError,
} from "../../../../lib/consultant/auth/crypto";

const KEY_B64 = randomBytes(32).toString("base64");
const saved = process.env.CONSULTANT_TOKEN_ENC_KEY;

afterEach(() => {
  if (saved === undefined) delete process.env.CONSULTANT_TOKEN_ENC_KEY;
  else process.env.CONSULTANT_TOKEN_ENC_KEY = saved;
});

describe("encryptSecret / decryptSecret", () => {
  beforeEach(() => {
    process.env.CONSULTANT_TOKEN_ENC_KEY = KEY_B64;
  });

  it("round-trips, including unicode and empty strings", () => {
    for (const plain of ["ya29.a0AfH6SM-refresh-token", "", "Tëst — ✓ 🔐"]) {
      expect(decryptSecret(encryptSecret(plain))).toBe(plain);
    }
  });

  it("emits v1.<iv>.<tag>.<ct> base64url with a 12-byte IV and 16-byte tag", () => {
    const enc = encryptSecret("token");
    const [v, iv, tag, ct] = enc.split(".");
    expect(v).toBe("v1");
    expect(Buffer.from(iv, "base64url")).toHaveLength(12);
    expect(Buffer.from(tag, "base64url")).toHaveLength(16);
    expect(ct.length).toBeGreaterThan(0);
    expect(enc).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(enc).not.toContain("token");
  });

  it("uses a fresh IV every time", () => {
    const a = encryptSecret("same");
    const b = encryptSecret("same");
    expect(a).not.toBe(b);
    expect(a.split(".")[1]).not.toBe(b.split(".")[1]);
  });

  it("detects tampering with ciphertext, tag or iv", () => {
    const [v, iv, tag, ct] = encryptSecret("refresh-token-value").split(".");
    const flip = (s: string) => {
      const b = Buffer.from(s, "base64url");
      b[0] ^= 0x01;
      return b.toString("base64url");
    };
    expect(() => decryptSecret([v, iv, tag, flip(ct)].join("."))).toThrow(SecretDecryptError);
    expect(() => decryptSecret([v, iv, flip(tag), ct].join("."))).toThrow(SecretDecryptError);
    expect(() => decryptSecret([v, flip(iv), tag, ct].join("."))).toThrow(SecretDecryptError);
  });

  it("rejects the wrong key", () => {
    const enc = encryptSecret("secret");
    process.env.CONSULTANT_TOKEN_ENC_KEY = randomBytes(32).toString("base64");
    expect(() => decryptSecret(enc)).toThrow(SecretDecryptError);
  });

  it("rejects malformed and unknown-version values", () => {
    for (const bad of ["", "plain", "v1.a.b", "v2.a.b.c", `v1.${"A".repeat(4)}.${"A".repeat(22)}.AA`]) {
      expect(() => decryptSecret(bad)).toThrow(SecretDecryptError);
    }
  });
});

describe("key handling", () => {
  it("throws a typed error when the key is unset", () => {
    delete process.env.CONSULTANT_TOKEN_ENC_KEY;
    expect(() => encryptSecret("x")).toThrow(SecretKeyError);
    expect(() => decryptSecret("v1.a.b.c")).toThrow(SecretKeyError);
  });

  it("throws a typed error for a wrong-length key", () => {
    process.env.CONSULTANT_TOKEN_ENC_KEY = randomBytes(16).toString("base64");
    expect(() => encryptSecret("x")).toThrow(SecretKeyError);
    try {
      encryptSecret("x");
    } catch (e) {
      expect((e as SecretKeyError).code).toBe("SECRET_KEY_INVALID");
    }
  });

  it("accepts base64url keys too", () => {
    expect(parseKey(randomBytes(32).toString("base64url"))).toHaveLength(32);
  });
});
