import { NextResponse } from "next/server";
import { withApiMonitoring } from "../../../../lib/monitoring/api";
import { sendTelegramAlert } from "../../../../lib/scheduler-engine/telegram";

function env(name: string) {
  return (process.env[name] || "").trim();
}

async function fetchSentryIssuesLast24h() {
  const token = env("SENTRY_AUTH_TOKEN");
  const org = env("SENTRY_ORG");
  const project = env("SENTRY_PROJECT");
  if (!token || !org || !project) {
    return { ok: false as const, skipped: true as const, reason: "Missing SENTRY_AUTH_TOKEN/SENTRY_ORG/SENTRY_PROJECT" };
  }

  const since = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
  const url = `https://sentry.io/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/?since=${since}&statsPeriod=24h&query=${encodeURIComponent(
    "is:unresolved"
  )}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return { ok: false as const, error: `Sentry API ${res.status}: ${text.slice(0, 300)}` };
  const issues = JSON.parse(text) as Array<any>;
  return { ok: true as const, issues };
}

async function fetchSentryIssuesByQueryLast24h(query: string) {
  const token = env("SENTRY_AUTH_TOKEN");
  const org = env("SENTRY_ORG");
  const project = env("SENTRY_PROJECT");
  if (!token || !org || !project) {
    return { ok: false as const, skipped: true as const, reason: "Missing SENTRY_AUTH_TOKEN/SENTRY_ORG/SENTRY_PROJECT" };
  }

  const since = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
  const url = `https://sentry.io/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/?since=${since}&statsPeriod=24h&query=${encodeURIComponent(
    query
  )}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return { ok: false as const, error: `Sentry API ${res.status}: ${text.slice(0, 300)}` };
  const issues = JSON.parse(text) as Array<any>;
  return { ok: true as const, issues };
}

function summarizeIssues(issues: any[]) {
  const top = issues
    .slice()
    .sort((a, b) => Number(b?.count ?? 0) - Number(a?.count ?? 0))
    .slice(0, 10);

  const lines = top.map((i) => {
    const title = String(i?.title ?? "Unknown").slice(0, 120);
    const count = Number(i?.count ?? 0);
    const level = String(i?.level ?? "error");
    return `- (${level}) ${title} — ${count}`;
  });

  return { total: issues.length, lines };
}

async function handler() {
  const categories = [
    { key: "database", label: "Database errors", query: "is:unresolved tags.failure_type:database" },
    { key: "third_party", label: "Third-party API failures", query: "is:unresolved tags.failure_type:third_party" },
    { key: "auth_error", label: "Auth errors", query: "is:unresolved tags.failure_type:auth_error" },
    { key: "cron_failure", label: "Cron failures", query: "is:unresolved tags.failure_type:cron_failure" },
    { key: "unhandled_exception", label: "Unhandled exceptions", query: "is:unresolved tags.failure_type:unhandled_exception" },
  ] as const;

  const sections: string[] = ["Daily error digest (last 24h)", ""];

  let totalUnresolved = 0;
  for (const c of categories) {
    const out = await fetchSentryIssuesByQueryLast24h(c.query);
    if (!out.ok) {
      sections.push(`${c.label}: unavailable (${out.error ?? out.reason ?? "unknown"})`);
      sections.push("");
      continue;
    }

    const summary = summarizeIssues(out.issues);
    totalUnresolved += summary.total;
    sections.push(`${c.label} — ${summary.total}`);
    sections.push(...summary.lines.map((l: string) => `  ${l}`));
    sections.push("");
  }

  const body = sections.join("\n").trim();
  await sendTelegramAlert({ text: body }).catch(() => {});

  return NextResponse.json({ ok: true, sent: true, unresolved_total: totalUnresolved }, { status: 200 });
}

export const GET = withApiMonitoring({ route: "/api/cron/error-digest", method: "GET", handler });

