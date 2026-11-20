// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
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
    // frame-src names exactly the framed hosts — Cashfree checkout (billing)
    // plus Google's pre-built sign-in button iframe (2026-11-13 branding fix)
    // plus Puter's auth popup iframe (2026-11-17 AI Generator).
    // No wildcard, no 'self', nothing else may be framed.
    expect(directive("frame-src")).toBe(
      "https://sdk.cashfree.com https://payments.cashfree.com https://accounts.google.com https://puter.com",
    );
    expect(directive("base-uri")).toBe("'self'");
    expect(directive("form-action")).toBe(
      "'self' https://api.cashfree.com https://sandbox.cashfree.com",
    );
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

  it("lets the Cashfree SDK POST its checkout form (2026-11-14 silent checkout failure)", () => {
    // On desktop the SDK's checkout() redirect branch submits a <form>
    // POST to the hosted checkout page (production api.cashfree.com,
    // sandbox sandbox.cashfree.com — SDK v3 _config). With form-action
    // 'self' only, the browser silently blocks that POST: no JS error,
    // and the SDK still resolves {redirect: true}, so the button just
    // reverts and the payment never opens. 'self' stays first — only the
    // two checkout hosts are added, no other form destination.
    const formAction = directive("form-action");
    expect(formAction).toContain("'self'");
    expect(formAction).toContain("https://api.cashfree.com");
    expect(formAction).toContain("https://sandbox.cashfree.com");
    expect(formAction).not.toContain("payments.cashfree.com");
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

  it("allows Google Identity Services (2026-11-13 sign-in branding fix)", () => {
    // The GIS client library (script-src), the pre-built button iframe
    // (frame-src) and the token/FedCM calls (connect-src) all live on
    // accounts.google.com — without all three the button cannot render and
    // the sign-in falls back to the OAuth flow (which shows the Supabase host
    // in Google's chooser). frame-ancestors stays 'none': the site itself is
    // never framable.
    expect(directive("script-src")).toContain("https://accounts.google.com");
    expect(directive("frame-src")).toContain("https://accounts.google.com");
    expect(directive("connect-src")).toContain("https://accounts.google.com");
    expect(directive("frame-ancestors")).toBe("'none'");
    // Permissions-Policy must NOT block FedCM: the GIS button initialises with
    // use_fedcm_for_prompt, and identity-credentials-get=() would silently
    // disable the browser-mediated chooser. (No such directive is listed, so
    // it is allowed by default — assert the absence, not a value.)
    const pp = securityHeaders.find((h) => h.key === "Permissions-Policy")?.value ?? "";
    expect(pp).not.toContain("identity-credentials-get");
  });

  it("allows Google Analytics 4 + AdSense (2026-11-15 CSP fix)", () => {
    // The GA4 tag (script-src) and its beacons (connect-src) live in the
    // root layout and render only when their env var is set (lib/seo.ts
    // gaMeasurementId / adsensePublisherId). The live site proved the gap:
    // the tag was in the served HTML but the CSP blocked it, so GA4
    // Realtime showed 0 users. The CSP itself is static — it allows these
    // hosts whether or not the env vars are set; the env gate decides
    // whether the tags render at all.
    expect(directive("script-src")).toContain("https://www.googletagmanager.com");
    expect(directive("script-src")).toContain("https://pagead2.googlesyndication.com");
    const connect = directive("connect-src");
    expect(connect).toContain("https://www.google-analytics.com");
    expect(connect).toContain("https://*.google-analytics.com");
    // Regression: the GA loader's host must be the host this policy
    // allows — a mismatch is exactly the 2026-11-15 failure (tag in the
    // HTML, blocked by CSP, Realtime 0). The tag left the layout in
    // CAP-S07: GaLoader injects it only after consent, so the URL is
    // pinned in the loader, not the layout.
    const layout = readFileSync(
      fileURLToPath(new URL("../../app/layout.tsx", import.meta.url)),
      "utf8",
    );
    const gaLoader = readFileSync(
      fileURLToPath(new URL("../../components/ads/GaLoader.tsx", import.meta.url)),
      "utf8",
    );
    expect(gaLoader).toContain("https://www.googletagmanager.com/gtag/js?id=");
    expect(layout).not.toContain("https://www.googletagmanager.com/gtag/js?id=");
    // A-13 (2026-11-15): the AdSense script tag left the layout — the
    // server cannot know the stored consent choice, so the loader
    // (components/ads/AdSenseLoader.tsx) injects the script only after
    // Accept. The layout must carry zero ad code; the loader carries the
    // URL. CAP-S07 (r3): the GA4 tag left the layout the same way —
    // GaLoader injects it only after the same Accept.
    expect(layout).not.toContain("pagead2.googlesyndication.com");
    expect(layout).not.toContain("adConsent");
    const loader = readFileSync(
      fileURLToPath(new URL("../../components/ads/AdSenseLoader.tsx", import.meta.url)),
      "utf8",
    );
    expect(loader).toContain("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js");
    // No ad slots exist in the code yet (no adsbygoogle.push call anywhere
    // — only the loader), so the ad-serving
    // hosts are deliberately NOT allowlisted; add them to
    // img-src/connect-src/frame-src when ad slots ship.
    expect(loader).not.toContain("adsbygoogle.push");
    expect(layout).not.toContain("adsbygoogle.push");
    expect(csp).not.toContain("tpc.googlesyndication.com");
    // Nothing new is framed: the lockdown test pins frame-src exactly.
    expect(directive("frame-src")).not.toContain("googlesyndication");
    expect(directive("frame-src")).not.toContain("google-analytics");
  });

  it("lets the Teleprompter recorder use this origin's camera/mic (deep-audit B1)", () => {
    const pp = securityHeaders.find((h) => h.key === "Permissions-Policy")?.value ?? "";
    expect(pp).toContain("camera=(self)");
    expect(pp).toContain("microphone=(self)");
    expect(pp).toContain("geolocation=()");
    expect(pp).toContain("payment=()");
  });

  it("allows the footer listing badges (2026-11-20 nightly audit)", () => {
    // The "Listed on" footer badges (PR #5, 2026-11-19) hotlink SVGs from
    // indielaunch.dev and fazier.com. The live site proved the gap: the
    // badge <img> tags were in the served HTML but the CSP blocked them,
    // so both badges rendered as broken images in the footer — and the
    // badges must stay up (IndieLaunch re-checks weekly). Regression: the
    // badge hosts in the footer markup must be the hosts this policy allows.
    const img = directive("img-src");
    expect(img).toContain("https://indielaunch.dev");
    expect(img).toContain("https://fazier.com");
    const sections = readFileSync(
      fileURLToPath(new URL("../../components/home/Sections.tsx", import.meta.url)),
      "utf8",
    );
    expect(sections).toContain("https://indielaunch.dev/badges/indielaunch-light.svg");
    expect(sections).toContain(
      "https://fazier.com/api/v1/public/badges/launch_badges.svg?badge_type=featured&theme=neutral",
    );
  });

  it("allows the Puter.js AI Generator (2026-11-17) and nothing beyond its named origins", () => {
    // Evidence: the shipped https://js.puter.com/v2/ bundle (fetched
    // 2026-11-17) — the loader (script-src), defaultAPIOrigin api.puter.com
    // for every AI call (connect-src), defaultGUIOrigin puter.com for the
    // auth popup iframe (frame-src). Generated images arrive as blob:/data:
    // URLs (SDK createObjectURL), so img-src gains no host; generated video
    // src is a provider-hosted https: URL whose storage host is named
    // nowhere in the bundle or docs, so media-src deliberately gains none
    // either — the component falls back to open-in-new-tab instead.
    expect(directive("script-src")).toContain("https://js.puter.com");
    expect(directive("connect-src")).toContain("https://api.puter.com");
    expect(directive("frame-src")).toContain("https://puter.com");
    expect(directive("frame-src")).not.toContain("desktop.puter.com");
    expect(directive("media-src")).not.toContain("puter");
    expect(directive("img-src")).not.toContain("puter");
    // Regression: the loader URL in the component must be the host this
    // policy allows — a mismatch is exactly the 2026-11-15 GA4 failure
    // (tag in the HTML, blocked by CSP, feature silently dead).
    const generator = readFileSync(
      fileURLToPath(new URL("../../features/ai-generator/AiGenerator.tsx", import.meta.url)),
      "utf8",
    );
    expect(generator).toContain('src="https://js.puter.com/v2/"');
    expect(directive("frame-ancestors")).toBe("'none'");
  });

  it("allows the PWA: same-origin manifest and service worker (2026-11-13)", () => {
    // The manifest is served same-origin (/manifest.webmanifest) and the
    // worker is a same-origin script (/sw.js): manifest-src 'self' lets the
    // browser fetch the manifest, script-src 'self' lets it register the
    // worker. No new origin was added for the PWA.
    expect(directive("manifest-src")).toBe("'self'");
    expect(directive("script-src")).toContain("'self'");
  });

  it("the deliberate-error Sentry debug route no longer exists in the app", () => {
    const routeFile = fileURLToPath(new URL("../../app/api/cron/sentry-test/route.ts", import.meta.url));
    expect(existsSync(routeFile)).toBe(false);
  });
});
