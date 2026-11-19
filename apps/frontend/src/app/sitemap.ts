import type { MetadataRoute } from "next";
import { INDEXABLE_PATHS, SITE_URL } from "@/lib/seo";

/**
 * Exactly the indexable public routes (homepage, tool pages, legal pages) on the
 * production origin. App pages behind auth are excluded here, carry metadata
 * noindex, and are disallowed in robots — they never belong in a sitemap.
 * /login is excluded deliberately (MA-A8-004) — see INDEXABLE_PATHS in lib/seo.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  // lastmod is the build date: this route is statically generated, so the
  // Date is evaluated once at build time. No per-page dates are invented —
  // the site has no per-page publish timestamps to source them from.
  const lastModified = new Date();
  return INDEXABLE_PATHS.map((path) => ({
    // MA-A8-002: the homepage loc must match the canonical Next actually
    // renders. Next strips the trailing slash from the root canonical even
    // when it is set as `${SITE_URL}/`, so the loc is the bare origin here
    // (verified against the built output); every other path keeps its slash.
    url: path === "/" ? SITE_URL : `${SITE_URL}${path}`,
    lastModified,
    changeFrequency:
      path === "/"
        ? ("weekly" as const)
        : path === "/auto-caption-generator" || path === "/auto-captions-for-reels" || path === "/ai-generator"
          ? ("monthly" as const)
          : ("yearly" as const),
    // Tool landing pages outrank legal pages: they are the pages built to be found.
    priority: path === "/" ? 1 : path === "/auto-caption-generator" || path === "/auto-captions-for-reels" || path === "/ai-generator" ? 0.8 : 0.3,
  }));
}
