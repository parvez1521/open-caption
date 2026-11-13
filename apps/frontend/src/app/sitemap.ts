import type { MetadataRoute } from "next";
import { INDEXABLE_PATHS, SITE_URL } from "@/lib/seo";

/**
 * Exactly the indexable public routes (homepage, sign-in, legal pages) on the
 * production origin. App pages behind auth are excluded here, carry metadata
 * noindex, and are disallowed in robots — they never belong in a sitemap.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  // lastmod is the build date: this route is statically generated, so the
  // Date is evaluated once at build time. No per-page dates are invented —
  // the site has no per-page publish timestamps to source them from.
  const lastModified = new Date();
  return INDEXABLE_PATHS.map((path) => ({
    url: path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`,
    lastModified,
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
