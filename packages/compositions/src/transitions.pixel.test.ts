/**
 * transitions.pixel.test.ts — PIXEL-level evidence for segment transitions.
 *
 * Phase 4 shipped transitions (fade/wipe/slide from @remotion/transitions plus the
 * custom zoom/blur presentations in ./transitions) with parity evidence only at
 * structure/style level: transitions.test.tsx asserts the markup/styles a
 * presentation produces at progress 0.5, and segments.test.tsx asserts the
 * TransitionSeries structure CaptionedVideo builds. Neither proves a rendered
 * frame actually blends. This suite closes that gap for fade and zoom: it
 * bundles the REAL entry (src/entry.ts → Root → CaptionedVideo), renders stills
 * with @remotion/renderer's renderStill at frames inside a transition between
 * two still segments with known pixels, decodes the PNGs with sharp (already a
 * devDependency, used the same way by scripts/stills.ts) and asserts on the
 * actual pixels.
 *
 * Timeline under test (fps 30, canvas 320x180):
 *   segment A 2000ms (60 frames), segment B 2000ms (60 frames),
 *   B.transitionIn = 1000ms (30 frames, linearTiming).
 *   videoTransitionLayout gives sequences [60, 60]; B's sequence starts at
 *   frame 30, so presentationProgress at composition frame f is (f - 30) / 30
 *   for 30 <= f <= 60 (TransitionSeries computes the entering scene's progress
 *   from its sequence start; linearTiming is the identity on [0, 30]).
 *   Composition duration = 90 frames (compositionDurationMs: 4000 - 1000ms).
 *   Frames rendered: 15 (pure A), 30 (progress 0), 45 (progress 0.5),
 *   59 (progress 29/30), 75 (pure B, fade only).
 *
 * Font stub: the bundle is built with a webpack override replacing every
 * `@remotion/google-fonts/*` module with src/pixel-harness/google-fonts-stub.ts.
 * That package loads woff2 files from fonts.gstatic.com inside the rendering
 * Chromium and cancels the render when the fetch fails; Remotion launches
 * Chromium with `--no-proxy-server` / `--proxy-server='direct://'`
 * (@remotion/renderer/dist/open-browser.js), so in network-restricted
 * environments every CaptionedVideo render dies on the default style's Inter
 * load with `NetworkError: A network error occurred.` — reproduced here before
 * this harness existed. The composition rendered here has an EMPTY caption
 * doc, so no glyph is ever drawn and font loading is orthogonal to the pixels
 * under test; everything else — Root/calculateMetadata, the segment chain,
 * TransitionSeries, the presentations, the Img stills — is the production code
 * path, unmodified. (On a machine with open internet the stub is unnecessary
 * but harmless: it changes no rendered pixel of a caption-less composition.)
 *
 * Cost: this is the package's one heavy test — one webpack bundle (cached by
 * @remotion/bundler across runs) plus 8 renderStill calls, ~1-3 minutes
 * depending on cache warmth and CPU. It runs as part of the package's normal
 * `vitest run`; to run it alone:
 *   ./node_modules/.bin/vitest run src/transitions.pixel.test.ts
 * It needs the Chrome Headless Shell @remotion/renderer ensures on first use
 * (node_modules/.remotion); if that is unavailable it falls back to a
 * Playwright chromium headless shell under ~/.cache/ms-playwright.
 */
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bundle, type WebpackOverrideFn } from "@remotion/bundler";
import { openBrowser, renderStill, selectComposition, type HeadlessBrowser } from "@remotion/renderer";
import sharp from "sharp";

const W = 320;
const H = 180;
const FPS = 30;
const CENTRE = { x: 160, y: 90 };
/** Zoom scene B: white square x in [110, 210), y in [40, 140) on black. */
const ZOOM_ANNULUS_LEFT = { x: 112, y: 90 };
const ZOOM_ANNULUS_RIGHT = { x: 208, y: 90 };

const nodeRequire = createRequire(import.meta.url);
const webpackModule = nodeRequire(
  nodeRequire.resolve("webpack", { paths: [dirname(nodeRequire.resolve("@remotion/bundler/package.json"))] }),
) as {
  NormalModuleReplacementPlugin: new (resourceRegExp: RegExp, newResource: string) => unknown;
};

const fontStubPath = fileURLToPath(new URL("./pixel-harness/google-fonts-stub.ts", import.meta.url));
const entryPoint = fileURLToPath(new URL("./entry.ts", import.meta.url));

const webpackOverride: WebpackOverrideFn = (config) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    new webpackModule.NormalModuleReplacementPlugin(/^@remotion\/google-fonts\//, fontStubPath),
  ] as typeof config.plugins,
});

type Rgb = { r: number; g: number; b: number };

const solidPng = (rgb: { r: number; g: number; b: number }) =>
  sharp({ create: { width: W, height: H, channels: 3, background: rgb } }).png().toBuffer();

