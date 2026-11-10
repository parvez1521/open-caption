/**
 * Bundle-time stub for `@remotion/google-fonts/*`, used ONLY by the pixel harness
 * (src/transitions.pixel.test.ts) via a webpack NormalModuleReplacementPlugin.
 * Production bundles never see this file — nothing in src/ imports it.
 *
 * Why it exists: @remotion/google-fonts' loadFont() fetches woff2 files from
 * fonts.gstatic.com inside the rendering Chromium and holds the frame with
 * delayRender until they arrive; on failure its retry promises reject and the
 * render is cancelled with that network error. Remotion's Chromium is launched
 * with `--no-proxy-server` / `--proxy-server='direct://'` (see
 * @remotion/renderer/dist/open-browser.js), so in network-restricted
 * environments (e.g. this repo's sandbox, whose egress requires a proxy) EVERY
 * render of CaptionedVideo dies on the default style's Inter load — even for a
 * caption-less composition, because useFontsReady loads the style/template
 * families unconditionally.
 *
 * The pixel harness renders an EMPTY caption doc: no glyph is ever drawn, so
 * font loading is orthogonal to what it verifies (segment-transition pixels).
 * This stub keeps the exact module shape @capseasy/templates' fonts.ts consumes
 * (getInfo + loadFont().waitUntilDone()) and resolves immediately, so
 * useFontsReady flips ready and the REAL composition — segment chain,
 * TransitionSeries, presentations, still rendering — runs untouched.
 */
export const getInfo = () => ({
  fonts: {
    normal: { "400": { latin: "" } },
    italic: { "400": { latin: "" } },
  },
  unicodeRanges: { latin: "U+0000-00FF" },
  subsets: ["latin"],
});

export const fontFamily = "PixelHarnessStub";

export const loadFont = () => ({
  fontFamily: "PixelHarnessStub",
  unicodeRanges: { latin: "U+0000-00FF" },
  fonts: {},
  waitUntilDone: () => Promise.resolve(),
});

export default loadFont;
