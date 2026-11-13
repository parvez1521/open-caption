import type { MetadataRoute } from "next";
import { INDEXABLE_PATHS, SITE_URL } from "@/lib/seo";

/**
 * Exactly the indexable public routes (homepage, sign-in, legal pages) on the
 * production origin. App pages behind auth are excluded here, carry metadata
 * noindex, and are disallowed in robots — they never belong in a sitemap.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return INDEXABLE_PATHS.map((path) => ({
    url: path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`,
    changeFrequency:
      path === "/"
        ? ("weekly" as const)
        : path === "/auto-caption-generator"
          ? ("monthly" as const)
          : ("yearly" as const),
    // Tool landing pages outrank sign-in/legal: they are the pages built to be found.
    priority: path === "/" ? 1 : path === "/auto-caption-generator" ? 0.8 : path === "/login" ? 0.5 : 0.3,
  }));
}
