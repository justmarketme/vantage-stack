import {
  backoffMs,
  contentVariables,
  decideChannel,
  detectOptKeyword,
  greetingName,
  likePattern,
  parseDedupeKey,
  phoneSearchDigits,
  recallKey,
  reminderDueAt,
  reminderKey,
  reminderKeyPrefix,
  renderTemplate,
  safeEqual,
  shouldApplyStatus,
  statusesBelow,
  windowOpen,
  type ChannelInput,
} from "../../../../lib/clinic-crm/server/rules";
import { AUTOMATION_DEFAULTS, CRM_CONFIG } from "../../../../lib/clinic-crm/server/config";
import { toTwilioError, twilioAddress, sendMessage } from "../../../../lib/clinic-crm/server/twilio";

const base: ChannelInput = {
  requested: "whatsapp",
  optedOut: false,
  whatsappFrom: "whatsapp:+27600000000",
  smsFrom: "+27600000001",
  windowOpen: true,
  contentSid: "",
  allowFallback: true,
};

describe("decideChannel", () => {
  it("blocks opted-out patients on every channel", () => {
    expect(decideChannel({ ...base, optedOut: true })).toEqual({ ok: false, reason: "opted_out" });
    expect(decideChannel({ ...base, optedOut: true, requested: "sms" })).toEqual({ ok: false, reason: "opted_out" });
  });
  it("WhatsApp inside the window is free-form", () => {
    expect(decideChannel(base)).toEqual({ ok: true, channel: "whatsapp", from: base.whatsappFrom, contentSid: null });
  });
  it("WhatsApp outside the window uses the approved template", () => {
    const d = decideChannel({ ...base, windowOpen: false, contentSid: "HX" + "a".repeat(32) });
    expect(d).toMatchObject({ ok: true, channel: "whatsapp", contentSid: "HX" + "a".repeat(32) });
  });
  it("WhatsApp outside the window without a template falls back to SMS", () => {
    expect(decideChannel({ ...base, windowOpen: false })).toMatchObject({ ok: true, channel: "sms", contentSid: null });
  });
  it("…and is skipped when SMS isn't configured", () => {
    expect(decideChannel({ ...base, windowOpen: false, smsFrom: "" })).toEqual({ ok: false, reason: "whatsapp_window_closed" });
  });
  it("manual sends never fall back: closed window → refused", () => {
    expect(decideChannel({ ...base, windowOpen: false, allowFallback: false })).toEqual({
      ok: false,
      reason: "whatsapp_window_closed",
    });
  });
  it("SMS is free-form", () => {
    expect(decideChannel({ ...base, requested: "sms", windowOpen: false })).toMatchObject({ ok: true, channel: "sms" });
  });
  it("manual SMS with no SMS number is refused", () => {
    expect(decideChannel({ ...base, requested: "sms", smsFrom: "", allowFallback: false })).toEqual({
      ok: false,
      reason: "sms_not_configured",
    });
  });
  it("automation preferring SMS with no SMS number uses WhatsApp when allowed", () => {
    expect(decideChannel({ ...base, requested: "sms", smsFrom: "" })).toMatchObject({ ok: true, channel: "whatsapp" });
  });
  it("no senders at all → no_sender", () => {
    expect(decideChannel({ ...base, whatsappFrom: "", smsFrom: "" })).toEqual({ ok: false, reason: "no_sender" });
  });
});

describe("windowOpen", () => {
  const now = new Date("2026-09-28T12:00:00Z");
  it("open within 24h, closed after", () => {
    expect(windowOpen(new Date(now.getTime() - 23 * 3_600_000), now)).toBe(true);
    expect(windowOpen(new Date(now.getTime() - 24 * 3_600_000), now)).toBe(false);
    expect(windowOpen(null, now)).toBe(false);
  });
});

describe("templates", () => {
  it("renders placeholders and blanks unknown ones", () => {
    expect(renderTemplate("Hi {{firstName}}, see you at {{ clinicName }} {{nope}}.", { firstName: "Thandi", clinicName: "Smile Co" })).toBe(
      "Hi Thandi, see you at Smile Co.",
    );
  });
  it("every default body only uses supported placeholders", () => {
    for (const d of Object.values(AUTOMATION_DEFAULTS)) {
      const used = [...d.body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]);
      for (const u of used) expect(["firstName", "clinicName", "time"]).toContain(u);
      expect(d.enabled).toBe(false);
    }
  });
  it("maps named vars to positional content variables", () => {
    expect(contentVariables({ firstName: "A", clinicName: "B", time: "C" })).toEqual({ "1": "A", "2": "B", "3": "C" });
  });
  it("never greets a lead by the placeholder name", () => {
    expect(greetingName(CRM_CONFIG.inbound.unknownContactName)).toBe(CRM_CONFIG.inbound.greetingFallback);
    expect(greetingName("Sipho")).toBe("Sipho");
  });
});

