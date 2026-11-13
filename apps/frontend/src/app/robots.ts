import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * Public surface is crawlable; the app (behind sign-in), the API and the
 * auth-flow helpers are not. App pages also carry metadata noindex, so they
 * stay out of the index even if a crawler reaches one through a link.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard", "/projects/", "/captions", "/editor", "/motion", "/growth", "/planner", "/analytics", "/library", "/clipper", "/analyzer", "/prompter", "/exports", "/brand", "/create", "/settings", "/start", "/pair", "/onboarding", "/transcribe", "/ai-clipper", "/forgot-password", "/reset-password"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
