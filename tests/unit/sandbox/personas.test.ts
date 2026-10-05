import { DEFAULT_VARIABLES, DEMO_PERSONAS, buildPrompt } from "../../../lib/sandbox/config";

describe("demo sandbox personas", () => {
  it("leads with the aesthetic-clinic persona (the Clinics vertical) and ids are unique", () => {
    expect(DEMO_PERSONAS[0].id).toBe("aesthetic");
    expect(new Set(DEMO_PERSONAS.map((p) => p.id)).size).toBe(DEMO_PERSONAS.length);
  });

  it("the aesthetic persona never gives medical advice or promises results", () => {
    const p = DEMO_PERSONAS[0].prompt;
    expect(p).toMatch(/NEVER give medical advice/);
    expect(p).toMatch(/never promise results/);
    expect(p).toMatch(/Do not ask for medical history/);
  });

  it("buildPrompt carries the prospect's own business, city and the AI disclosure", () => {
    const out = buildPrompt(DEMO_PERSONAS[0], { ...DEFAULT_VARIABLES, businessName: "Skin Studio Rosebank", city: "Johannesburg" });
    expect(out).toContain("Business name: Skin Studio Rosebank");
    expect(out).toContain("City: Johannesburg");
    expect(out).toContain("say you are an AI assistant");
  });
});
