import * as Sentry from "@sentry/nextjs";
import { recordApiMetric } from "./metrics";
import { sendTelegramAlert } from "../scheduler-engine/telegram";

function safeRouteName(input: string) {
  return input.replace(/\s+/g, " ").trim().slice(0, 140);
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
      await recordApiMetric({
        ts: new Date().toISOString(),
        route,
        method,
        ms,
        ok,
        status,
      }).catch(() => {});

      if (ms > 10_000) {
        await sendTelegramAlert({
          text: `🚩 API slow: ${method} ${route} took ${ms}ms (status ${status})`,
        }).catch(() => {});
      } else if (ms > 3_000) {
        // Warning-level: stored in metrics + visible on dashboard; no pager.
        // Keep this low-noise by not alerting to Telegram.
        // eslint-disable-next-line no-console
        console.warn(`[monitoring] slow API: ${method} ${route} took ${ms}ms (status ${status})`);
      }
    }
  }) as T;
}

