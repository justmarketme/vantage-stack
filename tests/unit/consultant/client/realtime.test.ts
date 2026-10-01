import {
  DEFAULT_REALTIME_PREFIX,
  NudgeHub,
  coalesce,
  realtimeConfig,
  topicName,
  type RealtimeChannelLike,
  type RealtimeClientLike,
  type RealtimeStatus,
} from "../../../../lib/consultant/client/realtime";
import { liveBackstopMs } from "../../../../lib/consultant/client/live";

/** A fake supabase realtime client: tests drive channel status + broadcasts by hand. */
function fakeClient() {
  const channels = new Map<string, { status?: (s: string) => void; broadcast?: (p: unknown) => void; filter?: { event: string } }>();
  const removed: string[] = [];
  const client: RealtimeClientLike = {
    channel(name) {
      const rec: { status?: (s: string) => void; broadcast?: (p: unknown) => void; filter?: { event: string } } = {};
      channels.set(name, rec);
      const ch: RealtimeChannelLike & { name: string } = {
        name,
        on(_t, filter, cb) {
          rec.filter = filter;
          rec.broadcast = cb;
          return ch;
        },
        subscribe(cb) {
          rec.status = (s) => cb?.(s);
          return ch;
        },
      };
      return ch;
    },
    removeChannel(ch) {
      removed.push((ch as unknown as { name: string }).name);
      return Promise.resolve("ok");
    },
  };
  return { client, channels, removed };
}

const flush = () => new Promise((r) => setImmediate(r));

describe("realtime topics + config", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it("builds topic names with the public prefix (default vs-consultant)", () => {
    delete process.env.NEXT_PUBLIC_CONSULTANT_REALTIME_PREFIX;
    expect(topicName("leaderboard")).toBe(`${DEFAULT_REALTIME_PREFIX}:leaderboard`);
    expect(topicName({ callId: "c1" })).toBe("vs-consultant:call:c1");
    process.env.NEXT_PUBLIC_CONSULTANT_REALTIME_PREFIX = "vs-staging";
    expect(topicName({ callId: "c1" })).toBe("vs-staging:call:c1");
  });

  it("config is null (→ polling) unless URL + anon key are set", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(realtimeConfig()).toBeNull();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    expect(realtimeConfig()).toBeNull();
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    expect(realtimeConfig()).toMatchObject({ url: "https://abc.supabase.co", anonKey: "anon", prefix: "vs-consultant" });
  });

  it("live transcript polling slows to a backstop only while nudges are live", () => {
    expect(liveBackstopMs(1000)).toBe(5000);
    expect(liveBackstopMs(2000)).toBe(10000);
    expect(liveBackstopMs(1000, 3000)).toBe(3000);
    expect(liveBackstopMs(1000, 200)).toBe(1000);
  });
});

describe("NudgeHub", () => {
  it("nudges every listener on a broadcast (payload ignored) and reports live", async () => {
    const f = fakeClient();
    const hub = new NudgeHub(async () => f.client);
    const a = jest.fn();
    const b = jest.fn();
    const statuses: RealtimeStatus[] = [];
    hub.subscribe("vs-consultant:call:c1", { onNudge: a, onStatus: (s) => statuses.push(s) });
    hub.subscribe("vs-consultant:call:c1", { onNudge: b });
    await flush();
    expect(f.channels.size).toBe(1); // one channel per topic, shared
    const ch = f.channels.get("vs-consultant:call:c1")!;
    expect(ch.filter).toEqual({ event: "*" });
    ch.status!("SUBSCRIBED");
    expect(statuses).toEqual(["connecting", "live"]);
    ch.broadcast!({ payload: { transcript: "must be ignored" } });
    expect(a).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith(); // nothing from the payload reaches the app
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("missing env / failed import → unavailable (callers keep polling)", async () => {
    const hub = new NudgeHub(async () => null);
    const statuses: RealtimeStatus[] = [];
    hub.subscribe("t", { onNudge: jest.fn(), onStatus: (s) => statuses.push(s) });
    await flush();
    expect(statuses).toEqual(["connecting", "unavailable"]);

    const broken = new NudgeHub(() => Promise.reject(new Error("chunk load failed")));
    const s2: RealtimeStatus[] = [];
    broken.subscribe("t", { onNudge: jest.fn(), onStatus: (s) => s2.push(s) });
    await flush();
    expect(s2).toEqual(["connecting", "unavailable"]);
  });

  it("channel error → unavailable; recovery → live + one catch-up nudge", async () => {
    const f = fakeClient();
    const hub = new NudgeHub(async () => f.client);
    const nudge = jest.fn();
    const statuses: RealtimeStatus[] = [];
    hub.subscribe("t", { onNudge: nudge, onStatus: (s) => statuses.push(s) });
    await flush();
    const ch = f.channels.get("t")!;
    ch.status!("SUBSCRIBED");
    ch.status!("CHANNEL_ERROR");
    expect(nudge).not.toHaveBeenCalled();
    ch.status!("SUBSCRIBED");
    expect(statuses).toEqual(["connecting", "live", "unavailable", "live"]);
    expect(nudge).toHaveBeenCalledTimes(1);
  });

  it("no SUBSCRIBED within the timeout → unavailable", async () => {
    jest.useFakeTimers();
    try {
      const f = fakeClient();
      const hub = new NudgeHub(async () => f.client, 1000);
      const statuses: RealtimeStatus[] = [];
      hub.subscribe("t", { onNudge: jest.fn(), onStatus: (s) => statuses.push(s) });
      await Promise.resolve();
      jest.advanceTimersByTime(1000);
      expect(statuses).toEqual(["connecting", "unavailable"]);
    } finally {
      jest.useRealTimers();
    }
  });

  it("removes the channel when the last listener leaves; a throwing listener can't starve others", async () => {
    const f = fakeClient();
    const hub = new NudgeHub(async () => f.client);
    const good = jest.fn();
    const off1 = hub.subscribe("t", {
      onNudge: () => {
        throw new Error("bug");
      },
    });
    const off2 = hub.subscribe("t", { onNudge: good });
    await flush();
    f.channels.get("t")!.broadcast!({});
    expect(good).toHaveBeenCalledTimes(1);
    off1();
    expect(f.removed).toEqual([]);
    off2();
    await flush();
    expect(f.removed).toEqual(["t"]);
    // Late broadcasts after unsubscribe are dropped.
    f.channels.get("t")!.broadcast!({});
    expect(good).toHaveBeenCalledTimes(1);
  });
});

describe("coalesce", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("collapses a burst into one call, but never waits longer than maxWait", () => {
    const fn = jest.fn();
    const c = coalesce(fn, 300, 1000);
    c();
    c();
    jest.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    // A continuous stream every 200ms still fires within maxWait.
    for (let i = 0; i < 6; i++) {
      c();
      jest.advanceTimersByTime(200);
    }
    expect(fn).toHaveBeenCalledTimes(2);
    c.cancel();
  });
});
