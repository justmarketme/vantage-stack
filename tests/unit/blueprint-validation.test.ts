import { validateBlueprintSubmission } from "../../lib/blueprint/validation";

function log(expected: unknown, actual: unknown) {
  globalThis.qaLogExpectedActual?.({ expected, actual });
}

describe("Blueprint form validation", () => {
  test("valid data passes", () => {
    const input = {
      businessName: "Acme Co",
      industry: "B2B",
      websiteStatus: "yes",
      websiteUrl: "https://acme.example",
      leadSource: "Referrals",
      responseSpeed: "Immediately",
      biggestChallenge: "Low conversions",
      revenueRange: "100k-500k",
      name: "Jane",
      email: "jane@acme.example",
      phone: "+27821234567",
    };
    const out = validateBlueprintSubmission(input);
    log({ ok: true }, { ok: out.ok });
    expect(out.ok).toBe(true);
  });

  test("missing fields fails", () => {
    const input = {
      businessName: "",
      industry: "",
      websiteStatus: "yes",
      websiteUrl: "",
      leadSource: "",
      responseSpeed: "",
      biggestChallenge: "",
      name: "",
      email: "",
      phone: "",
    };
    const out = validateBlueprintSubmission(input);
    log({ ok: false }, { ok: out.ok, fields: Object.keys((out as any).error?.fieldErrors ?? {}) });
    expect(out.ok).toBe(false);
  });

  test("invalid email fails", () => {
    const input = {
      businessName: "Acme Co",
      industry: "B2B",
      websiteStatus: "no",
      websiteUrl: "",
      leadSource: "Referrals",
      responseSpeed: "Immediately",
      biggestChallenge: "Leads",
      revenueRange: "",
      name: "Jane",
      email: "not-an-email",
      phone: "+27821234567",
    };
    const out = validateBlueprintSubmission(input);
    log({ ok: false }, { ok: out.ok, emailErrors: (out as any).error?.fieldErrors?.email ?? null });
    expect(out.ok).toBe(false);
  });

  test("invalid URL fails", () => {
    const input = {
      businessName: "Acme Co",
      industry: "B2B",
      websiteStatus: "yes",
      websiteUrl: "notaurl",
      leadSource: "Referrals",
      responseSpeed: "Immediately",
      biggestChallenge: "Leads",
      revenueRange: "",
      name: "Jane",
      email: "jane@acme.example",
      phone: "+27821234567",
    };
    const out = validateBlueprintSubmission(input);
    log({ ok: false }, { ok: out.ok, websiteUrlErrors: (out as any).error?.fieldErrors?.websiteUrl ?? null });
    expect(out.ok).toBe(false);
  });
});

