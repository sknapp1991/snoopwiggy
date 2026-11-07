import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is off: it hangs in the Cloudflare Workers runtime (OpenNext 1.20, Nov 2026).
  // Pages here are client-rendered shells over static text files, so nothing depends on it.
  // Allow phones on the same Wi-Fi to load dev assets.
  // Which build a feedback report came from (Workers Builds sets the commit; "local" otherwise).
  env: { NEXT_PUBLIC_BUILD: (process.env.WORKERS_CI_COMMIT_SHA ?? "local").slice(0, 9) },
  allowedDevOrigins:["192.168.*.*", "10.*.*.*", "172.16.*.*"],
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
