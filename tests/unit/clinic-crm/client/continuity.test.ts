import { parseEnvelope, resolveLatest } from "../../../../lib/clinic-crm/client/continuity";

describe("continuity last-write-wins", () => {
  const a = { v: "front desk draft", t: 1000 };
  const b = { v: "phone draft", t: 2000 };

  it("newer remote wins", () => {
    expect(resolveLatest(a, b)).toEqual({ winner: "remote", value: b });
  });
  it("newer local wins", () => {
    expect(resolveLatest(b, a)).toEqual({ winner: "local", value: b });
  });
  it("ties go to local (no pointless overwrite)", () => {
    expect(resolveLatest(a, { v: "other", t: 1000 }).winner).toBe("local");
  });
  it("one side missing", () => {
    expect(resolveLatest(null, b)).toEqual({ winner: "remote", value: b });
    expect(resolveLatest(a, null)).toEqual({ winner: "local", value: a });
    expect(resolveLatest(null, null)).toEqual({ winner: "none", value: null });
  });
});

describe("parseEnvelope", () => {
  it("accepts {v,t} including falsy values", () => {
    expect(parseEnvelope({ v: 0, t: 5 })).toEqual({ v: 0, t: 5 });
    expect(parseEnvelope({ v: null, t: 5 })).toEqual({ v: null, t: 5 });
  });
  it("rejects legacy/raw/garbage", () => {
    expect(parseEnvelope("dark")).toBeNull();
    expect(parseEnvelope(null)).toBeNull();
    expect(parseEnvelope({ v: 1 })).toBeNull();
    expect(parseEnvelope({ v: 1, t: "5" })).toBeNull();
    expect(parseEnvelope({ v: 1, t: Infinity })).toBeNull();
  });
});
