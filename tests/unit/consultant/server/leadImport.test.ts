import { prepareImport } from "../../../../lib/consultant/server/repo/leadImport";

type L = Parameters<typeof prepareImport>[0]["leads"][number];
const lead = (o: Partial<L>): L => ({
  businessName: "Clinic",
  phone: null,
  email: null,
  website: null,
  address: null,
  placeId: null,
  ownerName: null,
  sourceUrl: null,
  ...o,
});

describe("scraped lead import — normalise, reject, dedupe (pure pass)", () => {
  test("only SA +27 numbers are imported; local 0… is converted", () => {
    const r = prepareImport({
      leads: [
        lead({ businessName: "A", phone: "021 555 0101" }),
        lead({ businessName: "B", phone: "+27 82 555 0102" }),
        lead({ businessName: "C", phone: "+44 20 7946 0958" }), // UK
        lead({ businessName: "D", phone: "+1 202 555 0143" }), // US
        lead({ businessName: "E", phone: null }),
        lead({ businessName: "F", phone: "12" }),
      ],
    });
    expect(r.candidates.map((c) => c.phone)).toEqual(["+27215550101", "+27825550102"]);
    expect(r.rejectedNonZaPhone).toBe(4);
    expect(r.duplicates).toBe(0);
  });

  test("in-batch duplicates on phone OR place id are dropped (first wins)", () => {
    const r = prepareImport({
      leads: [
        lead({ businessName: "A", phone: "0215550101", placeId: "place-1" }),
        lead({ businessName: "A again", phone: "+27215550101" }), // same phone
        lead({ businessName: "A branch", phone: "0215550199", placeId: "place-1" }), // same place
        lead({ businessName: "B", phone: "0215550102", placeId: "place-2" }),
      ],
    });
    expect(r.candidates.map((c) => c.name)).toEqual(["A", "B"]);
    expect(r.duplicates).toBe(2);
  });

  test("fields are cleaned: bad emails dropped, websites get https, owner → contact, '—' is empty", () => {
    const [c] = prepareImport({
      leads: [
        lead({
          businessName: "  Glow  ",
          phone: "0215550101",
          email: " Info@Glow.EXAMPLE ",
          website: "glow.example",
          address: "—",
          ownerName: "Dr Mokoena",
          sourceUrl: "javascript:alert(1)",
        }),
      ],
    }).candidates;
    expect(c).toMatchObject({
      name: "Glow",
      email: "info@glow.example",
      website: "https://glow.example/",
      address: null,
      contactName: "Dr Mokoena",
      sourceUrl: null,
    });
    const [d] = prepareImport({ leads: [lead({ phone: "0215550101", email: "nope", contactName: "Thandi", ownerName: "Owner" })] }).candidates;
    expect(d.email).toBeNull();
    expect(d.contactName).toBe("Thandi");
  });
});
