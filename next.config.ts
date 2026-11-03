import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is off: it hangs in the Cloudflare Workers runtime (OpenNext 1.20, Nov 2026).
  // Pages here are client-rendered shells over static text files, so nothing depends on it.
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

// Lets `next dev` use Cloudflare bindings (env vars, later KV etc.) like production does.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
