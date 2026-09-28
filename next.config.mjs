/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
  /**
   * Host-based rewrite for the clinics subdomain.
   *
   * This lives here rather than in vercel.json: for a Next.js project the
   * framework's own router owns request handling, and a vercel.json `rewrites`
   * entry does not reliably take effect for app-router paths — it was verified
   * live to be ignored. `async rewrites()` with a `has` host condition is the
   * first-class Next.js mechanism and is what actually runs.
   *
   * Scoped narrowly on purpose: only the root path, only on the clinics host,
   * so /api/*, /_next/* and /images/* fall through untouched and the subdomain
   * shares one deployment with the main site. vantagestack.co.za is unaffected.
   */
  async rewrites() {
    return [
      {
        source: "/",
        has: [{ type: "host", value: "clinics.vantagestack.co.za" }],
        destination: "/clinics",
      },
    ];
  },
  eslint: {
    // Lint is enforced via `npm run lint` / CI, not during the production build, so an
    // existing lint backlog can never block a Vercel deploy. Keep builds deterministic.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
