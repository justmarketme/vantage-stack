import { verifyBody } from "../../../../../lib/consultant/auth/signing";
import { afterFailure, backoffSec } from "../../../../../lib/consultant/server/events/backoff";
import { mapLimit, postSigned, resolveTargets } from "../../../../../lib/consultant/server/events/dispatch";

describe("delivery backoff + dead-lettering", () => {
  const policy = { maxAttempts: 8, retryBaseSec: 15, retryMaxSec: 3600 };

  it("doubles from the base and caps", () => {
    expect([1, 2, 3, 4, 5].map((n) => backoffSec(n, 15, 3600))).toEqual([15, 30, 60, 120, 240]);
    expect(backoffSec(20, 15, 3600)).toBe(3600);
    expect(backoffSec(10_000, 15, 3600)).toBe(3600); // no Infinity
    expect(backoffSec(0, 15, 3600)).toBe(15);
  });

  it("dead exactly at maxAttempts, retry before", () => {
    expect(afterFailure(7, policy)).toEqual({ status: "retry", delaySec: 960 });
    expect(afterFailure(8, policy)).toEqual({ status: "dead" });
    expect(afterFailure(9, policy)).toEqual({ status: "dead" });
    expect(afterFailure(1, { ...policy, maxAttempts: 1 })).toEqual({ status: "dead" });
  });
});

describe("targets", () => {
  it("unconfigured targets are skipped with a reason, not claimed", () => {
    const r = resolveTargets({
      n8n: { eventsUrl: "https://n8n.example/webhook/vs", signingSecret: "s1", toleranceSec: 300 },
      emmaOwner: { eventsUrl: "", signingSecret: "" },
    });
    expect(r.ready.map((t) => t.target)).toEqual(["n8n"]);
    expect(r.skipped).toEqual({ emma_owner: "url_not_configured" });
    const noSecret = resolveTargets({ n8n: { eventsUrl: "https://x", signingSecret: "", toleranceSec: 300 }, emmaOwner: { eventsUrl: "", signingSecret: "" } });
    expect(noSecret.skipped.n8n).toBe("secret_not_configured");
  });
});

describe("postSigned", () => {
  const body = JSON.stringify({ id: "e1", type: "deal.paid" });

  it("signs the exact raw body with X-VS-Signature (receiver can verify)", async () => {
    let seen: { headers: Record<string, string>; body: string } | null = null;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      seen = { headers: init.headers as Record<string, string>, body: init.body as string };
      return new Response(null, { status: 202 });
    }) as unknown as typeof fetch;
    const r = await postSigned("https://n8n.example/hook", "topsecret", body, { "X-VS-Event-Id": "e1" }, fetchImpl);
    expect(r).toEqual({ ok: true });
    expect(seen!.body).toBe(body);
    expect(verifyBody("topsecret", body, seen!.headers["X-VS-Signature"], 300)).toBe(true);
    expect(verifyBody("wrong", body, seen!.headers["X-VS-Signature"], 300)).toBe(false);
    expect(seen!.headers["X-VS-Event-Id"]).toBe("e1");
  });

  it("non-2xx, network errors and timeouts become generic codes", async () => {
    const status = (s: number) => (async () => new Response("secret upstream text", { status: s })) as unknown as typeof fetch;
    expect(await postSigned("https://x", "s", body, {}, status(500))).toEqual({ ok: false, error: "http_500" });
    expect(await postSigned("https://x", "s", body, {}, status(301))).toEqual({ ok: false, error: "http_301" });
    const boom = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await postSigned("https://x", "s", body, {}, boom)).toEqual({ ok: false, error: "network" });
    const hang = ((_u: string, init: RequestInit) =>
      new Promise((_r, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason)))) as unknown as typeof fetch;
    expect(await postSigned("https://x", "s", body, {}, hang, 20)).toEqual({ ok: false, error: "timeout" });
  });
});

describe("mapLimit", () => {
  it("processes every item with bounded concurrency", async () => {
    let inFlight = 0;
    let peak = 0;
    const done: number[] = [];
    await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      done.push(n);
      inFlight--;
    });
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBeLessThanOrEqual(3);
  });
});
