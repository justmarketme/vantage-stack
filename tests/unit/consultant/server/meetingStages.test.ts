import { canChangeStatus, stageAfterBooking, stageAfterStatus } from "../../../../lib/consultant/server/meetingStages";
import { SALES_STAGES, type SalesStage } from "../../../../lib/consultant/types";

describe("stage automation — booking", () => {
  test("a discovery on new / contacted / no_show → discovery_booked; later stages untouched", () => {
    const expected: Record<SalesStage, SalesStage | null> = {
      new: "discovery_booked",
      contacted: "discovery_booked",
      no_show: "discovery_booked",
      discovery_booked: null,
      demo_done: null,
      proposal: null,
      won: null,
      paid: null,
      lost: null,
    };
    for (const s of SALES_STAGES) expect(stageAfterBooking("discovery", s)).toBe(expected[s]);
  });
  test("a demo moves the lead to at least discovery_booked", () => {
    expect(stageAfterBooking("demo", "new")).toBe("discovery_booked");
    expect(stageAfterBooking("demo", "contacted")).toBe("discovery_booked");
    expect(stageAfterBooking("demo", "no_show")).toBe("discovery_booked");
    for (const s of ["discovery_booked", "demo_done", "proposal", "won", "paid", "lost"] as const) expect(stageAfterBooking("demo", s)).toBeNull();
  });
  test("a follow-up never moves the stage", () => {
    for (const s of SALES_STAGES) expect(stageAfterBooking("follow_up", s)).toBeNull();
  });
});

describe("stage automation — status changes", () => {
  test("no_show → lead no_show only while still discovery_booked", () => {
    for (const kind of ["discovery", "demo", "follow_up"] as const) {
      for (const s of SALES_STAGES) expect(stageAfterStatus(kind, "no_show", s)).toBe(s === "discovery_booked" ? "no_show" : null);
    }
  });
  test("held demo → demo_done unless already there or beyond (or lost)", () => {
    for (const s of ["new", "contacted", "discovery_booked", "no_show"] as const) expect(stageAfterStatus("demo", "held", s)).toBe("demo_done");
    for (const s of ["demo_done", "proposal", "won", "paid", "lost"] as const) expect(stageAfterStatus("demo", "held", s)).toBeNull();
  });
  test("held discovery / follow-up, cancelled and scheduled leave the stage", () => {
    for (const s of SALES_STAGES) {
      expect(stageAfterStatus("discovery", "held", s)).toBeNull();
      expect(stageAfterStatus("follow_up", "held", s)).toBeNull();
      expect(stageAfterStatus("demo", "cancelled", s)).toBeNull();
      expect(stageAfterStatus("discovery", "scheduled", s)).toBeNull();
    }
  });
  test("a cancelled meeting is final", () => {
    expect(canChangeStatus("cancelled", "scheduled")).toBe(false);
    expect(canChangeStatus("cancelled", "held")).toBe(false);
    expect(canChangeStatus("scheduled", "cancelled")).toBe(true);
    expect(canChangeStatus("held", "no_show")).toBe(true);
  });
});
