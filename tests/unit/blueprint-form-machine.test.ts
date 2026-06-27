import { createActor, waitFor } from "xstate";
import { createFormMachine, type FormEmitted, type SubmitFn } from "../../lib/blueprint/form-machine";
import { quickFormSchema, detailedFormSchema } from "../../lib/blueprint/form-schema";

// ── helpers ──────────────────────────────────────────────────────────────────

function startQuick(opts?: { submit?: SubmitFn }) {
  const actor = createActor(createFormMachine(quickFormSchema, opts));
  const emitted: FormEmitted[] = [];
  for (const t of ["fieldHighlighted", "slideAdvanced", "validationFailed", "formCompleted"] as const) {
    actor.on(t, (e) => emitted.push(e as FormEmitted));
  }
  actor.start();
  return { actor, emitted };
}

function set(actor: ReturnType<typeof createActor>, key: string, value: string | string[]) {
  actor.send({ type: "SET_FIELD", key, value });
}

function fillStep1Leads(actor: ReturnType<typeof createActor>) {
  set(actor, "personName", "John");
  set(actor, "businessName", "Apex Plumbing");
  set(actor, "city", "Johannesburg");
  set(actor, "industry", "Healthcare");
  set(actor, "websiteExists", "Yes — it's live");
  set(actor, "revenueRange", "Under R50k/month");
  set(actor, "primaryIntent", "LEADS");
}

// ── tests ────────────────────────────────────────────────────────────────────

describe("blueprint form machine — lifecycle", () => {
  it("starts idle and enters filling on START, highlighting the first field", () => {
    const { actor, emitted } = startQuick();
    expect(actor.getSnapshot().value).toBe("idle");

    actor.send({ type: "START" });
    expect(actor.getSnapshot().value).toBe("filling");
    expect(actor.getSnapshot().context.stepIndex).toBe(0);

    const highlight = emitted.find((e) => e.type === "fieldHighlighted");
    expect(highlight).toMatchObject({ type: "fieldHighlighted", field: "personName", stepId: "business" });
  });
});

describe("blueprint form machine — progression & validation", () => {
  it("blocks NEXT on an invalid step and emits validationFailed", () => {
    const { actor, emitted } = startQuick();
    actor.send({ type: "START" });
    actor.send({ type: "NEXT" });

    expect(actor.getSnapshot().context.stepIndex).toBe(0); // did not advance
    const errs = actor.getSnapshot().context.errors;
    expect(errs.personName).toBeDefined();
    expect(errs.businessName).toBeDefined();
    expect(errs.primaryIntent).toBeDefined();
    expect(emitted.some((e) => e.type === "validationFailed")).toBe(true);
  });

  it("advances through the LEADS path and emits slideAdvanced + fieldHighlighted", () => {
    const { actor, emitted } = startQuick();
    actor.send({ type: "START" });
    fillStep1Leads(actor);
    actor.send({ type: "NEXT" });

    expect(actor.getSnapshot().context.stepIndex).toBe(1);
    const slide = emitted.find((e) => e.type === "slideAdvanced");
    expect(slide).toMatchObject({ type: "slideAdvanced", stepIndex: 1, stepId: "context", direction: "next" });
    // First visible field on the LEADS branch is enquiryVolume.
    const highlights = emitted.filter((e) => e.type === "fieldHighlighted");
    expect(highlights.at(-1)).toMatchObject({ field: "enquiryVolume", stepIndex: 1 });
  });

  it("step-2 required fields depend on the chosen intent (branch-aware validation)", () => {
    const { actor } = startQuick();
    actor.send({ type: "START" });
    // PRESENCE branch, no live site so currentWebsiteStatus is not required.
    set(actor, "personName", "Lebo");
    set(actor, "businessName", "Bright Dental");
    set(actor, "city", "Cape Town");
    set(actor, "industry", "Healthcare");
    set(actor, "websiteExists", "No — I need one built");
    set(actor, "revenueRange", "R50k – R150k/month");
    set(actor, "primaryIntent", "PRESENCE");
    actor.send({ type: "NEXT" });
    expect(actor.getSnapshot().context.stepIndex).toBe(1);

    // LEADS fields are irrelevant here; PRESENCE requires its own set.
    actor.send({ type: "NEXT" });
    expect(actor.getSnapshot().context.stepIndex).toBe(1); // still blocked
    const errs = actor.getSnapshot().context.errors;
    expect(errs.googleMapsStatus).toBeDefined();
    expect(errs.websiteGoal).toBeDefined();
    expect(errs.serveArea).toBeDefined();
    expect(errs.clientAcquisition).toBeDefined();
    expect(errs.currentWebsiteStatus).toBeUndefined(); // not a live site → not required
    expect(errs.enquiryVolume).toBeUndefined(); // wrong branch → never required

    set(actor, "googleMapsStatus", "No — I'm not on there");
    actor.send({ type: "TOGGLE_MULTI", key: "websiteGoal", value: "Call me directly" });
    set(actor, "serveArea", "Clients across South Africa");
    set(actor, "clientAcquisition", "Referrals / word of mouth");
    actor.send({ type: "NEXT" });
    expect(actor.getSnapshot().context.stepIndex).toBe(2);
  });

  it("PREV navigates back and emits slideAdvanced(prev)", () => {
    const { actor, emitted } = startQuick();
    actor.send({ type: "START" });
    fillStep1Leads(actor);
    actor.send({ type: "NEXT" });
    actor.send({ type: "PREV" });

    expect(actor.getSnapshot().context.stepIndex).toBe(0);
    expect(emitted.some((e) => e.type === "slideAdvanced" && e.direction === "prev")).toBe(true);
  });
});