describe("dedupe keys", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  it("same instant in different offsets → same reminder key", () => {
    expect(reminderKey(id, "2026-10-01T10:00:00+02:00")).toBe(reminderKey(id, "2026-10-01T08:00:00Z"));
  });
  it("a reschedule re-keys; the prefix still identifies the appointment", () => {
    const a = reminderKey(id, "2026-10-01T08:00:00Z");
    const b = reminderKey(id, "2026-10-02T08:00:00Z");
    expect(a).not.toBe(b);
    expect(a.startsWith(reminderKeyPrefix(id))).toBe(true);
    expect(b.startsWith(reminderKeyPrefix(id))).toBe(true);
  });
  it("matches the SQL backstop key format (ms precision, Z)", () => {
    expect(reminderKey(id, "2026-10-01T08:00:00Z")).toBe(`reminder:${id}:2026-10-01T08:00:00.000Z`);
  });
  it("round-trips through parseDedupeKey", () => {
    expect(parseDedupeKey(reminderKey(id, "2026-10-01T08:00:00Z"))).toEqual({
      kind: "appointment_reminder",
      appointmentId: id,
      startsAt: "2026-10-01T08:00:00.000Z",
    });
    expect(parseDedupeKey(recallKey(id, id))).toEqual({ kind: "recall", patientId: id, appointmentId: id });
    expect(parseDedupeKey("junk")).toBeNull();
  });
  it("reminder due time respects offset and minimum lead", () => {
    const now = new Date("2026-10-01T00:00:00Z");
    expect(reminderDueAt(new Date("2026-10-03T00:00:00Z"), 24, now)?.toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(reminderDueAt(new Date("2026-10-01T10:00:00Z"), 24, now)).toEqual(now); // inside window → now
    expect(reminderDueAt(new Date("2026-10-01T00:30:00Z"), 24, now)).toBeNull(); // too close
  });
});

describe("opt keywords", () => {
  it.each(["STOP", "stop", " Stop! ", "unsubscribe", "Opt out", "OPT  OUT", "stopall"])("%s → stop", (b) => {
    expect(detectOptKeyword(b)).toBe("stop");
  });
  it.each(["start", "UNSTOP"])("%s → start", (b) => expect(detectOptKeyword(b)).toBe("start"));
  it.each(["please stop calling me at work", "stopping by later", "", "cancel"])("%s → null", (b) => {
    expect(detectOptKeyword(b)).toBeNull();
  });
});

describe("delivery status guard", () => {
  it("only moves forward", () => {
    expect(shouldApplyStatus("queued", "sent")).toBe(true);
    expect(shouldApplyStatus("delivered", "sent")).toBe(false);
    expect(shouldApplyStatus("read", "delivered")).toBe(false);
    expect(shouldApplyStatus("sent", "failed")).toBe(true);
    expect(shouldApplyStatus("delivered", "delivered")).toBe(false); // idempotent retry
    expect(shouldApplyStatus("received", "delivered")).toBe(false); // inbound never touched
    expect(shouldApplyStatus("sent", "bogus")).toBe(false);
  });
  it("statusesBelow is the SQL guard", () => {
    expect(statusesBelow("delivered").sort()).toEqual(["accepted", "queued", "scheduled", "sending", "sent"]);
    expect(statusesBelow("bogus")).toEqual([]);
  });
});

describe("retry + misc", () => {
  it("backs off exponentially with a cap", () => {
    expect(backoffMs(1)).toBe(60_000);
    expect(backoffMs(2)).toBe(120_000);
    expect(backoffMs(50)).toBe(CRM_CONFIG.outbox.retryMaxSeconds * 1000);
  });
  it("phone search digits normalise local and international formats", () => {
    expect(phoneSearchDigits("082 123 4567")).toBe("821234567");
    expect(phoneSearchDigits("+27 82 123 4567")).toBe("27821234567");
    expect(phoneSearchDigits("0027821234567")).toBe("27821234567");
    expect(phoneSearchDigits("Thandi")).toBeNull();
  });
  it("escapes LIKE wildcards", () => {
    expect(likePattern("50%_a")).toBe("%50\\%\\_a%");
  });
  it("safeEqual", () => {
    expect(safeEqual("Bearer abc", "Bearer abc")).toBe(true);
    expect(safeEqual("Bearer abc", "Bearer abd")).toBe(false);
    expect(safeEqual("", "")).toBe(false);
  });
});

describe("twilio system layer", () => {
  it("maps error codes to typed reasons", () => {
    expect(toTwilioError(400, 63016)).toMatchObject({ reason: "outside_window", retryable: false });
    expect(toTwilioError(400, 21610)).toMatchObject({ reason: "unsubscribed", retryable: false });
    expect(toTwilioError(400, 21211)).toMatchObject({ reason: "invalid_number", retryable: false });
    expect(toTwilioError(429, null)).toMatchObject({ reason: "rate_limited", retryable: true });
    expect(toTwilioError(503, null)).toMatchObject({ reason: "unknown", retryable: true });
  });
  it("formats addresses per channel", () => {
    expect(twilioAddress("whatsapp", "+2782")).toBe("whatsapp:+2782");
    expect(twilioAddress("whatsapp", "whatsapp:+2782")).toBe("whatsapp:+2782");
    expect(twilioAddress("sms", "whatsapp:+2782")).toBe("+2782");
  });
  it("dry-runs under test without network", async () => {
    const spy = jest.spyOn(global, "fetch");
    const r = await sendMessage({ channel: "sms", from: "+1", to: "+2", body: "hi" });
    expect(r.sid).toMatch(/^SM[0-9a-f]{32}$/);
    expect(spy).not.toHaveBeenCalled();
  });
});
