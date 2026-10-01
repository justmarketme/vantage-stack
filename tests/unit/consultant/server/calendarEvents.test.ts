import { buildEventSpec, eventTitle, inviteeFor } from "../../../../lib/consultant/server/calendar/events";
import { googleEventBody, googleEventId } from "../../../../lib/consultant/server/calendar/google";
import { classifyStatus } from "../../../../lib/consultant/server/calendar/http";
import { graphEventBody } from "../../../../lib/consultant/server/calendar/microsoft";
import { sastDateKey, sastLabel, sastRfc3339, sastStartOfDay, sastWallClock } from "../../../../lib/consultant/server/calendar/sast";
import { backoffSec, syncStateFor } from "../../../../lib/consultant/server/calendar/sync";

const MEETING = {
  meetingId: "0b6c7c1e-8a1d-4d7e-9c55-0123456789ab",
  kind: "discovery" as const,
  startsAt: "2026-10-05T07:00:00.000Z", // 09:00 SAST
  endsAt: "2026-10-05T07:30:00.000Z",
  inviteClinic: true,
  leadId: "7d1f0000-0000-4000-8000-00000000abcd",
  clinicName: "Lumière Aesthetics & Skin Clinic",
  contactName: "Dr Naledi Dlamini",
  email: "naledi@lumiere.example",
};

describe("SAST helpers", () => {
  test("wall clock, RFC 3339 offset and date key are Johannesburg time", () => {
    expect(sastWallClock("2026-10-05T07:00:00Z")).toBe("2026-10-05T09:00:00");
    expect(sastRfc3339("2026-10-05T07:00:00Z")).toBe("2026-10-05T09:00:00+02:00");
    // 23:30 UTC is already the next day in SAST.
    expect(sastDateKey("2026-10-05T23:30:00Z")).toBe("2026-10-06");
    expect(sastStartOfDay("2026-10-05T23:30:00Z").toISOString()).toBe("2026-10-05T22:00:00.000Z");
    expect(sastLabel("2026-10-05T07:00:00Z")).toMatch(/09:00 SAST$/);
  });
});

describe("event spec", () => {
  test("title is '<Kind> · <Clinic>' and the description links the workspace with no phone numbers", () => {
    const spec = buildEventSpec(MEETING, "https://app.vantagestack.test/");
    expect(spec.title).toBe("Discovery call · Lumière Aesthetics & Skin Clinic");
    expect(spec.description).toContain("https://app.vantagestack.test/consultant/leads/7d1f0000-0000-4000-8000-00000000abcd");
    expect(spec.description).toContain("09:00 SAST");
    expect(spec.description).not.toMatch(/\+27|\b0\d{9}\b/);
    expect(eventTitle("demo", " X ")).toBe("Demo · X");
    expect(eventTitle("follow_up", "X")).toBe("Follow-up · X");
  });

  test("the clinic is invited only when asked AND the email is real", () => {
    expect(inviteeFor(MEETING)).toEqual({ email: "naledi@lumiere.example", name: "Dr Naledi Dlamini" });
    expect(inviteeFor({ ...MEETING, inviteClinic: false })).toBeNull();
    expect(inviteeFor({ ...MEETING, email: "clinic+abc@internal.vantagestack" })).toBeNull();
    expect(inviteeFor({ ...MEETING, email: null })).toBeNull();
    expect(inviteeFor({ ...MEETING, email: "not-an-email" })).toBeNull();
  });
});

describe("Google body", () => {
  const spec = buildEventSpec(MEETING, "https://app.test");
  test("SAST offset + IANA zone, deterministic base32hex id on insert only", () => {
    const body = googleEventBody(spec, { includeId: true });
    expect(body.start).toEqual({ dateTime: "2026-10-05T09:00:00+02:00", timeZone: "Africa/Johannesburg" });
    expect(body.end).toEqual({ dateTime: "2026-10-05T09:30:00+02:00", timeZone: "Africa/Johannesburg" });
    expect(body.summary).toBe(spec.title);
    expect(body.attendees).toEqual([{ email: "naledi@lumiere.example", displayName: "Dr Naledi Dlamini" }]);
    expect(body.id).toBe(googleEventId(MEETING.meetingId));
    expect(String(body.id)).toMatch(/^[0-9a-v]{5,1024}$/);
    expect(googleEventBody(spec, { includeId: false }).id).toBeUndefined();
  });
  test("no attendee → empty attendee list", () => {
    const body = googleEventBody(buildEventSpec({ ...MEETING, inviteClinic: false }, ""), { includeId: false });
    expect(body.attendees).toEqual([]);
  });
});

describe("Microsoft Graph body", () => {
  const spec = buildEventSpec(MEETING, "https://app.test");
  test("zone-less SAST wall clock + 'South Africa Standard Time'; transactionId only on create", () => {
    const body = graphEventBody(spec, { create: true });
    expect(body.subject).toBe(spec.title);
    expect(body.start).toEqual({ dateTime: "2026-10-05T09:00:00", timeZone: "South Africa Standard Time" });
    expect(body.end).toEqual({ dateTime: "2026-10-05T09:30:00", timeZone: "South Africa Standard Time" });
    expect(body.body).toEqual({ contentType: "text", content: spec.description });
    expect(body.attendees).toEqual([{ emailAddress: { address: "naledi@lumiere.example", name: "Dr Naledi Dlamini" }, type: "required" }]);
    expect(body.transactionId).toBe(MEETING.meetingId);
    expect(graphEventBody(spec, { create: false }).transactionId).toBeUndefined();
  });
});

describe("sync bookkeeping", () => {
  test("provider HTTP status → retry category (never provider text)", () => {
    expect(classifyStatus(401).kind).toBe("auth");
    expect(classifyStatus(400, "invalid_grant").kind).toBe("auth");
    expect(classifyStatus(404).kind).toBe("not_found");
    expect(classifyStatus(410).kind).toBe("not_found");
    expect(classifyStatus(409).kind).toBe("conflict");
    expect(classifyStatus(429).kind).toBe("transient");
    expect(classifyStatus(503).kind).toBe("transient");
    expect(classifyStatus(400).kind).toBe("invalid");
    expect(classifyStatus(401).message).toBe("calendar_auth_401");
  });
  test("exponential backoff, capped", () => {
    expect([1, 2, 3, 4].map((n) => backoffSec(n, 60, 3600))).toEqual([60, 120, 240, 480]);
    expect(backoffSec(20, 60, 3600)).toBe(3600);
    expect(backoffSec(0, 60, 3600)).toBe(60);
  });
  test("Meeting.sync state", () => {
    expect(syncStateFor(null, null)).toBe("not_connected");
    expect(syncStateFor(null, "synced")).toBe("not_connected");
    expect(syncStateFor("connected", null)).toBe("pending");
    expect(syncStateFor("connected", "pending")).toBe("pending");
    expect(syncStateFor("connected", "synced")).toBe("synced");
    expect(syncStateFor("connected", "failed")).toBe("failed");
    expect(syncStateFor("error", "pending")).toBe("failed");
    expect(syncStateFor("error", "synced")).toBe("synced");
  });
});
