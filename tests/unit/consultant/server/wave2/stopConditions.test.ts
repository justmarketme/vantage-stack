import { firstStop, type StopState } from "../../../../../lib/consultant/server/events/stopConditions";

const base: StopState = {
  eventAt: new Date("2026-10-01T08:00:00Z"),
  stageAtEvent: "discovery_booked",
  meetingStartsAtEvent: "2026-10-02T08:00:00.000Z",
  currentStage: "discovery_booked",
  optedOut: false,
  lastReplyAt: null,
  meeting: { status: "scheduled", startsAt: "2026-10-02T08:00:00.000Z" },
};
const all = ["lead_replied", "meeting_rescheduled", "meeting_held", "stage_advanced", "opted_out", "lead_lost"] as const;

describe("Emma sequence stop conditions", () => {
  it("lets the step go ahead when nothing changed", () => {
    expect(firstStop(base, all)).toBeNull();
  });
  it("only checks the conditions the step lists", () => {
    expect(firstStop({ ...base, optedOut: true }, ["lead_replied"])).toBeNull();
  });
  it("stops on an opt-out and on a lost lead", () => {
    expect(firstStop({ ...base, optedOut: true }, all)).toBe("opted_out");
    expect(firstStop({ ...base, currentStage: "lost" }, all)).toBe("lead_lost");
  });
  it("stops on a reply AFTER the event, not one before it", () => {
    expect(firstStop({ ...base, lastReplyAt: new Date("2026-10-01T09:00:00Z") }, all)).toBe("lead_replied");
    expect(firstStop({ ...base, lastReplyAt: new Date("2026-09-30T09:00:00Z") }, all)).toBeNull();
  });
  it("treats a cancelled or moved meeting as rescheduled, and the same time (any format) as unchanged", () => {
    expect(firstStop({ ...base, meeting: { status: "cancelled", startsAt: base.meeting!.startsAt } }, all)).toBe("meeting_rescheduled");
    expect(firstStop({ ...base, meeting: { status: "scheduled", startsAt: "2026-10-03T08:00:00.000Z" } }, all)).toBe("meeting_rescheduled");
    expect(firstStop({ ...base, meetingStartsAtEvent: "2026-10-02T10:00:00+02:00" }, all)).toBeNull();
  });
  it("stops once the meeting was held", () => {
    expect(firstStop({ ...base, meeting: { status: "held", startsAt: base.meeting!.startsAt } }, ["meeting_held"])).toBe("meeting_held");
  });
  it("counts only forward pipeline movement as advanced (lost is not progress)", () => {
    expect(firstStop({ ...base, currentStage: "proposal" }, ["stage_advanced"])).toBe("stage_advanced");
    expect(firstStop({ ...base, currentStage: "contacted" }, ["stage_advanced"])).toBeNull();
    expect(firstStop({ ...base, currentStage: "lost" }, ["stage_advanced"])).toBeNull();
  });
  it("is fine with events that carry no meeting", () => {
    expect(firstStop({ ...base, meeting: null, meetingStartsAtEvent: null }, all)).toBeNull();
  });
});
