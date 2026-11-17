/**
 * Renders the Entrance / Exit picker previews with the REAL composition: one short looping clip per animation, in the
 * CaptionsEasy palette (obsidian caps with an orange key word on a lavender tile), into apps/frontend/public/motion/.
 * Re-run after changing an entrance or exit:
 *   pnpm --filter @capseasy/compositions motion-previews [--filter fade,letter-spin]
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { RenderInternals, openBrowser, renderMedia, selectComposition } from "@remotion/renderer";
import { CaptionDocSchema, ENTRANCES, EXITS, type CaptionStyleV2 } from "@capseasy/shared";
import { LETTER_DEFAULT_MS, resolveStyle } from "@capseasy/templates";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const only = arg("filter")?.split(",");
const outDir = resolve("../../apps/frontend/public/motion");

const W = 640;
const H = 320;
const FPS = 30;
const LAVENDER = "#F0D7FF";
const OBSIDIAN = "#1A1A1A";
const ORANGE = "#FFA946";

const words = (startMs: number) =>
  CaptionDocSchema.parse({
    version: 2,
    language: "en",
    // all three words land together, so the tile shows only the entrance / exit (not words popping in as spoken)
    words: ["Make", "it", "pop"].map((t, i) => ({ id: `w${i}`, text: t, startMs: startMs + i, endMs: startMs + 600 + i, ...(i === 2 ? { emphasis: "hero" } : {}) })),
  });

const base = (over: Partial<CaptionStyleV2>) =>
  resolveStyle({
    templateId: "sentence_clean", fontId: "Montserrat", fontWeight: 900, fontSize: 230, casing: "upper", letterSpacing: 0,
    fill: { type: "solid", color: OBSIDIAN }, stroke: { enabled: true, width: 6, color: OBSIDIAN }, shadows: [],
    active: { effect: "none", color: ORANGE, scale: 1, boxRadius: 12 }, inactiveOpacity: 1, templateOptions: { reveal: "all" },
    maxWidth: 0.92, safeBox: { top: 0, bottom: 0, left: 0, right: 0 }, position: { x: 0.5, y: 0.5 },
    ...over,
  } as Partial<CaptionStyleV2> & { templateId: string });

const ffmpeg = RenderInternals.getExecutablePath({ type: "ffmpeg", indent: false, logLevel: "error", binariesDirectory: null });
mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: resolve("src/entry.ts"), onProgress: () => undefined });
const browser = await openBrowser("chrome");

const jobs: { file: string; style: CaptionStyleV2; doc: ReturnType<typeof words>; durationMs: number; holdMs: number; fromMs?: number }[] = [];
for (const type of ENTRANCES) {
  if (type === "none" || (only && !only.includes(type))) continue;
  // a touch slower and smoother than the studio default so each motion is readable at tile size
  const durationMs = type.startsWith("letter-") ? LETTER_DEFAULT_MS : 480;
  // the card arrives at 250 ms, holds, then the clip loops
  jobs.push({ file: `enter-${type}`, style: base({ entrance: { type, durationMs, stagger: type.startsWith("letter-") || type === "wave" || type === "typewriter" ? "char" : "none", easing: "outCubic" }, exit: { type: "none", durationMs: 0 } }), doc: words(250), durationMs: 1600, holdMs: 1000 });
}
for (const type of EXITS) {
  if (type === "none" || (only && !only.includes(type))) continue;
  // the card is up (clip starts after its words settled), leaves at ~1.5 s, then a beat of empty tile before the loop restarts
  jobs.push({ file: `exit-${type}`, style: base({ entrance: { type: "none", durationMs: 0, stagger: "none", easing: "outExpo" }, exit: { type, durationMs: type.startsWith("letter-") ? LETTER_DEFAULT_MS : 420 } }), doc: words(0), durationMs: 2100, holdMs: 900, fromMs: 500 });
}

try {
  for (const j of jobs) {
    const settings = { maxWordsPerCard: 3, maxLines: 1, maxCharsPerLine: 30, holdMs: j.holdMs, gapBehavior: "clear" };
    const inputProps = { src: null, media: { width: W, height: H, fps: FPS, durationMs: j.durationMs, rotation: 0 }, doc: j.doc, style: j.style, settings, mode: "burn", backdrop: LAVENDER };
    const composition = await selectComposition({ serveUrl, id: "CaptionedVideo", inputProps, puppeteerInstance: browser });
    const raw = join(outDir, `${j.file}.raw.mp4`);
    const mp4 = join(outDir, `${j.file}.mp4`);
    await renderMedia({ composition, serveUrl, frameRange: [Math.round(((j.fromMs ?? 0) / 1000) * FPS), composition.durationInFrames - 1], codec: "h264", outputLocation: raw, inputProps, puppeteerInstance: browser, crf: 16, muted: true, pixelFormat: "yuv420p" });
    const ff = spawnSync(ffmpeg, ["-y", "-loglevel", "error", "-i", raw, "-c:v", "libx264", "-crf", "30", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", mp4], { encoding: "utf8" });
    rmSync(raw);
    if (ff.status !== 0) throw new Error(`ffmpeg failed for ${j.file}: ${ff.stderr}`);
    console.log(`${j.file}: ${Math.round(statSync(mp4).size / 1024)} KB`);
  }
} finally {
  await browser.close({ silent: true });
}
