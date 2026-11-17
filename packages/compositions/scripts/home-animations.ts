/**
 * Renders the homepage feature animations with the REAL Remotion compositions
 * into apps/frontend/public/home/:
 *   pnpm --filter @capseasy/compositions home-animations
 *
 * Render environment: this sandbox's egress goes through a proxy, and
 * Remotion's Chromium hardcodes --proxy-server='direct://'. Before running,
 * start the local CONNECT forwarder (node /tmp/proxy-fwd.mjs) and patch
 * node_modules/@remotion/renderer/dist/open-browser.js (+ dist/esm/index.mjs)
 * to use --proxy-server=http://127.0.0.1:18080 — both are temporary local
 * changes, reverted after the render; the repo carries no trace of them.
 * Fonts load from Google Fonts inside Chromium, so the proxy must work or
 * the render fails on the font delayRender.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { RenderInternals, openBrowser, renderMedia, selectComposition } from "@remotion/renderer";

const outDir = resolve("../../apps/frontend/public/home");

const ffmpeg = RenderInternals.getExecutablePath({ type: "ffmpeg", indent: false, logLevel: "error", binariesDirectory: null });
mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: resolve("src/entry.ts"), onProgress: () => undefined });
const browser = await openBrowser("chrome", { chromiumOptions: { ignoreCertificateErrors: true } });

const jobs = [
  { id: "HomeSwapCaptions", file: "swap-captions" },
  { id: "HomeGrowthStudio", file: "growth-studio" },
];

try {
  for (const j of jobs) {
    const composition = await selectComposition({ serveUrl, id: j.id, inputProps: {}, puppeteerInstance: browser });
    const raw = join(outDir, `${j.file}.raw.mp4`);
    const mp4 = join(outDir, `${j.file}.mp4`);
    await renderMedia({ composition, serveUrl, codec: "h264", outputLocation: raw, inputProps: {}, puppeteerInstance: browser, crf: 16, muted: true, pixelFormat: "yuv420p" });
    const ff = spawnSync(ffmpeg, ["-y", "-loglevel", "error", "-i", raw, "-c:v", "libx264", "-crf", "28", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", mp4], { encoding: "utf8" });
    rmSync(raw);
    if (ff.status !== 0) throw new Error(`ffmpeg failed for ${j.file}: ${ff.stderr}`);
    console.log(`${j.file}: ${Math.round(statSync(mp4).size / 1024)} KB`);
  }
} finally {
  await browser.close({ silent: true });
}
