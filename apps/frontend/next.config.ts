import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { securityHeaders } from "./src/lib/securityHeaders";

/** This machine's LAN addresses: lets a phone on the same Wi-Fi open the dev server (Next blocks unknown dev origins). */
const lanHosts = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === "IPv4" && !a.internal)
  .map((a) => a!.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: lanHosts,
  transpilePackages: [
    "@remotion/transitions",
    "remotion",
    "@remotion/player",
    "@remotion/media",
    "@motion-ai/caption-engine",
    "@capseasy/shared",
    "@capseasy/templates",
    "@capseasy/compositions",
  ],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Long-lived caching for content-stable public assets: look previews,
      // hero sample clips, brand marks and bundled images are fixed files
      // (regenerated only when the underlying asset changes, under a new
      // name or a redeploy). HTML keeps its existing caching untouched, and
      // /companion + /models are excluded — they are fetched by installers
      // and the runtime, not the browser, and must always be fresh.
      // Next merges headers from every matching rule, so the security
      // headers above still apply to these paths too.
      {
        source: "/looks/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/hero/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/brand/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/images/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      // Cross-origin isolation (COOP/COEP) was tried for multi-threaded WASM and removed: on some Android phones the
      // speech worker failed to start at all (Sentry SENTRY-COPPER-QUEEN-5). Re-enable only after testing on real phones.
    ];
  },
};

// readable stack traces in Sentry: source maps are uploaded at build time (org/project/token come from the Vercel integration)
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // sent through our own domain so ad blockers don't drop error reports
  tunnelRoute: "/monitoring",
});
