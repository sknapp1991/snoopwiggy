import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Chapter JSON is read from disk by /api/text — make sure it ships with the serverless bundle (Vercel).
  outputFileTracingIncludes: {
    "/api/text/**": ["./data/texts/**/*.json"],
  },
  // Allow phones on the same Wi-Fi to load dev assets.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.16.*.*"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