const zoomSceneBPng = () =>
  sharp({ create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${W}" height="${H}"><rect x="110" y="40" width="100" height="100" fill="#ffffff"/></svg>`,
        ),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toBuffer();

const toDataUrl = (buf: Buffer) => `data:image/png;base64,${buf.toString("base64")}`;

const makeProps = (type: "fade" | "zoom", urlA: string, urlB: string) => ({
  src: urlA,
  media: { width: W, height: H, fps: FPS, durationMs: 4000, rotation: 0 },
  doc: { version: 2, words: [] },
  style: {},
  settings: {
    clipRange: { startMs: 0, endMs: 4000 },
    composition: {
      videoSegments: [
        { id: "seg-a", sourceInMs: 0, sourceOutMs: 2000, still: true, assetId: "segA" },
        {
          id: "seg-b",
          sourceInMs: 0,
          sourceOutMs: 2000,
          still: true,
          assetId: "segB",
          transitionIn: { type, durationMs: 1000 },
        },
      ],
    },
  },
  mode: "burn",
  segmentAssets: { segA: urlA, segB: urlB },
});

/** Mean RGB over a (2*half+1)^2 region around (cx, cy) of a rendered PNG still. */
async function regionAverage(file: string, cx: number, cy: number, half = 3): Promise<Rgb> {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = cy - half; y <= cy + half; y++) {
    for (let x = cx - half; x <= cx + half; x++) {
      const i = (y * info.width + x) * info.channels;
      r += data[i]!;
      g += data[i + 1]!;
      b += data[i + 2]!;
      n++;
    }
  }
  return { r: r / n, g: g / n, b: b / n };
}

function findPlaywrightShell(): string | null {
  const base = join(process.env.HOME ?? "", ".cache", "ms-playwright");
  if (!existsSync(base)) return null;
  for (const dir of readdirSync(base).sort().reverse()) {
    const candidates = [
      join(base, dir, "chrome-headless-shell-linux64", "chrome-headless-shell"),
      join(base, dir, "chrome-linux", "chrome"),
    ];
    for (const c of candidates) if (existsSync(c)) return c;
  }
  return null;
}

async function openTestBrowser(): Promise<HeadlessBrowser> {
  try {
    return await openBrowser("chrome");
  } catch (firstError) {
    const shell = findPlaywrightShell();
    if (!shell) throw firstError;
    return await openBrowser("chrome", { browserExecutable: shell });
  }
}

type Samples = {
  metadata: { width: number; height: number; fps: number; durationInFrames: number };
  centre: Map<number, Rgb>;
  annulusLeft: Map<number, Rgb>;
  annulusRight: Map<number, Rgb>;
};

const rendered: { fade?: Samples; zoom?: Samples } = {};
let browser: HeadlessBrowser | null = null;
let outDir: string | null = null;
let bundleDir: string | null = null;

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "transitions-pixel-"));
  const [redPng, bluePng, blackPng, zoomBPng] = await Promise.all([
    solidPng({ r: 255, g: 0, b: 0 }),
    solidPng({ r: 0, g: 0, b: 255 }),
    solidPng({ r: 0, g: 0, b: 0 }),
    zoomSceneBPng(),
  ]);
  const scenes = {
    fade: { a: toDataUrl(redPng), b: toDataUrl(bluePng), frames: [15, 30, 45, 59, 75] },
    zoom: { a: toDataUrl(blackPng), b: toDataUrl(zoomBPng), frames: [30, 45, 59] },
  } as const;

  const serveUrl = await bundle({ entryPoint, onProgress: () => undefined, enableCaching: true, webpackOverride });
  bundleDir = serveUrl;
  browser = await openTestBrowser();

  for (const kind of ["fade", "zoom"] as const) {
    const scene = scenes[kind];
    const inputProps = makeProps(kind, scene.a, scene.b);
    const composition = await selectComposition({ serveUrl, id: "CaptionedVideo", inputProps, puppeteerInstance: browser });
    const samples: Samples = {
      metadata: {
        width: composition.width,
        height: composition.height,
        fps: composition.fps,
        durationInFrames: composition.durationInFrames,
      },
      centre: new Map(),
      annulusLeft: new Map(),
      annulusRight: new Map(),
    };
    for (const frame of scene.frames) {
      const file = join(outDir, `${kind}-${frame}.png`);
      await renderStill({ composition, serveUrl, output: file, frame, inputProps, puppeteerInstance: browser, imageFormat: "png" });
      samples.centre.set(frame, await regionAverage(file, CENTRE.x, CENTRE.y));
      if (kind === "zoom") {
        samples.annulusLeft.set(frame, await regionAverage(file, ZOOM_ANNULUS_LEFT.x, ZOOM_ANNULUS_LEFT.y));
        samples.annulusRight.set(frame, await regionAverage(file, ZOOM_ANNULUS_RIGHT.x, ZOOM_ANNULUS_RIGHT.y));
      }
    }
    rendered[kind] = samples;
  }
}, 600_000);

afterAll(async () => {
  await browser?.close({ silent: true }).catch(() => undefined);
  if (outDir) rmSync(outDir, { recursive: true, force: true });
  if (bundleDir?.startsWith("/")) rmSync(bundleDir, { recursive: true, force: true });
});

