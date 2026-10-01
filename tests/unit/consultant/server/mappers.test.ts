import { consultantConfig } from "../../../../lib/consultant/config";
import { isPlaceholderEmail, toCall, toLead, type CallRow, type LeadRow } from "../../../../lib/consultant/server/mappers";

const NOW = new Date("2026-09-30T12:00:00Z");

const leadRow = (over: Partial<LeadRow> = {}): LeadRow => ({
  id: "11111111-1111-4111-8111-111111111111",
  clinic_name: "Glow Clinic",
  contact_name: null,
  contact_role: null,
  phone: "+27821234567",
  email: "clinic+abc@internal.vantagestack",
  website_url: null,
  city: "Cape Town",
  lead_source: "consultant_portal",
  sales_stage: null,
  sales_stage_changed_at: null,
  lost_reason: null,
  next_action: null,
  next_action_at: null,
  deal_value: "4500",
  consultant_id: null,
  consultant_name: null,
  last_call_at: new Date("2026-09-29T12:00:00Z"),
  call_count: "2",
  created_at: new Date("2026-09-01T12:00:00Z"),
  ...over,
});

describe("toLead", () => {
  test("hides the internal placeholder email and defaults the stage", () => {
    const lead = toLead(leadRow(), consultantConfig().pipeline, NOW);
    expect(lead.email).toBeNull();
    expect(lead.salesStage).toBe("new");
    expect(lead.vertical).toBe("clinics");
    expect(lead.dealValue).toBe(4500);
    expect(lead.callCount).toBe(2);
    expect(lead.salesStageChangedAt).toBe("2026-09-01T12:00:00.000Z");
  });

  test("health uses the most recent touch (last call here)", () => {
    expect(toLead(leadRow(), { ...consultantConfig().pipeline, healthYellowDays: 3, healthRedDays: 7 }, NOW).health).toBe("green");
    expect(
      toLead(leadRow({ last_call_at: null }), { ...consultantConfig().pipeline, healthYellowDays: 3, healthRedDays: 7 }, NOW).health,
    ).toBe("red");
  });

  test("real emails pass through", () => {
    expect(toLead(leadRow({ email: "owner@glow.example" }), consultantConfig().pipeline, NOW).email).toBe("owner@glow.example");
    expect(isPlaceholderEmail("owner@glow.example")).toBe(false);
  });
});

describe("toCall", () => {
  test("never exposes the recording sid, only whether one exists", () => {
    const row: CallRow = {
      id: "c", client_id: "l", consultant_id: "m", consultant_name: "Thabo", to_number: "+27821234567",
      status: "completed", started_at: NOW, answered_at: NOW, ended_at: NOW, duration_sec: 60,
      recording_sid: "RE0123456789abcdef0123456789abcdef", disposition: "bogus", next_action: null,
      next_action_at: null, summary_status: "ready", summary: null,
    };
    const call = toCall(row);
    expect(call.hasRecording).toBe(true);
    expect(JSON.stringify(call)).not.toContain("RE0123456789");
    expect(call.disposition).toBeNull();
  });
});
