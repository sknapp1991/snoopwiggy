// Cloudflare adapter config (https://opennext.js.org/cloudflare).
// Pages are prerendered shells and scripture text is static files, so a read-only
// static-assets cache is enough — no R2 bucket (and no payment method) needed.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
