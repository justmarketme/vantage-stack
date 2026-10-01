/**
 * Module mocks shared by the consultant integration suites. Import this FIRST in every test
 * file (before any route or lib import) so the mocks are registered before those modules load.
 *
 * - `requireConsultant` returns whatever session the test chose with `actAs()` (the real
 *   role → flags logic is covered by the unit suite); the opts gates (`call`, `manager`,
 *   `permission`) are honoured exactly like the real guard.
 * - `after()` from next/server is captured instead of needing a request scope.
 * - The Anthropic SDK's `beta.messages.parse` is a controllable fake — no network, ever.
 */

type SessionLike = { canCall: boolean; isManager: boolean; permissions?: string[] } | null;
type ParseFn = (req: unknown) => Promise<unknown>;

export const anthropic = ((globalThis as Record<string, unknown>).__consultantItAnthropic ??= {
  calls: [] as unknown[],
  impl: (async () => {
    throw new Error("anthropic parse not configured for this test");
  }) as ParseFn,
}) as { calls: unknown[]; impl: ParseFn };

jest.mock("@/lib/consultant/auth/session", () => {
  const { NextResponse } = jest.requireActual("next/server");
  const deny = (status: number, error: string) => NextResponse.json({ error }, { status });
  return {
    __esModule: true,
    consultantFlags: () => ({ isManager: false, canCall: false }),
    requireConsultant: async (opts?: { manager?: boolean; call?: boolean; permission?: string }) => {
      const h = (globalThis as { __consultantItSession?: { session: SessionLike; als: { getStore(): SessionLike | undefined } } })
        .__consultantItSession;
      const scoped = h?.als.getStore();
      const s = scoped !== undefined ? scoped : (h?.session ?? null);
      if (!s) return deny(401, "Unauthorized");
      if (opts?.call && !s.canCall) return deny(403, "Calling requires a consultant account");
      if (opts?.manager && !s.isManager) return deny(403, "Managers only");
      if (opts?.permission && !(s.permissions ?? []).includes(opts.permission)) return deny(403, "Forbidden");
      return s;
    },
  };
});

jest.mock("next/server", () => {
  const actual = jest.requireActual("next/server");
  return {
    ...actual,
    after: (fn: () => unknown) => {
      const holder = (globalThis as { __consultantItAfter?: { tasks: (() => unknown)[] } }).__consultantItAfter;
      holder?.tasks.push(fn);
    },
  };
});

jest.mock("@anthropic-ai/sdk", () => {
  const actual = jest.requireActual("@anthropic-ai/sdk");
  const Real = actual.default;
  class FakeAnthropic {
    static APIError = Real.APIError;
    static RateLimitError = Real.RateLimitError;
    static AuthenticationError = Real.AuthenticationError;
    static PermissionDeniedError = Real.PermissionDeniedError;
    static BadRequestError = Real.BadRequestError;
    static NotFoundError = Real.NotFoundError;
    static InternalServerError = Real.InternalServerError;
    beta = {
      messages: {
        parse: async (req: unknown) => {
          const h = (globalThis as { __consultantItAnthropic?: { calls: unknown[]; impl: (r: unknown) => Promise<unknown> } })
            .__consultantItAnthropic!;
          h.calls.push(req);
          return h.impl(req);
        },
      },
    };
  }
  return { ...actual, __esModule: true, default: FakeAnthropic };
});

// postgres.js logs server NOTICEs ("already exists, skipping") via console.log by default; the
// app pool has no onnotice hook, so drop exactly those to keep test output readable.
const log = console.log.bind(console);
console.log = (...args: unknown[]) => {
  const first = args[0] as { severity?: unknown } | undefined;
  if (args.length === 1 && first && typeof first === "object" && first.severity === "NOTICE") return;
  log(...args);
};

export {};
