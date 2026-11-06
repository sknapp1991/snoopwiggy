import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo-shared";

/** Everything may be indexed except the API; points crawlers at the sitemap. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
