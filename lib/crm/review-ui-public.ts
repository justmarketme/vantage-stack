/** Safe for Client Components — only public env vars. */

export function publicBaseUrlClient() {
  const u = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "").trim();
  return u.replace(/\/$/, "") || "http://localhost:3005";
}

export function consultationUrlClient() {
  const u = (process.env.NEXT_PUBLIC_CONSULTATION_URL || "").trim();
  if (u) return u;
  return `${publicBaseUrlClient()}/contact`;
}
