import { NextResponse } from "next/server";
import { withApiMonitoring } from "../../../../lib/monitoring/api";
import { setThirdPartyStatus } from "../../../../lib/monitoring/metrics";
import { sendTelegramAlert } from "../../../../lib/scheduler-engine/telegram";
import * as Sentry from "@sentry/nextjs";

function env(name: string) {
  return (process.env[name] || "").trim();
}

async function checkJson(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers, cache: "no-store" });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text: text.slice(0, 400) };
}

async function checkThirdParty(service: string) {
  // These checks intentionally prefer "cheap" endpoints. If you have a gateway, set *_BASE_URL to that.
  // If a key/base is missing, we mark as unknown (not failing) to avoid false alerts in dev.
  const sampleDomain = "example.com";

  if (service === "Tranco") {
    const url = `https://tranco-list.eu/api/ranks/domain/${encodeURIComponent(sampleDomain)}`;
    const out = await checkJson(url, {});
    return out.ok ? { status: "green" as const, details: `ok ${out.status}` } : { status: "red" as const, details: `http ${out.status}: ${out.text}` };
  }

  if (service === "OpenPageRank") {
    const key = env("OPENPAGERANK_API_KEY");
    if (!key) return { status: "unknown" as const, details: "missing OPENPAGERANK_API_KEY" };
    const u = new URL("https://openpagerank.com/api/v1.0/getPageRank");
    u.searchParams.append("domains[]", sampleDomain);
    const out = await checkJson(u.toString(), { "API-OPR": key });
    return out.ok ? { status: "green" as const, details: `ok ${out.status}` } : { status: "red" as const, details: `http ${out.status}: ${out.text}` };
  }

  if (service === "Whois") {
    const key = env("WHOIS_API_KEY");
    if (!key) return { status: "unknown" as const, details: "missing WHOIS_API_KEY" };

    // Option A: when WHOIS_BASE_URL is unset, call WhoisJSON directly (no /lookup gateway).
    const base = env("WHOIS_BASE_URL");
    if (!base) {
      const url = "https://whoisjson.com/api/v1/whois?domain=example.com";
      const out = await checkJson(url, { Authorization: `TOKEN=${key}` });
      return out.ok ? { status: "green" as const, details: `ok ${out.status}` } : { status: "red" as const, details: `http ${out.status}: ${out.text}` };
    }

    // Legacy gateway mode: {WHOIS_BASE_URL}/health + Bearer auth.
    const out = await checkJson(`${base.replace(/\/+$/, "")}/health`, { Authorization: `Bearer ${key}` });
    return out.ok ? { status: "green" as const, details: `ok ${out.status}` } : { status: "red" as const, details: `http ${out.status}: ${out.text}` };
  }

  if (service === "ElevenLabs") {
    const key = env("ELEVEN_LABS_API_KEY") || env("ELEVENLABS_API_KEY");
    if (!key) return { status: "unknown" as const, details: "missing ELEVEN_LABS_API_KEY" };
    const out = await checkJson(`https://api.elevenlabs.io/v1/user`, { "xi-api-key": key });
    return out.ok ? { status: "green" as const, details: "ok" } : { status: "red" as const, details: `http ${out.status}: ${out.text}` };
  }

  if (service === "Resend") {
    const key = env("RESEND_API_KEY");
    if (!key) return { status: "unknown" as const, details: "missing RESEND_API_KEY" };
    const out = await checkJson(`https://api.resend.com/domains`, { Authorization: `Bearer ${key}` });
    return out.ok ? { status: "green" as const, details: "ok" } : { status: "red" as const, details: `http ${out.status}: ${out.text}` };
  }

  if (service === "Twilio") {
    const sid = env("TWILIO_ACCOUNT_SID");
    const token = env("TWILIO_AUTH_TOKEN");
    if (!sid || !token) return { status: "unknown" as const, details: "missing TWILIO_ACCOUNT_SID/AUTH_TOKEN" };
    const basic = Buffer.from(`${sid}:${token}`).toString("base64");
    const out = await checkJson(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}.json`, {
      Authorization: `Basic ${basic}`,
    });
    return out.ok ? { status: "green" as const, details: "ok" } : { status: "red" as const, details: `http ${out.status}: ${out.text}` };
  }

  return { status: "unknown" as const, details: "unrecognized service" };
}

async function handler() {
  const services = ["Tranco", "OpenPageRank", "Whois", "ElevenLabs", "Resend", "Twilio"] as const;
  const results: Record<string, any> = {};

  for (const s of services) {
    let out: any;
    try {
      out = await checkThirdParty(s);
    } catch (e: any) {
      Sentry.captureException(e, { tags: { surface: "third_party", failure_type: "third_party", service: s } });
      out = { status: "red", details: `exception: ${String(e?.message ?? e)}`, consecutive_failures: 1 };
    }
    results[s] = out;
    const snap = await setThirdPartyStatus(s, { status: out.status, details: out.details });
    const failures = snap.checks.third_party?.[s]?.consecutive_failures ?? 0;
    if (out.status === "red" && failures >= 3) {
      Sentry.captureMessage(`Third-party API failing: ${s} (${failures}x)`, {
        level: "error",
        tags: { surface: "third_party", failure_type: "third_party", service: s },
      });
      await sendTelegramAlert({ text: `🚩 Third‑party API failing: ${s} (${failures}x) — ${out.details}` }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true, results }, { status: 200 });
}

export const GET = withApiMonitoring({ route: "/api/cron/third-party-health", method: "GET", handler });

