// @vitest-environment node
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, securityHeaders } from "../securityHeaders";

/**
 * Pins the security-header posture from the 2026-11-10 audit fix pass:
 * a CSP exists, it still allows everything the product genuinely loads
 * (Whisper/HF workers + WASM, Supabase, Sentry tunnel, Vercel analytics),
 * the lockdown directives stay in place, and the old headers are unchanged.
 */

const csp = buildContentSecurityPolicy(false);
const directive = (name: string) =>
  csp
    .split("; ")
    .find((d) => d.startsWith(`${name} `))
    ?.slice(name.length + 1) ?? "";

describe("securityHeaders", () => {
  it("ships exactly one Content-Security-Policy alongside the pre-existing headers", () => {
    const keys = securityHeaders.map((h) => h.key);
    expect(keys.filter((k) => k === "Content-Security-Policy")).toHaveLength(1);
    expect(keys).toContain("X-Content-Type-Options");
    expect(keys).toContain("Referrer-Policy");
    expect(keys).toContain("X-Frame-Options");
    expect(keys).toContain("Strict-Transport-Security");
    expect(keys).toContain("Permissions-Policy");
  });

  it("keeps the lockdown directives", () => {
    expect(directive("default-src")).toBe("'self'");
    expect(directive("object-src")).toBe("'none'");
    expect(directive("frame-ancestors")).toBe("'none'");
    // frame-src names exactly the Cashfree checkout hosts (billing) — no
    // wildcard, no 'self', nothing else may be framed.
    expect(directive("frame-src")).toBe("https://sdk.cashfree.com https://payments.cashfree.com");
    expect(directive("base-uri")).toBe("'self'");
    expect(directive("form-action")).toBe("'self'");
  });

  it("allows the in-browser AI pipelines (HF model hosts, blob workers, WASM)", () => {
    const connect = directive("connect-src");
    expect(connect).toContain("https://huggingface.co");
    expect(connect).toContain("https://*.huggingface.co");
    expect(connect).toContain("https://*.hf.co");
    expect(directive("worker-src")).toContain("blob:");
    expect(directive("worker-src")).toContain("'self'");
    expect(directive("script-src")).toContain("'wasm-unsafe-eval'");
  });

  it("allows Supabase (REST + realtime), the Sentry ingest fallback and Vercel analytics", () => {
    const connect = directive("connect-src");
    expect(connect).toContain("https://*.supabase.co");
    expect(connect).toContain("wss://*.supabase.co");
    expect(connect).toContain("https://*.ingest.sentry.io");
    expect(connect).toContain("https://vitals.vercel-insights.com");
    expect(directive("script-src")).toContain("https://va.vercel-scripts.com");
  });

  it("allows the image origins the UI really renders", () => {
    const img = directive("img-src");
    for (const host of ["images.unsplash.com", "api.dicebear.com", "api.producthunt.com", "*.supabase.co"]) {
      expect(img).toContain(host);
    }
    expect(img).toContain("blob:");
    expect(img).toContain("data:");
  });

  it("never adds 'unsafe-eval' to production scripts (dev-only escape hatch)", () => {
    expect(directive("script-src")).not.toContain("'unsafe-eval'");
    expect(buildContentSecurityPolicy(true)).toContain("'unsafe-eval'");
  });

  it("lets the in-browser export fetch the blob: video URL (2026-11-13 export failure)", () => {
    // The preview plays via <video> (media-src blob:) but the browser MP4
    // export's Remotion media engine fetch()es the same blob: URL — fetch is
    // governed by connect-src, so both must allow blob: or the export aborts
    // with "Network error while fetching the video (possibly CORS)".
    expect(directive("connect-src")).toContain("blob:");
    expect(directive("media-src")).toContain("blob:");
  });

  it("allows the Pixabay stock imports (deep-audit B2: search API + CDN media)", () => {
    const connect = directive("connect-src");
    expect(connect).toContain("https://api.pixabay.com");
    expect(connect).toContain("https://cdn.pixabay.com");
    expect(directive("img-src")).toContain("https://cdn.pixabay.com");
    expect(directive("media-src")).toContain("https://cdn.pixabay.com");
  });

  it("allows the runtime caption/template font origins (OC-003) and keeps jsDelivr out", () => {
    // @remotion/google-fonts fetches the css2 stylesheet (connect-src) and
    // woff2 from gstatic (font-src); Fontsource-hosted families load woff2
    // from cdn.jsdelivr.net (font-src only — no script/connect, because the
    // ONNX WASM is self-hosted via onnxWasm.ts, never the jsDelivr default).
    expect(directive("connect-src")).toContain("https://fonts.googleapis.com");
    expect(directive("font-src")).toContain("https://fonts.gstatic.com");
    expect(directive("font-src")).toContain("https://cdn.jsdelivr.net");
    expect(csp).not.toContain("cdn.jsdelivr.net/npm/onnxruntime-web");
    expect(directive("script-src")).not.toContain("jsdelivr");
    expect(directive("connect-src")).not.toContain("jsdelivr");
  });

  it("lets the Teleprompter recorder use this origin's camera/mic (deep-audit B1)", () => {
    const pp = securityHeaders.find((h) => h.key === "Permissions-Policy")?.value ?? "";
    expect(pp).toContain("camera=(self)");
    expect(pp).toContain("microphone=(self)");
    expect(pp).toContain("geolocation=()");
    expect(pp).toContain("payment=()");
  });

  it("the deliberate-error Sentry debug route no longer exists in the app", () => {
    const routeFile = fileURLToPath(new URL("../../app/api/cron/sentry-test/route.ts", import.meta.url));
    expect(existsSync(routeFile)).toBe(false);
  });
});
