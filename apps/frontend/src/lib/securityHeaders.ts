/**
 * Security response headers for every route (wired up in next.config.ts).
 *
 * The Content-Security-Policy is built from what the app actually loads — keep it in sync when adding
 * a new external origin, worker or WASM pipeline:
 * - In-browser Whisper + the local text model (@huggingface/transformers): model files are fetched
 *   from huggingface.co (large files redirect to its LFS/Xet CDNs, *.huggingface.co / *.hf.co),
 *   inference runs in bundled module workers and ONNX WASM — hence `worker-src blob:`,
 *   `'wasm-unsafe-eval'`, and connect-src for the HF hosts.
 * - Supabase: REST + realtime websocket against the project origin (*.supabase.co), plus
 *   storage-hosted avatars/media.
 * - Sentry: envelopes go through the same-origin tunnel route (/monitoring, covered by 'self');
 *   the ingest hosts are listed as a fallback in case the tunnel is ever disabled.
 * - Vercel Analytics + Speed Insights: script from va.vercel-scripts.com, beacons to
 *   vitals.vercel-insights.com (and same-origin /_vercel/*, covered by 'self').
 * - Images: DiceBear fallback avatars, Unsplash carousel photos, the Product Hunt badge,
 *   and OAuth provider avatars (Google / GitHub).
 * - Pixabay (user's-own-key stock audio + Clipper B-roll, Phase 8 / Package 3): searches go
 *   to api.pixabay.com and the media files themselves are served from cdn.pixabay.com —
 *   both must be in connect-src, and the CDN in img-src/media-src, or the features are
 *   blocked by this policy in production (deep-audit finding B2, 2026-11-11).
 * - Camera/microphone: the Teleprompter recorder (A13) uses getUserMedia on this origin,
 *   so Permissions-Policy must allow (self) — camera=()/microphone=() silently disables
 *   recording site-wide (deep-audit finding B1, 2026-11-11).
 *
 * Known trade-off, deliberate: `script-src` keeps `'unsafe-inline'` because the Next.js App Router
 * emits inline bootstrap scripts and the root layout ships two small constant inline scripts;
 * there is no nonce pipeline. Everything else is locked down (object-src/base-uri/form-action/
 * frame-ancestors 'none'/'self'), so the policy still blocks plugin content, framing, form
 * hijacking and any script/style/connect destination not listed here.
 */
export function buildContentSecurityPolicy(isDev: boolean): string {
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    "'wasm-unsafe-eval'",
    // React Refresh / HMR in `next dev` evaluates code; never in production.
    ...(isDev ? ["'unsafe-eval'"] : []),
    "https://va.vercel-scripts.com",
    // Cashfree checkout: the JS SDK that opens the hosted payment modal
    // (billing, Phase B). Only the SDK origin — no other third-party scripts.
    "https://sdk.cashfree.com",
  ];
  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    ["script-src", scriptSrc],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    [
      "img-src",
      [
        "'self'",
        "data:",
        "blob:",
        "https://*.supabase.co",
        "https://images.unsplash.com",
        "https://api.dicebear.com",
        "https://api.producthunt.com",
        "https://lh3.googleusercontent.com",
        "https://avatars.githubusercontent.com",
        // Pixabay stock thumbnails/posters (user's-own-key imports).
        "https://cdn.pixabay.com",
      ],
    ],
    ["font-src", ["'self'", "data:"]],
    ["media-src", ["'self'", "blob:", "data:", "https://*.supabase.co", "https://cdn.pixabay.com"]],
    [
      "connect-src",
      [
        "'self'",
        "https://*.supabase.co",
        "wss://*.supabase.co",
        "https://huggingface.co",
        "https://*.huggingface.co",
        "https://*.hf.co",
        "https://va.vercel-scripts.com",
        "https://vitals.vercel-insights.com",
        "https://*.ingest.sentry.io",
        "https://*.ingest.us.sentry.io",
        // Cashfree: the checkout SDK talks to the PG API (orders are created
        // server-side; these are the SDK's own session/telemetry calls).
        "https://api.cashfree.com",
        "https://sandbox-api.cashfree.com",
        "https://sdk.cashfree.com",
        // Pixabay: the search APIs (audio + video) and the media downloads
        // (files are fetched to be stored in the project's on-device bin).
        "https://api.pixabay.com",
        "https://cdn.pixabay.com",
      ],
    ],
    ["worker-src", ["'self'", "blob:"]],
    ["child-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    // The only framed third-party content on the site: Cashfree's hosted
    // checkout modal (billing). Everything else stays unframable.
    ["frame-src", ["https://sdk.cashfree.com", "https://payments.cashfree.com"]],
    ["frame-ancestors", ["'none'"]],
  ];
  return directives.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
}

export const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: buildContentSecurityPolicy(process.env.NODE_ENV !== "production"),
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // camera/microphone are (self), not (): the Teleprompter recorder (A13) records on this
  // origin via getUserMedia. geolocation is never used; payment stays off (Cashfree's modal
  // is a plain iframe, not the Payment Request API).
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=()" },
];
