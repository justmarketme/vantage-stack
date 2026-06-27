// Guards the generated per-field voice tools: every choice field gets a tool whose
// enum is EXACTLY its real schema options (so the AI can only emit a valid value),
// handlers and definitions stay in parity, and free-text fields don't get a set_ tool.

import { BLUEPRINT_TOOL_DEFINITIONS, createBlueprintClientTools } from "../../lib/blueprint/voice-tools";
import { quickFormSchema, type OptionDef } from "../../lib/blueprint/form-schema";

const optValue = (o: OptionDef): string => (typeof o === "string" ? o : o.value);
const defsByName = new Map(BLUEPRINT_TOOL_DEFINITIONS.map((d) => [d.name, d]));
const handlers = createBlueprintClientTools();

const allFields = quickFormSchema.steps.flatMap((s) => s.fields);
const staticChoice = allFields.filter(
  (f) => (f.kind === "select" || f.kind === "cards" || f.kind === "multi") && (f.options?.length ?? 0) > 0,
);

describe("per-field enum tools mirror the schema exactly", () => {
  it.each(staticChoice.map((f) => [f.key, f] as const))("set_%s enum == real options", (key, f) => {
    const def = defsByName.get(`set_${key}`);
    expect(def).toBeDefined();
    const expected = (f.options ?? []).map(optValue);
    expect(def!.parameters.value.enum).toEqual(expected);
  });
});

describe("tool wiring is consistent", () => {
  it("no duplicate tool names", () => {
    const names = BLUEPRINT_TOOL_DEFINITIONS.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every definition has a client handler and vice-versa", () => {
    const defNames = new Set(BLUEPRINT_TOOL_DEFINITIONS.map((d) => d.name));
    const handlerNames = new Set(Object.keys(handlers));
    expect(handlerNames).toEqual(defNames);
  });

  it("getSubNiches waits for a response; set_subNiche exists", () => {
    expect(defsByName.get("getSubNiches")?.expectsResponse).toBe(true);
    expect(defsByName.has("set_subNiche")).toBe(true);
  });

  it("free-text fields do NOT get a set_ tool (use generic setBlueprintField)", () => {
    for (const key of ["clientName", "email", "whatsapp", "industryCustomDescription", "websiteUrl", "primarySocialHandle"]) {
      expect(defsByName.has(`set_${key}`)).toBe(false);
    }
    expect(defsByName.has("setBlueprintField")).toBe(true);
  });

  it("every set_<field> enum value is a real option of that field", () => {
    for (const f of staticChoice) {
      const enumVals = defsByName.get(`set_${f.key}`)!.parameters.value.enum ?? [];
      const real = new Set((f.options ?? []).map(optValue));
      for (const v of enumVals) expect(real.has(v)).toBe(true);
    }
  });
});
