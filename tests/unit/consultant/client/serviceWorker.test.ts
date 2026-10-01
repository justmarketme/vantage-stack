import path from "node:path";
import { performance } from "node:perf_hooks";

/* The SW is plain JS in /public; its pure helpers are exported under CommonJS. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sw = require(path.resolve(__dirname, "../../../../public/consultant-sw.js")) as {
  routeFor: (r: { method: string; url: string; mode?: string; headers?: { get(n: string): string | null }; origin: string }) => string;
  isCacheable: (res: { status: number; type: string; redirected: boolean; headers: { get(n: string): string | null } }, kind: string) => boolean;
  navCacheKey: (href: string) => string;
  extractStaticAssets: (html: string, origin: string) => string[];
  buildVersion: (href: string) => string;
  cacheNames: (v: string) => { shell: string; static: string };
};

const O = "https://vantagestack.co.za";
const h = (m: Record<string, string> = {}) => ({ get: (n: string) => m[n.toLowerCase()] ?? null });
const req = (url: string, extra: Partial<{ method: string; mode: string; headers: ReturnType<typeof h> }> = {}) => ({
  method: "GET",
  mode: "cors",
  headers: h(),
  origin: O,
  url: url.startsWith("http") ? url : O + url,
  ...extra,
});

describe("consultant service worker routing", () => {
  it("never caches the API, non-GETs, cross-origin, authorised or RSC requests", () => {
    expect(sw.routeFor(req("/api/consultant/leads"))).toBe("network");
    expect(sw.routeFor(req("/api/consultant/calls/1/live?after=3"))).toBe("network");
    expect(sw.routeFor(req("/consultant", { mode: "navigate", method: "POST" }))).toBe("network");
    expect(sw.routeFor(req("https://abc.supabase.co/storage/v1/object/x"))).toBe("network");
    expect(sw.routeFor(req("/_next/static/chunks/app.js", { headers: h({ authorization: "Bearer x" }) }))).toBe("network");
    expect(sw.routeFor(req("/consultant/pipeline?_rsc=abc"))).toBe("network");
    expect(sw.routeFor(req("/consultant/pipeline", { headers: h({ rsc: "1" }) }))).toBe("network");
    expect(sw.routeFor(req("/crm", { mode: "navigate" }))).toBe("network");
  });

  it("static chunks are cache-first; portal navigations network-first", () => {
    expect(sw.routeFor(req("/_next/static/chunks/app/consultant/page-abc123.js"))).toBe("static");
    expect(sw.routeFor(req("/_next/static/css/1a2b.css"))).toBe("static");
    expect(sw.routeFor(req("/consultant", { mode: "navigate" }))).toBe("navigate");
    expect(sw.routeFor(req("/consultant/leads/abc", { mode: "navigate" }))).toBe("navigate");
    expect(sw.routeFor(req("/consultant-other", { mode: "navigate" }))).toBe("network");
  });

  it("only caches clean same-origin 200s; page shells must be HTML", () => {
    const ok = { status: 200, type: "basic", redirected: false, headers: h({ "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" }) };
    expect(sw.isCacheable(ok, "navigate")).toBe(true);
    expect(sw.isCacheable({ ...ok, redirected: true }, "navigate")).toBe(false); // session expired → login
    expect(sw.isCacheable({ ...ok, status: 401 }, "navigate")).toBe(false);
    expect(sw.isCacheable({ ...ok, type: "opaque" }, "navigate")).toBe(false);
    expect(sw.isCacheable({ ...ok, headers: h({ "content-type": "application/json" }) }, "navigate")).toBe(false);
    expect(sw.isCacheable({ ...ok, headers: h({ "cache-control": "public, max-age=31536000, immutable" }) }, "static")).toBe(true);
    expect(sw.isCacheable({ ...ok, headers: h({ "cache-control": "no-store" }) }, "static")).toBe(false);
  });

  it("page cache keys drop query strings (they can hold ids / search text)", () => {
    expect(sw.navCacheKey(`${O}/consultant/pipeline?q=0825551234`)).toBe(`${O}/consultant/pipeline`);
    expect(sw.navCacheKey(`${O}/consultant/`)).toBe(`${O}/consultant`);
  });

  it("finds the shell's static assets to precache; versions caches by build id", () => {
    const html = `<script src="/_next/static/chunks/main-1.js"></script><link href="/_next/static/css/a.css" rel="stylesheet">
      <script>self.__next_f.push([1,"/_next/static/chunks/main-1.js"])</script><img src="/icons/x.png">`;
    expect(sw.extractStaticAssets(html, O)).toEqual([`${O}/_next/static/chunks/main-1.js`, `${O}/_next/static/css/a.css`]);
    expect(sw.buildVersion(`${O}/consultant-sw.js?v=abc123`)).toBe("abc123");
    expect(sw.buildVersion(`${O}/consultant-sw.js?v=<script>`)).toBe("0");
    expect(sw.cacheNames("abc123")).toEqual({ shell: "vs-consultant-shell-abc123", static: "vs-consultant-static-abc123" });
  });
});

describe("Coach Alex deck warm-up (offline-open budget)", () => {
  it("once the bundled deck is loaded from cache, compile + first match takes < 50ms", async () => {
    // Loading the modules = what the SW's cache-first static route serves offline.
    const { COACH_CARDS } = await import("../../../../lib/consultant/coach/cards");
    const { precompileDeck, rankMatches, normaliseUtterance } = await import("../../../../lib/consultant/coach/matcher");
    const t0 = performance.now();
    const deck = precompileDeck(COACH_CARDS);
    const hits = rankMatches(normaliseUtterance("honestly it's too expensive for us right now"), deck);
    const ms = performance.now() - t0;
    expect(hits.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(50);
  });
});
