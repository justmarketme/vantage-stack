/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
  eslint: {
    // Lint is enforced via `npm run lint` / CI, not during the production build, so an
    // existing lint backlog can never block a Vercel deploy. Keep builds deterministic.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
