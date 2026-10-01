import { buildWorkflows } from "../../../../../scripts/emma-n8n-export";
import { EMMA_SEQUENCES } from "../../../../../ai-configs/emma/sequences";
import { signBody, verifyBody } from "../../../../../lib/consultant/auth/signing";
import { N8nIngress } from "../../../../../lib/consultant/types";

/**
 * Runs the JavaScript that the generated n8n Code nodes contain, inside a tiny stand-in for
 * n8n's Code-node runtime ($env, $input, $json, this.helpers), and checks it against the
 * app's REAL signing + contract — so n8n and the app can never disagree on the wire format.
 */
const SECRET = "test-n8n-secret";

type Item = { json: Record<string, unknown> };
async function runCode(code: string, ctx: { input?: Item[]; json?: Record<string, unknown>; raw?: string }): Promise<Item[]> {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const fn = new AsyncFunction("require", "$env", "$input", "$json", code);
  const self = { helpers: { getBinaryDataBuffer: async () => Buffer.from(ctx.raw ?? "", "utf8") } };
  return fn.call(self, require, { N8N_SIGNING_SECRET: SECRET }, { first: () => ctx.input![0], all: () => ctx.input! }, ctx.json);
}

const wf = buildWorkflows();
const seq = wf["vantage-emma-sequences.workflow.json"];
const codeOf = (w: typeof seq, name: string) => (w.nodes.find((n) => n.name === name)!.parameters as { jsCode: string }).jsCode;

function event(type: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    id: "6f1c1b7e-2a3d-4c5e-8f90-1a2b3c4d5e6f",
    type,
    occurredAt: new Date().toISOString(),
    vertical: "clinics",
    lead: { id: "11111111-2222-4333-8444-555555555555", clinicName: "Lumière Aesthetics", stage: "discovery_booked", previousStage: "contacted" },
    consultant: { id: "99999999-8888-4777-8666-555555555555", name: "Thandi" },
    data,
    ...extra,
  };
}

describe("generated n8n workflows", () => {
  it("embed exactly the app's sequences", () => {
    expect(codeOf(seq, "Verify + plan steps")).toContain(JSON.stringify(EMMA_SEQUENCES));
  });

  it("reject an event whose signature doesn't verify", async () => {
    const raw = JSON.stringify(event("meeting.no_show", {}));
    await expect(runCode(codeOf(seq, "Verify + plan steps"), { input: [{ json: { headers: { "x-vs-signature": signBody("wrong", raw) } } }], raw })).rejects.toThrow(/Invalid X-VS-Signature/);
  });

  it("plan a no-show re-engagement: 2 steps, in time order, each a valid signed emma.send with stop conditions", async () => {
    const ev = event("meeting.no_show", { meetingId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", kind: "discovery" });
    const raw = JSON.stringify(ev);
    const steps = await runCode(codeOf(seq, "Verify + plan steps"), { input: [{ json: { headers: { "x-vs-signature": signBody(SECRET, raw) } } }], raw });
    expect(steps.map((s) => s.json.step)).toEqual(["reengage_2h", "second_touch_next_day"]);
    expect(Date.parse(steps[0].json.resumeAt as string)).toBeLessThan(Date.parse(steps[1].json.resumeAt as string));

    for (const s of steps) {
      const [signed] = await runCode(codeOf(seq, "Sign request"), { json: s.json });
      const body = signed.json.body as string;
      expect(verifyBody(SECRET, body, signed.json.signature as string, 300)).toBe(true);
      const parsed = N8nIngress.parse(JSON.parse(body));
      expect(parsed.action).toBe("emma.send");
      if (parsed.action === "emma.send") {
        expect(parsed.sinceEventId).toBe(ev.id);
        expect(parsed.stopIf).toContain("lead_replied");
        expect(parsed.idempotencyKey).toBe(`${ev.id}:no_show_reengagement:${s.json.step}`);
      }
    }
  });

  it("format reminder times in SAST and drop reminders that are already past", async () => {
    const startsAt = new Date(Date.now() + 3 * 3600_000).toISOString(); // 3h ahead: the 24h reminder is past
    const ev = event("meeting.scheduled", { kind: "discovery", startsAt, meetingId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" });
    const raw = JSON.stringify(ev);
    const steps = await runCode(codeOf(seq, "Verify + plan steps"), { input: [{ json: { headers: { "x-vs-signature": signBody(SECRET, raw) } } }], raw });
    expect(steps.map((s) => s.json.step)).toEqual(["reminder_1h"]);
    const expected = new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(startsAt));
    expect((steps[0].json.payload as { variables: Record<string, string> }).variables.meetingTime).toBe(expected);
  });

  it("send consultant alerts with notify_consultant, and format money as R12 500", async () => {
    const claimed = event("lead.claimed", {});
    let raw = JSON.stringify(claimed);
    const [alert] = await runCode(codeOf(seq, "Verify + plan steps"), { input: [{ json: { headers: { "x-vs-signature": signBody(SECRET, raw) } } }], raw });
    expect((alert.json.payload as { action: string }).action).toBe("emma.notify_consultant");
    expect(N8nIngress.safeParse(alert.json.payload).success).toBe(true);

    const paid = event("deal.paid", { amount: 12500, commission: 3125 });
    raw = JSON.stringify(paid);
    const [thanks] = await runCode(codeOf(seq, "Verify + plan steps"), { input: [{ json: { headers: { "x-vs-signature": signBody(SECRET, raw) } } }], raw });
    expect((thanks.json.payload as { variables: Record<string, string> }).variables.amount).toBe("R12 500");
  });

  it("only start sequences whose `when` matches (a demo held starts post-demo; a discovery held does not)", async () => {
    for (const [kind, expected] of [["demo", 1], ["discovery", 0]] as const) {
      const raw = JSON.stringify(event("meeting.held", { kind }));
      const steps = await runCode(codeOf(seq, "Verify + plan steps"), { input: [{ json: { headers: { "x-vs-signature": signBody(SECRET, raw) } } }], raw });
      expect(steps).toHaveLength(expected);
    }
  });

  it("map Serper results to a valid, signed leads.import", async () => {
    const pros = wf["vantage-lead-prospecting-serper.workflow.json"];
    const out = await runCode(codeOf(pros, "Map to Clinics import + sign"), {
      input: [{ json: { searchParameters: { q: "aesthetic clinic Cape Town" }, places: [
        { title: "Glow Skin Clinic", phoneNumber: "021 555 0123", address: "Kloof St, Cape Town", website: "https://glow.example", placeId: "ChIJ123" },
        { title: "No Phone Spa" },
      ] } }],
    });
    expect(out).toHaveLength(1);
    expect(verifyBody(SECRET, out[0].json.body as string, out[0].json.signature as string, 300)).toBe(true);
    const parsed = N8nIngress.parse(JSON.parse(out[0].json.body as string));
    expect(parsed.action).toBe("leads.import");
    if (parsed.action === "leads.import") {
      expect(parsed.batch.provider).toBe("serper");
      expect(parsed.batch.leads).toHaveLength(1);
      expect(parsed.batch.leads[0].sourceUrl).toContain("ChIJ123");
    }
  });
});
