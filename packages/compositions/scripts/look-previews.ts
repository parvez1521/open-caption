/**
 * Renders the Looks gallery previews with the REAL composition: a wide still (.webp) and a short looping clip
 * (.mp4) per look, into apps/frontend/public/looks/. Re-run after changing templates or looks:
 *   pnpm --filter @capseasy/compositions previews [--filter <lookId>]
 *
 * Each preview shows ONE whole card on black (every look is designed to read on black), captured when the look's signature is
 * visible (every word on screen, the key word styled, the spoken-word effect running), then cropped tightly
 * around the caption so the text fills the tile.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { RenderInternals, openBrowser, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import sharp from "sharp";
import { CaptionDocSchema } from "@capseasy/shared";
import { LOOKS, getTemplate, resolveStyle } from "@capseasy/templates";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const outDir = resolve(arg("out") ?? "../../apps/frontend/public/looks");
const only = arg("filter");
/** every look is previewed on the same backdrop, exactly as it renders (override: `--backdrop "#RRGGBB"`) */
const BACKDROP = arg("backdrop") ?? "#000000";
const stillsOnly = process.argv.includes("--stills-only");

const W = 1280;
const H = 720; // true proportions: styles scale by the short edge exactly as on a 720p video
const FPS = 30;
const GAP = 420;
const OUT_W = 640;
const OUT_H = 240; // gallery tile, 8:3
const HERO = 2;
const TEXT = ["Watch", "this", "incredible", "trick"];
const doc = CaptionDocSchema.parse({
  version: 2,
  language: "en",
  words: TEXT.map((t, i) => ({ id: `w${i}`, text: t, startMs: 150 + i * GAP, endMs: 150 + i * GAP + GAP - 30, ...(i === HERO ? { emphasis: "hero" } : {}) })),
});
const durationMs = 150 + TEXT.length * GAP + 500;
const wordAt = (i: number, f = 0.55) => 150 + i * GAP + Math.round((GAP - 30) * f);

const ffmpeg = RenderInternals.getExecutablePath({ type: "ffmpeg", indent: false, logLevel: "error", binariesDirectory: null });

mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: resolve("src/entry.ts"), onProgress: () => undefined });
const browser = await openBrowser("chrome");
const looks = LOOKS.filter((l) => !only || only.split(",").includes(l.id));
const manifest: Record<string, { still: string; clip: string }> = {};