const expectNear = (actual: Rgb, expected: Rgb, tol: number) => {
  expect(Math.abs(actual.r - expected.r)).toBeLessThanOrEqual(tol);
  expect(Math.abs(actual.g - expected.g)).toBeLessThanOrEqual(tol);
  expect(Math.abs(actual.b - expected.b)).toBeLessThanOrEqual(tol);
};

describe("transitions pixel harness (real renderStill frames of CaptionedVideo)", () => {
  it("composition metadata: 320x180 @30fps, 90 frames (4000ms of segments - 1000ms transition)", () => {
    for (const kind of ["fade", "zoom"] as const) {
      expect(rendered[kind]!.metadata).toEqual({ width: W, height: H, fps: FPS, durationInFrames: 90 });
    }
  });

  describe("fade: solid red segment -> solid blue segment", () => {
    it("frame 15 (before the transition) is pure segment A red", () => {
      expectNear(rendered.fade!.centre.get(15)!, { r: 255, g: 0, b: 0 }, 12);
    });

    it("frame 30 (progress 0) is still pure A — the entering scene is fully transparent", () => {
      expectNear(rendered.fade!.centre.get(30)!, { r: 255, g: 0, b: 0 }, 12);
    });

    it("frame 45 (progress 0.5) is the midway blend of A and B", () => {
      const px = rendered.fade!.centre.get(45)!;
      expect(px.r).toBeGreaterThanOrEqual(97);
      expect(px.r).toBeLessThanOrEqual(157);
      expect(px.b).toBeGreaterThanOrEqual(97);
      expect(px.b).toBeLessThanOrEqual(157);
      expect(px.g).toBeLessThanOrEqual(32);
      expect(Math.abs(px.r - px.b)).toBeLessThanOrEqual(48);
    });

    it("frame 59 (progress 29/30) is nearly pure B", () => {
      const px = rendered.fade!.centre.get(59)!;
      expect(px.r).toBeLessThanOrEqual(56);
      expect(px.b).toBeGreaterThanOrEqual(199);
      expect(px.g).toBeLessThanOrEqual(32);
    });

    it("frame 75 (after the transition) is pure segment B blue", () => {
      expectNear(rendered.fade!.centre.get(75)!, { r: 0, g: 0, b: 255 }, 12);
    });
  });

  describe("zoom: solid black segment -> black segment with a centred white square", () => {
    it("frame 30 (progress 0) is black at centre — the entering scene is invisible and unscaled-in", () => {
      expectNear(rendered.zoom!.centre.get(30)!, { r: 0, g: 0, b: 0 }, 28);
    });

    it("frame 45 (progress 0.5) centre is mid-grey: entering white at opacity 0.5 over black", () => {
      const px = rendered.zoom!.centre.get(45)!;
      for (const v of [px.r, px.g, px.b]) {
        expect(v).toBeGreaterThanOrEqual(88);
        expect(v).toBeLessThanOrEqual(168);
      }
      expect(Math.max(px.r, px.g, px.b) - Math.min(px.r, px.g, px.b)).toBeLessThanOrEqual(36);
    });

    it("frame 45 annulus points stay dark: inside the unscaled square but (mostly) outside the 0.925-scaled one — the scale is really applied, not just opacity", () => {
      // Unscaled square spans x in [110, 210); at scale 0.925 about the centre it
      // spans [113.75, 206.25). The 7x7 sampling windows around x=112 / x=208
      // straddle the scaled edge, so the expected means are ~23-40 (measured
      // 39.9 left / 22.7 right in the reference run), NOT 0 — but with NO scale
      // they would be ~91-110 (opacity-0.5 white across most of the window).
      // The 72 bound sits between the two predictions with ~2x headroom.
      for (const px of [rendered.zoom!.annulusLeft.get(45)!, rendered.zoom!.annulusRight.get(45)!]) {
        expect(px.r).toBeLessThanOrEqual(72);
        expect(px.g).toBeLessThanOrEqual(72);
        expect(px.b).toBeLessThanOrEqual(72);
      }
    });

    it("frame 59 (progress 29/30, scale ~0.995) centre and annulus are near-white", () => {
      // Reference run: centre 247, annulus 203 left / 170 right (the right
      // window still holds ~2 black columns past the 209.75 scaled edge).
      const centre = rendered.zoom!.centre.get(59)!;
      expect(centre.r).toBeGreaterThanOrEqual(212);
      expect(centre.g).toBeGreaterThanOrEqual(212);
      expect(centre.b).toBeGreaterThanOrEqual(212);
      for (const px of [rendered.zoom!.annulusLeft.get(59)!, rendered.zoom!.annulusRight.get(59)!]) {
        expect(px.r).toBeGreaterThanOrEqual(150);
        expect(px.g).toBeGreaterThanOrEqual(150);
        expect(px.b).toBeGreaterThanOrEqual(150);
      }
    });
  });
});
