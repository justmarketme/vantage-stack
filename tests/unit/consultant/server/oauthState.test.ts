import { createOAuthState, newNonce, stateSecretFrom, verifyOAuthState } from "../../../../lib/consultant/server/calendar/oauthState";

const SECRET = stateSecretFrom("dGVzdC1rZXktMzItYnl0ZXMtbG9uZy1lbm91Z2gtISE=");
const MEMBER = "6f1c2b7e-0000-4000-8000-000000000001";
const T0 = 1_790_000_000;

function mint(overrides: Partial<Parameters<typeof createOAuthState>[0]> = {}) {
  const nonce = overrides.nonce ?? newNonce();
  const state = createOAuthState({ secret: SECRET, memberId: MEMBER, provider: "google", nonce, nowSec: T0, ...overrides });
  return { state, nonce };
}

describe("calendar OAuth state", () => {
  test("round-trips for the same member, provider and nonce cookie", () => {
    const { state, nonce } = mint();
    const r = verifyOAuthState(state, { secret: SECRET, memberId: MEMBER, provider: "google", nonce, nowSec: T0 + 30 });
    expect(r.ok).toBe(true);
  });

  test("expires after 10 minutes", () => {
    const { state, nonce } = mint();
    expect(verifyOAuthState(state, { secret: SECRET, memberId: MEMBER, provider: "google", nonce, nowSec: T0 + 600 }).ok).toBe(true);
    const late = verifyOAuthState(state, { secret: SECRET, memberId: MEMBER, provider: "google", nonce, nowSec: T0 + 601 });
    expect(late).toEqual({ ok: false, reason: "expired" });
    const veryLate = verifyOAuthState(state, { secret: SECRET, memberId: MEMBER, provider: "google", nonce, nowSec: T0 + 3600 });
    expect(veryLate.ok).toBe(false);
  });

  test("is bound to the member, the provider and the nonce", () => {
    const { state, nonce } = mint();
    const base = { secret: SECRET, memberId: MEMBER, provider: "google" as const, nonce, nowSec: T0 };
    expect(verifyOAuthState(state, { ...base, memberId: "6f1c2b7e-0000-4000-8000-000000000002" })).toEqual({ ok: false, reason: "wrong_member" });
    expect(verifyOAuthState(state, { ...base, provider: "microsoft" })).toEqual({ ok: false, reason: "wrong_provider" });
    expect(verifyOAuthState(state, { ...base, nonce: newNonce() })).toEqual({ ok: false, reason: "nonce_mismatch" });
    expect(verifyOAuthState(state, { ...base, nonce: null })).toEqual({ ok: false, reason: "nonce_mismatch" });
  });

  test("rejects tampering, a different secret and junk", () => {
    const { state, nonce } = mint();
    const base = { secret: SECRET, memberId: MEMBER, provider: "google" as const, nonce, nowSec: T0 };
    const [body, sig] = state.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), m: "someone-else" })).toString("base64url");
    expect(verifyOAuthState(`${forged}.${sig}`, base).ok).toBe(false);
    expect(verifyOAuthState(state, { ...base, secret: stateSecretFrom("b3RoZXIta2V5") }).ok).toBe(false);
    for (const junk of [null, "", "abc", ".", "a.", ".b", "x".repeat(3000)]) {
      expect(verifyOAuthState(junk, base)).toEqual({ ok: false, reason: "malformed" });
    }
  });

  test("the state carries no raw nonce and the secret derivation needs a key", () => {
    const { state, nonce } = mint();
    expect(Buffer.from(state.split(".")[0], "base64url").toString()).not.toContain(nonce);
    expect(() => stateSecretFrom("")).toThrow();
  });
});
