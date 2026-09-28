/**
 * jose v6 is ESM-only and this repo's jest config does not transform node_modules.
 * Node >= 22.12 can require() ESM natively, so these factories load the REAL jose
 * through Node's own loader (not a stub) — the crypto under test is genuine.
 */
jest.mock("jose/jwt/sign", () => process.getBuiltinModule("node:module").createRequire(__filename)("jose/jwt/sign"));
jest.mock("jose/jwt/verify", () => process.getBuiltinModule("node:module").createRequire(__filename)("jose/jwt/verify"));

import { SignJWT } from "jose/jwt/sign";
import {
  SESSION_TTL_SECONDS,
  claimsToSession,
  sessionSecret,
  signSessionToken,
  verifySessionToken,
} from "../../../../lib/clinic-crm/auth/token";
import type { Session } from "../../../../lib/clinic-crm/types";

const SECRET = new TextEncoder().encode("x".repeat(40));
const OTHER = new TextEncoder().encode("y".repeat(40));
const SESSION: Session = {
  staffId: "11111111-1111-4111-8111-111111111111",
  clinicId: "22222222-2222-4222-8222-222222222222",
  role: "reception",
  name: "Thandi",
  clinicName: "Smile Dental",
};

describe("clinic-crm session token", () => {
  const prev = process.env.CLINIC_CRM_SESSION_SECRET;
  afterEach(() => {
    if (prev === undefined) delete process.env.CLINIC_CRM_SESSION_SECRET;
    else process.env.CLINIC_CRM_SESSION_SECRET = prev;
  });

  it("round-trips a session", async () => {
    const t = await signSessionToken(SESSION, SECRET);
    await expect(verifySessionToken(t, SECRET)).resolves.toEqual(SESSION);
  });

  it("rejects a token signed with another secret", async () => {
    const t = await signSessionToken(SESSION, OTHER);
    await expect(verifySessionToken(t, SECRET)).resolves.toBeNull();
  });

  it("rejects a tampered token", async () => {
    const t = await signSessionToken(SESSION, SECRET);
    const [h, p, s] = t.split(".");
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    payload.role = "owner";
    const forged = [h, Buffer.from(JSON.stringify(payload)).toString("base64url"), s].join(".");
    await expect(verifySessionToken(forged, SECRET)).resolves.toBeNull();
  });

  it("rejects an expired token", async () => {
    // jose runs in Node's realm (see mocks above), so a jest Date spy can't reach it:
    // mint a token that is otherwise valid but expired an hour ago.
    const nowSec = Math.floor(Date.now() / 1000);
    const expired = await new SignJWT({ typ: "clinic-crm", cid: SESSION.clinicId, role: "owner", nm: "", cn: "" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("vantage-stack/clinic-crm")
      .setSubject(SESSION.staffId)
      .setIssuedAt(nowSec - SESSION_TTL_SECONDS - 3600)
      .setExpirationTime(nowSec - 3600)
      .sign(SECRET);
    await expect(verifySessionToken(expired, SECRET)).resolves.toBeNull();
  });

  it("rejects alg=none and garbage", async () => {
    const none =
      Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url") +
      "." +
      Buffer.from(JSON.stringify({ typ: "clinic-crm", sub: "a", cid: "b", role: "owner" })).toString("base64url") +
      ".";
    await expect(verifySessionToken(none, SECRET)).resolves.toBeNull();
    await expect(verifySessionToken("not.a.jwt", SECRET)).resolves.toBeNull();
    await expect(verifySessionToken(undefined, SECRET)).resolves.toBeNull();
  });

  it("rejects a token from the admin CRM (wrong typ/issuer) even with the same secret", async () => {
    const admin = await new SignJWT({ typ: "crm", role: "owner" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("m1")
      .setExpirationTime("1h")
      .sign(SECRET);
    await expect(verifySessionToken(admin, SECRET)).resolves.toBeNull();
  });

  it("fails closed when the secret is missing or shorter than 32 chars", async () => {
    process.env.CLINIC_CRM_SESSION_SECRET = "short";
    expect(sessionSecret()).toBeNull();
    const t = await signSessionToken(SESSION, SECRET);
    await expect(verifySessionToken(t)).resolves.toBeNull();
    process.env.CLINIC_CRM_SESSION_SECRET = "z".repeat(32);
    expect(sessionSecret()).not.toBeNull();
  });

  it("claimsToSession validates shape and role", () => {
    const ok = { typ: "clinic-crm", sub: "s", cid: "c", role: "manager", nm: "N", cn: "C" };
    expect(claimsToSession(ok)).toEqual({ staffId: "s", clinicId: "c", role: "manager", name: "N", clinicName: "C" });
    expect(claimsToSession({ ...ok, role: "super_admin" })).toBeNull();
    expect(claimsToSession({ ...ok, cid: "" })).toBeNull();
    expect(claimsToSession({ ...ok, typ: "crm" })).toBeNull();
  });
});
