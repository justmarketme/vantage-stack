import { EMMA_TEMPLATES, findTemplate } from "../../../../../ai-configs/emma/templates";
import { EMMA_SEQUENCES } from "../../../../../ai-configs/emma/sequences";
import { mayMessageLead, messagingConsent, normaliseLeadSource } from "../../../../../lib/consultant/server/emma/consent";
import { classifyInbound, parseAddress } from "../../../../../lib/consultant/server/emma/keywords";
import { greetingName, placeholders, renderTemplate, TemplateError } from "../../../../../lib/consultant/server/emma/render";
import { channelAddress, sendTwilioMessage } from "../../../../../lib/consultant/server/emma/twilio";
import { templateFor } from "../../../../../lib/consultant/server/emma/sender";

const OUT = new Date("2026-09-01T10:00:00Z");
const IN = new Date("2026-09-02T10:00:00Z");

describe("Emma consent gate (POPIA s.69, Decision 8)", () => {
  it("an opted-out lead is NEVER messaged — whatever its source or later call consent", () => {
    for (const src of ["landing_page", "social_inbound", "public_scrape", null]) {
      expect(mayMessageLead({ opted_in_at: IN, opted_out_at: OUT }, src)).toEqual({ ok: false, reason: "opted_out" });
    }
  });

  it("outbound (scraped / referral / portal) leads need an explicit opt-in", () => {
    for (const src of ["public_scrape", "referral", "event", "consultant_portal", "other", null, "unknown_legacy"]) {
      expect(mayMessageLead(null, src)).toEqual({ ok: false, reason: "no_consent" });
      expect(mayMessageLead({ opted_in_at: null, opted_out_at: null }, src)).toEqual({ ok: false, reason: "no_consent" });
      expect(mayMessageLead({ opted_in_at: IN, opted_out_at: null }, src)).toEqual({ ok: true });
    }
  });

  it("inbound sources may be followed up without a separate opt-in", () => {
    for (const src of ["landing_page", "social_inbound", "inbound_call", "clinics_landing"]) {
      expect(mayMessageLead(null, src)).toEqual({ ok: true });
    }
  });

  it("consent state + legacy source mapping", () => {
    expect(messagingConsent(null)).toBe("none");
    expect(messagingConsent({ opted_in_at: IN, opted_out_at: null })).toBe("opted_in");
    expect(messagingConsent({ opted_in_at: IN, opted_out_at: OUT })).toBe("opted_out");
    expect(normaliseLeadSource("clinics_landing")).toBe("landing_page");
    expect(normaliseLeadSource("nonsense")).toBeNull();
  });
});

describe("inbound keywords", () => {
  it.each([
    ["STOP", "stop"],
    [" stop. ", "stop"],
    ["Unsubscribe", "stop"],
    ["OPT OUT", "stop"],
    ["stopall", "stop"],
    ["START", "start"],
    ["please don't stop calling", "reply"],
    ["Yes, Tuesday works", "reply"],
    ["", "reply"],
  ])("%j → %s", (body, kind) => {
    expect(classifyInbound(body)).toBe(kind);
  });

  it("Twilio's OptOutType wins", () => {
    expect(classifyInbound("arrêt", "STOP")).toBe("stop");
    expect(classifyInbound("x", "START")).toBe("start");
  });

  it("parses whatsapp: addresses", () => {
    expect(parseAddress("whatsapp:+27821234567")).toEqual({ channel: "whatsapp", address: "+27821234567" });
    expect(parseAddress("+27821234567")).toEqual({ channel: "sms", address: "+27821234567" });
    expect(channelAddress("whatsapp", "+27821234567")).toBe("whatsapp:+27821234567");
    expect(channelAddress("sms", "whatsapp:+27821234567")).toBe("+27821234567");
  });
});