describe("blueprint form machine — multi-select", () => {
  it("toggles array values and respects maxItems", () => {
    const { actor } = startQuick();
    actor.send({ type: "START" });
    set(actor, "primaryIntent", "AUTOMATION");
    // biggestTimeWaste has maxItems: 2.
    actor.send({ type: "TOGGLE_MULTI", key: "biggestTimeWaste", value: "Sending quotes manually", maxItems: 2 });
    actor.send({ type: "TOGGLE_MULTI", key: "biggestTimeWaste", value: "Onboarding new clients", maxItems: 2 });
    actor.send({ type: "TOGGLE_MULTI", key: "biggestTimeWaste", value: "Booking or confirming appointments", maxItems: 2 });

    const arr = actor.getSnapshot().context.data.biggestTimeWaste as string[];
    expect(arr).toHaveLength(2);
    expect(arr).not.toContain("Booking or confirming appointments");

    // toggling an existing value removes it
    actor.send({ type: "TOGGLE_MULTI", key: "biggestTimeWaste", value: "Sending quotes manually", maxItems: 2 });
    expect(actor.getSnapshot().context.data.biggestTimeWaste).toEqual(["Onboarding new clients"]);
  });
});

describe("blueprint form machine — submission", () => {
  function fillAllLeads(actor: ReturnType<typeof createActor>) {
    actor.send({ type: "START" });
    fillStep1Leads(actor);
    actor.send({ type: "NEXT" });
    set(actor, "enquiryVolume", "10 – 30");
    set(actor, "followUpMethod", "I have a CRM system");
    set(actor, "missedCallHandling", "Not sure");
    actor.send({ type: "NEXT" });
    set(actor, "email", "john@apexplumbing.co.za");
    set(actor, "whatsapp", "+27821234567");
    set(actor, "whatsappConsent", "true"); // POPIA consent is required to submit
  }

  it("validates, calls the injected submit, and reaches submitted with a clientId", async () => {
    const submit: SubmitFn = jest.fn(async () => ({ ok: true, clientId: "abc123" }));
    const { actor } = startQuick({ submit });
    fillAllLeads(actor);

    const completed: FormEmitted[] = [];
    actor.on("formCompleted", (e) => completed.push(e as FormEmitted));
    actor.send({ type: "SUBMIT" });

    await waitFor(actor, (s) => s.status === "done");
    expect(submit).toHaveBeenCalledTimes(1);
    const payload = (submit as jest.Mock).mock.calls[0][0];
    expect(payload).toMatchObject({
      clientName: "John",
      personName: "John",
      businessName: "Apex Plumbing",
      company: "Apex Plumbing",
      city: "Johannesburg",
      primaryIntent: "LEADS",
      email: "john@apexplumbing.co.za",
    });
    expect(actor.getSnapshot().context.result).toEqual({ clientId: "abc123" });
    expect(completed).toHaveLength(1);
  });

  it("returns to filling with submitError when submit fails", async () => {
    const submit: SubmitFn = jest.fn(async () => ({ ok: false, error: "boom" }));
    const { actor } = startQuick({ submit });
    fillAllLeads(actor);
    actor.send({ type: "SUBMIT" });

    await waitFor(actor, (s) => s.context.submitError !== null);
    expect(actor.getSnapshot().value).toBe("filling");
    expect(actor.getSnapshot().context.submitError).toBe("boom");
  });

  it("blocks SUBMIT and surfaces field errors when the last step is invalid", () => {
    const submit: SubmitFn = jest.fn(async () => ({ ok: true, clientId: "x" }));
    const { actor } = startQuick({ submit });
    actor.send({ type: "START" });
    fillStep1Leads(actor);
    actor.send({ type: "NEXT" });
    set(actor, "enquiryVolume", "10 – 30");
    set(actor, "followUpMethod", "I have a CRM system");
    set(actor, "missedCallHandling", "Not sure");
    actor.send({ type: "NEXT" });
    // leave email/whatsapp blank
    actor.send({ type: "SUBMIT" });

    expect(submit).not.toHaveBeenCalled();
    expect(actor.getSnapshot().value).toBe("filling");
    expect(actor.getSnapshot().context.errors.email).toBeDefined();
    expect(actor.getSnapshot().context.errors.whatsapp).toBeDefined();
  });
});

