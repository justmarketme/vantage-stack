import * as Sentry from "@sentry/nextjs";
import { recordApiMetric, getMonitoringSnapshot } from "./metrics";
import { sendTelegramAlert } from "../scheduler-engine/telegram";

function safeRouteName(input: string) {
  return input.replace(/\s+/g, " ").trim().slice(0, 140);
}

/** Alert if error rate in the last 15 minutes exceeds 20% (minimum 5 data points). */
async function checkErrorRateSpike(route: string, method: string) {
  try {
    const snap = await getMonitoringSnapshot();
    const windowMs = 15 * 60 * 1000;
    const recent = (snap.api.points ?? []).filter(
      (p) =>
        p.route === route &&
        p.method === method &&
        Date.now() - new Date(p.ts).getTime() < windowMs,
    );
    if (recent.length < 5) return; // not enough data
    const errRate = recent.filter((p) => !p.ok).length / recent.length;
    if (errRate >= 0.2) {
      await sendTelegramAlert({
        text: `🚨 Error rate spike: ${method} ${route}\n${Math.round(errRate * 100)}% errors in last 15 min (${recent.length} requests)`,
      }).catch(() => {});
    }
  } catch {
    // never throw from monitoring — it must not break the actual handler
  }
}

export function withApiMonitoring<T extends (...args: any[]) => Promise<Response>>(params: {
  route: string;
  method: string;
  handler: T;
}) {
  const route = safeRouteName(params.route);
  const method = safeRouteName(params.method.toUpperCase());
  const isCron = route.startsWith("/api/cron/");
  const failureType = isCron ? "cron_failure" : "api_failure";

  return (async (...args: any[]) => {
    const started = Date.now();
    let status = 500;
    let ok = false;
    try {
      const res = await params.handler(...args);
      status = (res as any)?.status ?? 200;
      ok = status >= 200 && status < 500;
      if (status >= 500) {
        Sentry.captureMessage(`API failure: ${method} ${route} responded ${status}`, {
          level: "error",
          tags: { surface: "api", failure_type: failureType, route, method, status: String(status) },
        });
      }
      if (status === 401 || status === 403) {
        Sentry.captureMessage(`Auth error: ${method} ${route} responded ${status}`, {
          level: "warning",
          tags: { surface: "api", failure_type: "auth_error", route, method, status: String(status) },
        });
      }
      return res;
    } catch (err) {
      Sentry.captureException(err, {
        tags: { surface: "api", failure_type: isCron ? "cron_failure" : "unhandled_exception", route, method },
      });
      ok = false;
      status = 500;
      throw err;
    } finally {
      const ms = Date.now() - started;
      await recordApiMetric({ ts: new Date().toISOString(), route, method, ms, ok, status }).catch(() => {});

      if (ms > 10_000) {
        await sendTelegramAlert({
          text: `🚩 API slow: ${method} ${route} took ${ms}ms (status ${status})`,
        }).catch(() => {});
      } else if (ms > 3_000) {
        console.warn(`[monitoring] slow API: ${method} ${route} took ${ms}ms (status ${status})`);
      }

      // Check for error rate spike after recording (fire-and-forget)
      if (!ok) {
        checkErrorRateSpike(route, method).catch(() => {});
      }
    }
  }) as T;
}
