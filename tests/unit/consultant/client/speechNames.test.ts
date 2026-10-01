import { normaliseForKind, normaliseSpokenName, normaliseSpokenPhone, validateSpoken } from "../../../../lib/consultant/client/speech";
import { SA_NAMES } from "../../../../lib/consultant/client/saNames";

describe("normaliseSpokenName — South African names", () => {
  it.each([
    // STT mis-spellings → canonical
    ["tandeka mokwena", "Thandeka Mokoena"],
    ["lorato naidu", "Lerato Naidoo"],
    ["seepo dlamini", "Sipho Dlamini"],
    ["kagisho molefi", "Kagiso Molefe"],
    ["priya govinder", "Priya Govender"],
    ["zanelle pilay", "Zanele Pillay"],
    // Split / merged words
    ["nkosi nathi dlamini", "Nkosinathi Dlamini"],
    ["pieter vandermerwe", "Pieter van der Merwe"],
    ["johannes van de merwe", "Johannes van der Merwe"],
    ["sipho du plessey", "Sipho du Plessis"],
    // Casing
    ["LERATO MOKOENA", "Lerato Mokoena"],
    ["mbali ngcobo", "Mbali Ngcobo"],
    ["thabo mbeki", "Thabo Mbeki"],
    ["charne botha", "Charné Botha"],
    ["anél du toit", "Anél du Toit"],
    // Surname standing alone: capital particle (SA usage)
    ["van der merwe", "Van der Merwe"],
    ["du toit", "Du Toit"],
    ["janse van rensburg", "Janse van Rensburg"],
    // Unknown names: sensible title case with particles
    ["pieter de kock", "Pieter de Kock"],
    ["mary o'brien", "Mary O'Brien"],
    ["sarah mcdonald", "Sarah McDonald"],
    ["zanele smith-jones", "Zanele Smith-Jones"],
    ["j p van wyk", "J P van Wyk"],
    // Lead-ins, honorifics, spelling out
    ["my name is thandeka", "Thandeka"],
    ["her surname is t h a n d e k a", "Thandeka"],
    ["you're speaking to doctor priya naidu", "Dr Priya Naidoo"],
    ["mister van wyk", "Mr Van Wyk"],
    ["", ""],
  ])("%s → %s", (input, expected) => {
    expect(normaliseSpokenName(input)).toBe(expected);
  });

  it("does not 'correct' legitimate alternative spellings", () => {
    expect(normaliseSpokenName("dhlamini")).toBe("Dhlamini");
    expect(normaliseSpokenName("refiloe")).toBe("Refiloe");
    expect(normaliseSpokenName("pillai")).toBe("Pillai");
  });

  it("the data table covers every requested heritage and has no clashing entries", () => {
    const origins = new Set(SA_NAMES.map((n) => n.origin));
    for (const o of ["afrikaans", "zulu", "xhosa", "sotho", "tswana", "indian", "english"]) {
      if (o === "zulu") expect(origins.has("nguni")).toBe(true);
      else expect(origins.has(o as never)).toBe(true);
    }
    for (const needed of ["Nkosinathi", "Thandeka", "Lerato", "Mbali", "Sipho", "Zanele", "Pieter", "Johannes", "van der Merwe", "Botha", "Naidoo", "Pillay", "Govender", "Dlamini", "Nkosi", "Mokoena"]) {
      expect(SA_NAMES.some((n) => n.canonical === needed)).toBe(true);
    }
    // A mis-hearing must never be another entry's canonical spelling.
    const key = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
    const canon = new Set(SA_NAMES.map((n) => key(n.canonical)));
    for (const n of SA_NAMES) for (const m of n.misheard ?? []) expect([n.canonical, canon.has(key(m))]).toEqual([n.canonical, false]);
  });

  it("validateSpoken('name') and interim display", () => {
    expect(validateSpoken("name", "tandeka van der merwe")).toEqual({ ok: true, value: "Thandeka van der Merwe" });
    expect(validateSpoken("name", "   ").ok).toBe(false);
    expect(validateSpoken("name", "a").ok).toBe(false);
    expect(normaliseForKind("name", "lerato mokwena")).toBe("Lerato Mokoena");
  });
});

describe("phones are +27 only", () => {
  it("rejects foreign numbers with a clear message", () => {
    const uk = validateSpoken("phone", "plus four four two oh seven nine four six oh nine five eight");
    expect(uk.ok).toBe(false);
    expect(uk.value).toBe("+442079460958");
    expect(uk.error).toMatch(/South African numbers \(\+27\)/);
    const us = validateSpoken("phone", "+1 212 555 1234");
    expect(us.ok).toBe(false);
    expect(us.error).toMatch(/\+27/);
  });

  it("accepts SA numbers in every spoken form, including a dropped trunk zero", () => {
    expect(normaliseSpokenPhone("eight two five five five one two three four")).toBe("+27825551234");
    expect(normaliseSpokenPhone("double oh two seven eight two five five five one two three four")).toBe("+27825551234");
    expect(validateSpoken("phone", "plus two seven eight two five five five one two three four")).toEqual({ ok: true, value: "+27825551234" });
  });

  it("an over-long local number is 'invalid', not 'foreign'", () => {
    const r = validateSpoken("phone", "zero eight two five five five one two three four five");
    expect(r.ok).toBe(false);
    expect(r.error).not.toMatch(/\+27\)/);
  });
});