for (const look of looks) {
  const tpl = getTemplate(look.templateId);
  const layout = tpl.layout;
  const oneWord = layout === "word" || tpl.fixedWordsPerCard === 1;
  const backdrop = BACKDROP;
  const placed = resolveStyle({ ...look.style, maxWidth: oneWord ? 0.9 : 0.36, safeBox: { top: 0.04, bottom: 0.04, left: 0.04, right: 0.04 }, position: { x: 0.5, y: 0.5 } });
  const style = { ...placed, ...(layout === "metal-script" ? { exit: { type: "none" as const, durationMs: 0 } } : {}) };
  // the whole phrase on one card (one word at a time for word-by-word looks)
  const settings = { ...look.settings, maxWordsPerCard: oneWord ? 1 : TEXT.length, maxLines: 3, maxCharsPerLine: 16 };
  const inputProps = { src: null, media: { width: W, height: H, fps: FPS, durationMs, rotation: 0 }, doc, style, settings, mode: "burn", backdrop };
  const composition = await selectComposition({ serveUrl, id: "CaptionedVideo", inputProps, puppeteerInstance: browser });
  const frameAt = (ms: number) => Math.round((ms / 1000) * FPS);

  // signature moment: the key word for one-word looks, otherwise the last word (whole card visible, effect running)
  // (the metal + script look writes its key word on for ~0.6 s: wait until it is fully written)
  const heroMs = oneWord ? wordAt(HERO, 0.6) : layout === "metal-script" ? wordAt(TEXT.length - 1, 1) + 200 : wordAt(TEXT.length - 1, layout === "karaoke" ? 0.55 : 0.7);
  // (renderStill draws the composition's own props, so they're swapped in too)
  // the crop frames the caption itself: decorations that run across the whole video (a frame's guide lines) are
  // hidden while measuring, then drawn in the tile
  const cropProps = { ...inputProps, style: { ...style, templateOptions: { ...style.templateOptions, guideLines: false } } };
  const shot = async (ms: number, file: string) => {
    await renderStill({ composition: { ...composition, props: cropProps }, serveUrl, output: file, frame: frameAt(ms), inputProps: cropProps, puppeteerInstance: browser, imageFormat: "png" });
    const { info } = await sharp(file).trim({ background: backdrop, threshold: 22 }).toBuffer({ resolveWithObject: true });
    return { left: -(info.trimOffsetLeft ?? 0), top: -(info.trimOffsetTop ?? 0), width: info.width, height: info.height };
  };
  const png = join(outDir, `${look.id}.png`);
  const tmp = join(outDir, `${look.id}.tmp.png`);
  let box = await shot(heroMs, png);
  // crop box = the union over every word's moment, so the looping clip never runs out of frame
  for (let i = 0; i < TEXT.length; i++) {
    const b = await shot(wordAt(i), tmp);
    const r = Math.max(box.left + box.width, b.left + b.width);
    const btm = Math.max(box.top + box.height, b.top + b.height);
    box = { left: Math.min(box.left, b.left), top: Math.min(box.top, b.top), width: 0, height: 0 };
    box.width = r - box.left;
    box.height = btm - box.top;
  }
  rmSync(tmp);

  // pad, then grow to the tile's aspect around the caption's centre (clamped to the frame)
  const pad = Math.round(Math.max(box.height * 0.28, 24));
  let cw = box.width + pad * 2;
  let ch = box.height + pad * 2;
  if (cw / ch > OUT_W / OUT_H) ch = Math.round(cw * (OUT_H / OUT_W));
  else cw = Math.round(ch * (OUT_W / OUT_H));
  cw = Math.min(W, cw);
  ch = Math.min(H, ch);
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const crop = { left: Math.round(Math.min(W - cw, Math.max(0, cx - cw / 2))), top: Math.round(Math.min(H - ch, Math.max(0, cy - ch / 2))), width: cw, height: ch };

  await renderStill({ composition, serveUrl, output: png, frame: frameAt(heroMs), inputProps, puppeteerInstance: browser, imageFormat: "png" });
  await sharp(png).extract(crop).resize(OUT_W, OUT_H, { fit: "contain", background: backdrop }).webp({ quality: 86 }).toFile(join(outDir, `${look.id}.webp`));
  rmSync(png);
  if (stillsOnly) {
    console.log(`${look.id}: still`);
    continue;
  }

  // clip: the whole phrase, same crop, small and silent, loops cleanly
  const raw = join(outDir, `${look.id}.raw.mp4`);
  const mp4 = join(outDir, `${look.id}.mp4`);
  await renderMedia({ composition, serveUrl, codec: "h264", outputLocation: raw, inputProps, puppeteerInstance: browser, crf: 16, muted: true, pixelFormat: "yuv420p" });
  const ff = spawnSync(ffmpeg, ["-y", "-loglevel", "error", "-i", raw, "-vf", `crop=${crop.width}:${crop.height}:${crop.left}:${crop.top},scale=${OUT_W}:${OUT_H}`, "-c:v", "libx264", "-crf", "28", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", mp4], { encoding: "utf8" });
  rmSync(raw);
  if (ff.status !== 0) throw new Error(`ffmpeg failed for ${look.id}: ${ff.stderr}`);
  manifest[look.id] = { still: `/looks/${look.id}.webp`, clip: `/looks/${look.id}.mp4` };
  console.log(`${look.id}: still ${statSync(join(outDir, `${look.id}.webp`)).size >> 10} KB, clip ${statSync(mp4).size >> 10} KB`);
}
await browser.close({ silent: true });
if (!only && !stillsOnly) writeFileSync(join(outDir, "index.json"), JSON.stringify(manifest, null, 2));