describe("blueprint form machine — serialization", () => {
  it("produces a JSON-serializable persisted snapshot (no closures in context)", () => {
    const { actor } = startQuick();
    actor.send({ type: "START" });
    fillStep1Leads(actor);

    const persisted = actor.getPersistedSnapshot();
    const round = JSON.parse(JSON.stringify(persisted));
    expect(round.context.data.personName).toBe("John");
    expect(round.context.data.businessName).toBe("Apex Plumbing");
    expect(round.context.data.primaryIntent).toBe("LEADS");
    expect(typeof round.context.stepIndex).toBe("number");

    // rehydrate from the serialized snapshot
    const revived = createActor(createFormMachine(quickFormSchema), { snapshot: round });
    revived.start();
    expect(revived.getSnapshot().context.data.personName).toBe("John");
  });
});

describe("detailed form schema — same engine, 4 fixed steps", () => {
  it("walks all four steps with the detailed schema", () => {
    const submit: SubmitFn = jest.fn(async () => ({ ok: true, clientId: "d1" }));
    const actor = createActor(createFormMachine(detailedFormSchema, { submit }));
    actor.start();
    actor.send({ type: "START" });
    // step 0: contact
    set(actor, "personName", "Ada");
    set(actor, "businessName", "Acme Co");
    set(actor, "email", "ops@acme.co.za");
    set(actor, "whatsapp", "+27110001111");
    actor.send({ type: "NEXT" });
    expect(actor.getSnapshot().context.stepIndex).toBe(1);
    // step 1: social (all optional)
    actor.send({ type: "NEXT" });
    expect(actor.getSnapshot().context.stepIndex).toBe(2);
    // step 2: business
    set(actor, "industry", "Technology");
    set(actor, "revenueRange", "R50k - R150k/month");
    actor.send({ type: "NEXT" });
    expect(actor.getSnapshot().context.stepIndex).toBe(3);
    // step 3: growth
    set(actor, "challenges", "Low conversion");
    set(actor, "currentMarketing", "Referrals / word of mouth");
    actor.send({ type: "SUBMIT" });
    expect(actor.getSnapshot().context.stepIndex).toBe(3);
  });
});
