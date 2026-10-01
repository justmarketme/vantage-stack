import { consultantConfig, crmStatusForStage, portalStatusValues } from "../../../../lib/consultant/config";
import { dealStatusForStage } from "../../../../lib/consultant/server/format";
import { SALES_STAGES } from "../../../../lib/consultant/types";

describe("sales stage → CRM status", () => {
  const cfg = consultantConfig();

  test("only proposal, won and paid move the CRM delivery status", () => {
    for (const stage of SALES_STAGES) {
      const status = crmStatusForStage(stage, cfg);
      if (stage === "proposal") expect(status).toBe(cfg.pipeline.statusOnProposal);
      else if (stage === "won" || stage === "paid") expect(status).toBe(cfg.pipeline.statusOnWon);
      else expect(status).toBeNull();
    }
  });

  test("paid is a won client in the CRM; no_show leaves the CRM status alone", () => {
    expect(crmStatusForStage("paid", cfg)).toBe(cfg.pipeline.statusOnWon);
    expect(crmStatusForStage("no_show", cfg)).toBeNull();
  });

  test("every status the portal can write is ensured on the enum", () => {
    const writable = new Set(portalStatusValues(cfg));
    expect(writable.has(cfg.pipeline.newLeadStatus)).toBe(true);
    for (const stage of SALES_STAGES) {
      const s = crmStatusForStage(stage, cfg);
      if (s) expect(writable.has(s)).toBe(true);
    }
  });
});

describe("sales stage → deals.proposal_status", () => {
  test("won and paid are accepted, proposal is sent, lost is lost, everything else draft", () => {
    expect(dealStatusForStage("won")).toBe("accepted");
    expect(dealStatusForStage("paid")).toBe("accepted");
    expect(dealStatusForStage("proposal")).toBe("sent");
    expect(dealStatusForStage("lost")).toBe("lost");
    for (const s of ["new", "contacted", "discovery_booked", "no_show", "demo_done"] as const) expect(dealStatusForStage(s)).toBe("draft");
  });
});
