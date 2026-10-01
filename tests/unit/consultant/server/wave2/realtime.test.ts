import { nudge, nudgeTopicName } from "../../../../../lib/consultant/server/realtime";

describe("realtime nudge", () => {
  const OLD = { ...process.env };
  afterEach(() => {
    process.env = { ...OLD };
  });

  it("posts an EMPTY payload to the broadcast endpoint with the service-role key", async () => {
    process.env.SUPABASE_URL = "https://abc.supabase.co/";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "srk";
    const calls: { url: string; init: RequestInit }[] = [];
    jest.spyOn(global, "fetch").mockImplementation((async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status: 202 });
    }) as unknown as typeof fetch);
    await nudge({ callId: "c1" });
    expect(calls[0].url).toBe("https://abc.supabase.co/realtime/v1/api/broadcast");
    expect((calls[0].init.headers as Record<string, string>).apikey).toBe("srk");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      messages: [{ topic: "vs-consultant:call:c1", event: "nudge", payload: {}, private: false }],
    });
  });

  it("never throws and is a no-op when unconfigured", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const spy = jest.spyOn(global, "fetch");
    await expect(nudge("leaderboard")).resolves.toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
    process.env.SUPABASE_URL = "https://abc.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "srk";
    spy.mockRejectedValue(new Error("down"));
    await expect(nudge("leaderboard")).resolves.toBeUndefined();
  });

  it("topic names", () => {
    expect(nudgeTopicName("leaderboard", "p")).toBe("p:leaderboard");
    expect(nudgeTopicName({ callId: "x" }, "p")).toBe("p:call:x");
  });
});
