// Proves the voice value-matcher works the SAME for every industry, sub-niche,
// dropdown and multi-select — not just the "Real estate" example. If any option
// in any field can't be resolved from speech, this suite fails.

import { matchOption } from "../../lib/blueprint/match-option";
import { quickFormSchema, type FieldDef, type FormData, type OptionDef } from "../../lib/blueprint/form-schema";
import { getIndustryData } from "../../lib/crm/industry-data";

const optValue = (o: OptionDef): string => (typeof o === "string" ? o : o.value);
const optLabel = (o: OptionDef): string => (typeof o === "string" ? o : o.label);
const getOpts = (f: FieldDef, data: FormData): OptionDef[] => f.options ?? (f.getOptions ? f.getOptions(data) : []);

const [step1, step2, step3] = quickFormSchema.steps;
const industryField = step1.fields.find((f) => f.key === "industry")!;
const intentField = step1.fields.find((f) => f.key === "primaryIntent")!;
const INDUSTRIES = industryField.options!.map(optValue);
const BRANCHES = ["LEADS", "PRESENCE", "AUTOMATION", "EXPLORE"];

// Collect every UNIQUE choice-option set the form can present (deduped by signature).
const seen = new Set<string>();
const optionSets: { name: string; opts: OptionDef[] }[] = [];
function collect(name: string, opts: OptionDef[]) {
  if (opts.length === 0) return;
  const sig = opts.map(optValue).join("|");
  if (seen.has(sig)) return;
  seen.add(sig);
  optionSets.push({ name, opts });
}

// Step 1 + Step 3 static fields, and the per-industry sub-niche list.
for (const industry of INDUSTRIES) {
  const data: FormData = { industry, websiteExists: "Yes — it's live" };
  for (const step of [step1, step3]) {
    for (const f of step.fields) {
      if (f.visibleWhen && !f.visibleWhen(data)) continue;
      collect(`${f.key} (${industry})`, getOpts(f, data));
    }
  }
}
// Step 2 per branch.
for (const intent of BRANCHES) {
  const data: FormData = { primaryIntent: intent, websiteExists: "Yes — it's live" };
  for (const f of step2.fields) {
    if (f.visibleWhen && !f.visibleWhen(data)) continue;
    collect(`${f.key} (${intent})`, getOpts(f, data));
  }
}

describe("every choice option in every field round-trips through matchOption", () => {
  it.each(optionSets.map((c) => [c.name, c.opts] as [string, OptionDef[]]))("%s", (_name, opts) => {
    for (const o of opts) {
      const val = optValue(o);
      const label = optLabel(o);
      expect(matchOption(opts, val)).toBe(val); // exact value
      expect(matchOption(opts, label)).toBe(val); // exact label
      expect(matchOption(opts, val.toLowerCase())).toBe(val); // lowercased speech
    }
  });
});

describe("sub-niches populate AND resolve for every industry (not just Real estate)", () => {
  for (const industry of INDUSTRIES) {
    const subs = getIndustryData(industry).subNiches;
    if (industry === "Other") {
      it(`${industry}: no sub-niches (free-text instead)`, () => expect(subs.length).toBe(0));
      continue;
    }
    it(`${industry}: has sub-niches`, () => expect(subs.length).toBeGreaterThan(0));
    it(`${industry}: every sub-niche resolves from speech`, () => {
      for (const s of subs) {
        expect(matchOption(subs, s)).toBe(s);
        expect(matchOption(subs, s.toLowerCase())).toBe(s);
      }
    });
  }
});

describe("industries resolve from natural speech", () => {
  it.each([
    ["real estate", "Real estate"],
    ["Real Estate", "Real estate"],
    ["ecommerce", "E-commerce"],
    ["e commerce", "E-commerce"],
    ["food and beverage", "Food & Beverage"],
    ["financial", "Financial services"],
    ["professional services", "Professional services"],
    ["health care", "Healthcare"],
    ["tech", "Technology"],
    ["marketing", "Marketing"],
  ])("'%s' -> %s", (spoken, expected) => {
    expect(matchOption(INDUSTRIES, spoken)).toBe(expected);
  });
});

describe("real-estate sub-niche example resolves from speech", () => {
  const subs = getIndustryData("Real estate").subNiches;
  it.each([
    ["residential sales", "Residential Sales"],
    ["commercial", "Commercial Property"],
    ["property management", "Property Management"],
  ])("'%s' -> %s", (spoken, expected) => {
    expect(matchOption(subs, spoken)).toBe(expected);
  });
});

describe("primary intent resolves from speech (value or phrase)", () => {
  const opts = intentField.options!;
  it.each([
    ["leads", "LEADS"],
    ["I'm losing leads", "LEADS"],
    ["presence", "PRESENCE"],
    ["online presence", "PRESENCE"],
    ["automation", "AUTOMATION"],
    ["automate the admin", "AUTOMATION"],
    ["explore", "EXPLORE"],
  ])("'%s' -> %s", (spoken, expected) => {
    expect(matchOption(opts, spoken)).toBe(expected);
  });
});

describe("clearly-unrelated answers do not false-match", () => {
  it("gibberish against industries returns null", () => {
    expect(matchOption(INDUSTRIES, "underwater basket weaving zzz")).toBeNull();
  });
  it("empty string returns null", () => {
    expect(matchOption(INDUSTRIES, "   ")).toBeNull();
  });
});
