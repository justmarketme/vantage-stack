function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function withRetries<T>(params: {
  maxAttempts: number;
  baseDelayMs?: number;
  run: (attempt: number) => Promise<T>;
}): Promise<{ ok: true; value: T; attempts: number } | { ok: false; error: unknown; attempts: number }> {
  const max = Math.max(1, Math.floor(params.maxAttempts));
  const base = Math.max(50, Math.floor(params.baseDelayMs ?? 500));

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      const value = await params.run(attempt);
      return { ok: true, value, attempts: attempt };
    } catch (e) {
      lastErr = e;
      if (attempt < max) {
        const backoff = Math.min(20_000, base * Math.pow(2, attempt - 1));
        await sleep(backoff);
      }
    }
  }
  return { ok: false, error: lastErr, attempts: max };
}

