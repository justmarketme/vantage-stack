import {
  consultantApiHeaders,
  consultantContentSecurityPolicy,
  consultantPageHeaders,
  consultantSupabaseUrls,
  isCrossOriginWrite,
  supabaseCspSources,
} from "../../../../lib/consultant/auth/securityHeaders";

function directives(csp: string): Record<string, string[]> {
  return Object.fromEntries(
    csp.split(";").map((d) => {
      const [name, ...values] = d.trim().split(/\s+/);
      return [name, values];
    }),
  );
}

describe("consultant CSP", () => {
  const prod = directives(consultantContentSecurityPolicy(false));

  it("lets the Twilio Voice SDK signal and fetch sounds", () => {
    expect(prod["connect-src"]).toEqual(expect.arrayContaining(["'self'", "wss://*.twilio.com", "https://*.twilio.com"]));
    expect(prod["media-src"]).toEqual(expect.arrayContaining(["'self'", "blob:", "https://sdk.twilio.com"]));
  });

  it("locks down framing, plugins, base and forms", () => {
    expect(prod["frame-ancestors"]).toEqual(["'none'"]);
    expect(prod["object-src"]).toEqual(["'none'"]);
    expect(prod["base-uri"]).toEqual(["'self'"]);
    expect(prod["form-action"]).toEqual(["'self'"]);
    expect(prod["upgrade-insecure-requests"]).toBeDefined();
  });

  it("allows eval and ws: only in development", () => {
    expect(prod["script-src"]).not.toContain("'unsafe-eval'");
    expect(prod["connect-src"]).not.toContain("ws:");
    const dev = directives(consultantContentSecurityPolicy(true));
    expect(dev["script-src"]).toContain("'unsafe-eval'");
    expect(dev["upgrade-insecure-requests"]).toBeUndefined();
  });

  it("page headers grant the microphone to this origin only", () => {
    const h = consultantPageHeaders({ isDev: false, isProd: true });
    expect(h["Permissions-Policy"]).toContain("microphone=(self)");
    expect(h["Permissions-Policy"]).toContain("camera=()");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Strict-Transport-Security"]).toBeDefined();
    expect(h["Cache-Control"]).toContain("no-store");
  });

  it("api headers are no-store and carry no CSP", () => {
    const h = consultantApiHeaders({ isProd: false });
    expect(h["Cache-Control"]).toContain("no-store");
    expect(h["Content-Security-Policy"]).toBeUndefined();
    expect(h["Strict-Transport-Security"]).toBeUndefined();
  });
});

describe("consultant CSP · Supabase (wave 2)", () => {
  const REF = "https://tinkmipmxunwvyemhalu.supabase.co";

  it("pins connect/img/media to the configured project host only", () => {
    const d = directives(consultantContentSecurityPolicy(false, [REF, `${REF}/`]));
    expect(d["connect-src"]).toEqual(
      expect.arrayContaining(["https://tinkmipmxunwvyemhalu.supabase.co", "wss://tinkmipmxunwvyemhalu.supabase.co"]),
    );
    expect(d["img-src"]).toContain("https://tinkmipmxunwvyemhalu.supabase.co");
    expect(d["media-src"]).toContain("https://tinkmipmxunwvyemhalu.supabase.co");
    expect(d["img-src"]).not.toContain("wss://tinkmipmxunwvyemhalu.supabase.co");
    const all = Object.values(d).flat();
    expect(all.filter((s) => s.includes("supabase.co") && s.includes("*"))).toEqual([]);
    // Deduped: the trailing-slash duplicate adds nothing.
    expect(d["connect-src"].filter((s) => s === "https://tinkmipmxunwvyemhalu.supabase.co")).toHaveLength(1);
  });

  it("keeps Twilio, and the service worker is allowed from 'self'", () => {
    const d = directives(consultantContentSecurityPolicy(false, [REF]));
    expect(d["connect-src"]).toEqual(expect.arrayContaining(["wss://*.twilio.com", "https://*.twilio.com"]));
    expect(d["worker-src"]).toContain("'self'");
  });

  it("drops unset / invalid / plain-http URLs (http only in dev)", () => {
    expect(supabaseCspSources(["", "not a url", "http://127.0.0.1:54321"])).toEqual({ http: [], ws: [] });
    expect(supabaseCspSources(["http://127.0.0.1:54321"], true)).toEqual({
      http: ["http://127.0.0.1:54321"],
      ws: ["ws://127.0.0.1:54321"],
    });
    const d = directives(consultantContentSecurityPolicy(false, []));
    expect(d["connect-src"].some((s) => s.includes("supabase"))).toBe(false);
  });

  it("reads the hosts from config (public + server URL)", () => {
    const saved = { ...process.env };
    process.env.NEXT_PUBLIC_SUPABASE_URL = REF;
    process.env.SUPABASE_URL = "https://otherref.supabase.co";
    try {
      expect(consultantSupabaseUrls()).toEqual([REF, "https://otherref.supabase.co"]);
      const h = consultantPageHeaders({ isDev: false, isProd: true, supabaseUrls: consultantSupabaseUrls() });
      expect(h["Content-Security-Policy"]).toContain("wss://otherref.supabase.co");
    } finally {
      process.env = saved;
    }
  });
});

describe("isCrossOriginWrite", () => {
  const host = "www.vantagestack.co.za";
  it("ignores safe methods and requests without Origin", () => {
    expect(isCrossOriginWrite("GET", "https://evil.example", host)).toBe(false);
    expect(isCrossOriginWrite("POST", null, host)).toBe(false);
  });
  it("never blocks a GET — e.g. the calendar OAuth callback navigating back from Google", () => {
    expect(isCrossOriginWrite("GET", "https://accounts.google.com", host)).toBe(false);
  });
  it("allows same-origin writes", () => {
    expect(isCrossOriginWrite("POST", `https://${host}`, host)).toBe(false);
    expect(isCrossOriginWrite("patch", `https://${host.toUpperCase()}`, host)).toBe(false);
  });
  it("blocks cross-origin (incl. sibling subdomain) and opaque origins", () => {
    expect(isCrossOriginWrite("POST", "https://clinics.vantagestack.co.za", host)).toBe(true);
    expect(isCrossOriginWrite("DELETE", "https://evil.example", host)).toBe(true);
    expect(isCrossOriginWrite("POST", "null", host)).toBe(true);
    expect(isCrossOriginWrite("POST", "not a url", host)).toBe(true);
  });
});
