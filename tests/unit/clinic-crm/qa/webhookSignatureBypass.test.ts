/**
 * QA regression: the dry-run flag (fake Twilio sends) used to ALSO switch off webhook
 * signature validation in any non-production process, so a dev box behind a public
 * tunnel accepted forged inbound messages and the 403 path could never be exercised
 * locally. The bypass now needs its own explicit flag.
 */
type Env = Record<string, string | undefined>;

function loadWith(env: Env) {
  const saved: Env = {};
  for (const k of Object.keys(env)) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  let mod: typeof import("../../../../lib/clinic-crm/auth/twilioSignature");
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("../../../../lib/clinic-crm/auth/twilioSignature");
  });
  for (const k of Object.keys(saved)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  return mod!;
}

const URL_ = "https://clinics.example/api/clinic-crm/webhooks/twilio";
const PARAMS = { MessageSid: "SM1", From: "+27600000001", To: "+27600000099", Body: "hi" };

describe("QA: webhook signature bypass is not tied to dry-run", () => {
  it("CLINIC_CRM_TWILIO_DRY_RUN=true in development still rejects unsigned webhooks", () => {
    const m = loadWith({ NODE_ENV: "development", CLINIC_CRM_TWILIO_DRY_RUN: "true", CLINIC_CRM_TWILIO_SKIP_SIGNATURE: undefined });
    expect(m.DEV_SKIP).toBe(false);
    expect(m.validTwilioSignature(URL_, PARAMS, null, "token")).toBe(false);
    expect(m.validTwilioSignature(URL_, PARAMS, "bogus", "token")).toBe(false);
  });

  it("the explicit skip flag works in development only", () => {
    expect(loadWith({ NODE_ENV: "development", CLINIC_CRM_TWILIO_SKIP_SIGNATURE: "true" }).DEV_SKIP).toBe(true);
    expect(loadWith({ NODE_ENV: "production", CLINIC_CRM_TWILIO_SKIP_SIGNATURE: "true" }).DEV_SKIP).toBe(false);
  });

  it("a correctly signed request still validates with dry-run on", () => {
    const m = loadWith({ NODE_ENV: "development", CLINIC_CRM_TWILIO_DRY_RUN: "true", CLINIC_CRM_TWILIO_SKIP_SIGNATURE: undefined });
    const sig = m.expectedTwilioSignature("token", URL_, PARAMS);
    expect(m.validTwilioSignature(URL_, PARAMS, sig, "token")).toBe(true);
  });
});