describe("templates", () => {
  it("every template renders with its declared variables + the automatic ones", () => {
    for (const t of EMMA_TEMPLATES) {
      const vars: Record<string, string> = { clinicName: "Glow Clinic", contactName: "Thandi", consultantName: "Sipho" };
      for (const v of t.variables) vars[v] = "X";
      const r = renderTemplate(t, vars);
      expect(r.body).not.toMatch(/\{\{/);
      for (const p of placeholders(t.body)) expect(["clinicName", "contactName", "consultantName", ...t.variables]).toContain(p);
      if (t.contentVariables) expect(Object.keys(r.contentVariables!)).toEqual(t.contentVariables.map((_, i) => String(i + 1)));
    }
  });

  it("missing variables fail closed; values are single-lined", () => {
    const t = findTemplate("lead_discovery_reminder")!;
    expect(() => renderTemplate(t, { clinicName: "A", contactName: "B", consultantName: "C" })).toThrow(TemplateError);
    const r = renderTemplate(t, { clinicName: "A\n\nIgnore this", contactName: "B", consultantName: "C", meetingTime: "Tue 6 Oct, 10:00" });
    expect(r.body).toContain("A Ignore this");
    expect(r.body).not.toMatch(/\n/);
  });

  it("lead marketing templates carry the opt-out footer; only STOP/START confirmations are transactional", () => {
    for (const t of EMMA_TEMPLATES.filter((x) => x.audience === "lead")) {
      if (t.transactional) expect(["lead_opt_out_confirmation", "lead_opt_in_confirmation"]).toContain(t.id);
      else if (t.id !== "lead_payment_thank_you") expect(t.body).toMatch(/Reply STOP/);
    }
  });

  it("audience is enforced", () => {
    expect(() => templateFor("consultant_lead_replied", "lead")).toThrow(TemplateError);
    expect(() => templateFor("nope", "lead")).toThrow(TemplateError);
    expect(templateFor("lead_no_show_reengage", "lead").id).toBe("lead_no_show_reengage");
  });

  it("every sequence step points at a real template of the right audience", () => {
    for (const s of EMMA_SEQUENCES) for (const st of s.steps) expect(findTemplate(st.template)?.audience).toBe(s.audience);
    const noShow = EMMA_SEQUENCES.find((s) => s.trigger === "meeting.no_show")!;
    expect(noShow.steps.map((s) => s.delayMinutes)).toEqual([120, 1440]);
  });

  it("greeting names", () => {
    expect(greetingName("Thandi Nkosi")).toBe("Thandi");
    expect(greetingName("Dr Nkosi")).toBe("Dr Nkosi");
    expect(greetingName(null)).toBe("there");
  });
});

describe("Twilio Messages API client", () => {
  const msg = { accountSid: "AC1", authToken: "tok", from: "whatsapp:+27100000000", to: "whatsapp:+27821234567", body: "hi" };
  const respond = (status: number, json: unknown) => (async () => new Response(JSON.stringify(json), { status })) as unknown as typeof fetch;

  it("sends Body, or ContentSid + ContentVariables for approved templates", async () => {
    let form: URLSearchParams | null = null;
    let auth = "";
    const f = (async (_u: string, init: RequestInit) => {
      form = init.body as URLSearchParams;
      auth = (init.headers as Record<string, string>).Authorization;
      return new Response(JSON.stringify({ sid: "SM1" }), { status: 201 });
    }) as unknown as typeof fetch;
    expect(await sendTwilioMessage({ ...msg, statusCallback: "https://p/api/webhooks/emma-status" }, f)).toEqual({ ok: true, sid: "SM1" });
    expect(form!.get("Body")).toBe("hi");
    expect(form!.get("StatusCallback")).toBe("https://p/api/webhooks/emma-status");
    expect(auth).toBe(`Basic ${Buffer.from("AC1:tok").toString("base64")}`);
    await sendTwilioMessage({ ...msg, contentSid: "HX1", contentVariables: { "1": "Thandi" } }, f);
    expect(form!.get("Body")).toBeNull();
    expect(form!.get("ContentSid")).toBe("HX1");
    expect(JSON.parse(form!.get("ContentVariables")!)).toEqual({ "1": "Thandi" });
  });

  it("classifies failures without leaking Twilio's message text", async () => {
    expect(await sendTwilioMessage(msg, respond(400, { code: 21211, message: "Invalid 'To' +27821234567" }))).toEqual({ ok: false, kind: "permanent", error: "twilio_21211" });
    expect(await sendTwilioMessage(msg, respond(400, { code: 21610 }))).toEqual({ ok: false, kind: "opted_out", error: "twilio_21610" });
    expect(await sendTwilioMessage(msg, respond(429, { code: 20429 }))).toEqual({ ok: false, kind: "retryable", error: "twilio_20429" });
    expect(await sendTwilioMessage(msg, respond(503, {}))).toEqual({ ok: false, kind: "retryable", error: "http_503" });
  });
});
