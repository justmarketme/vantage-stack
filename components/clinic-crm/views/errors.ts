/** Pull the user-facing text off an ApiClientError (or anything else) without trusting its shape. */
export function errorMessage(e: unknown, fallback = "Something went wrong. Please try again."): string {
  if (e && typeof e === "object" && "error" in e && typeof (e as { error: unknown }).error === "string") {
    return (e as { error: string }).error;
  }
  return fallback;
}

export function fieldErrors(e: unknown): Record<string, string> {
  if (e && typeof e === "object" && "fields" in e) {
    const f = (e as { fields?: unknown }).fields;
    if (f && typeof f === "object") return f as Record<string, string>;
  }
  return {};
}

export function errorStatus(e: unknown): number | null {
  if (e && typeof e === "object" && "status" in e && typeof (e as { status: unknown }).status === "number") {
    return (e as { status: number }).status;
  }
  return null;
}
