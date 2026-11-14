/**
 * Renders the landing-page hero corridor clips with the REAL pipeline: open-licensed talking-head footage is cut
 * and cropped to the corridor card shape, transcribed by local whisper.cpp (the Companion's install), normalized
 * by caption-engine, then rendered by the CaptionedVideo composition in a Viral/Popular look.
 *   pnpm --filter @capseasy/compositions hero-clips --src <dir with the source .webm files> [--filter <name>]
 * Output: apps/frontend/public/hero/<name>.mp4 (muted loop) + <name>.webp (poster) + credits.json.
 * With --data, writes only the UNcaptioned clip (<name>.raw.mp4) and its transcript (<name>.json) instead, for the
 * landing page's live demos, which caption them in the browser with the same composition.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { openBrowser, renderMedia, selectComposition } from "@remotion/renderer";
import { toCaptions, transcribe } from "@remotion/install-whisper-cpp";
import { fromWhisperCaptions } from "@motion-ai/caption-engine/core";
import { CaptionDocSchema } from "@capseasy/shared";
import { applyLook, getLook, getTemplate } from "@capseasy/templates";
import { serveFile } from "../../companion/src/media-server";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const srcDir = resolve(arg("src") ?? ".");
const only = arg("filter");
const dataOnly = process.argv.includes("--data");
const outDir = resolve("../../apps/frontend/public/hero");
const work = join(outDir, ".work");

// the corridor card is 18:25
const W = 432;
const H = 600;
const FPS = 30;
const MAX_MS = 6500;

const whisperData = join(process.env.LOCALAPPDATA ?? join(homedir(), ".local", "share"), "capseasy", "Data");

/** Title cards (black question slides in the Peru interviews) are skipped by starting after them.
 *  language: what is actually spoken (forcing "en" on Spanish makes whisper TRANSLATE, so captions stop matching lips).
 *  faceX: horizontal centre of the speaker in the source (0–1). from: where to start looking for speech (s). */
const CLIPS: { name: string; file: string; language?: string; look: string; captionY?: number; faceX: number; faceY?: number; from: number; credit: string; license: string; url: string }[] = [
  { name: "sol", file: "sol.webm", language: "es", look: "staggered_splash", faceX: 0.57, from: 57, credit: "Peru Testimonial - Sol Luciana", license: "CC BY 3.0", url: "https://commons.wikimedia.org/wiki/File:Peru_Testimonial_-_Sol_Luciana.webm" },
  { name: "gianna", file: "gianna.webm", language: "es", look: "hormozi_box", faceX: 0.56, from: 88, credit: "Peru Testimonial - Gianna Garcia", license: "CC BY 3.0", url: "https://commons.wikimedia.org/wiki/File:Peru_Testimonial_-_Gianna_Garcia.webm" },
  { name: "jesse", file: "jesse.webm", language: "es", look: "glow_stack_classic", faceX: 0.67, from: 67, credit: "Peru Testimonial - Jesse Vilela", license: "CC BY 3.0", url: "https://commons.wikimedia.org/wiki/File:Peru_Testimonial_-_Jesse_Vilela.webm" },
  { name: "aisha", file: "aisha.webm", look: "beast_bounce", faceX: 0.5, from: 8, credit: "Wikinights testimonial by Aisha", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Wikinights_testimonial_by_Aisha.webm" },
  { name: "rusita", file: "rusita.webm", look: "vintage_cinematic", captionY: 0.85, faceX: 0.5, from: 30, credit: "Wikipedians speak - Konkani Wikipedian Rusita Paryekar", license: "CC BY-SA 3.0", url: "https://commons.wikimedia.org/wiki/File:Wikipedians_speak_-_Konkani_Wikipedian_Rusita_Paryekar-en_1080p.webm" },
  { name: "william", file: "william.webm", look: "comic_burst", faceX: 0.5, from: 15, credit: "WIKITONGUES- William speaking English", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:WIKITONGUES-_William_speaking_English.webm" },
  { name: "daniel", file: "daniel.webm", look: "explainer", faceX: 0.5, faceY: 0.35, from: 0, credit: "Daniel speaking English", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Daniel_speaking_English.webm" },
  { name: "goldi", file: "goldi.mp4", look: "kinetic_mix", faceX: 0.5, faceY: 0.3, from: 0, credit: "Goldi speaking Kumaoni, English", license: "CC BY-SA 4.0", url: "https://wikitongues.org/videos/goldi_20250409_kfy-eng/" },
  { name: "steve", file: "steve.webm", look: "staggered_splash", faceX: 0.47, from: 0, credit: "Steve speaking English, Mandarin Chinese, Spanish, Standard Arabic, Portuguese, Russian, Japanese, French", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Steve_speaking_English,_Mandarin,_Spanish,_Arabic,_Portuguese,_Russian,_Japanese,_and_French.webm" },
  { name: "drluv", file: "drluv.webm", look: "hormozi_box", faceX: 0.58, from: 120, credit: "WIKITONGUES- DrLuv speaking English", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:WIKITONGUES-_DrLuv_speaking_English.webm" },
];

// a full ffmpeg build (Remotion's bundled one leaves out filters such as setsar/fps)
const ffmpeg = process.env.FFMPEG ?? "ffmpeg";
const ff = (args: string[]) => {
  const r = spawnSync(ffmpeg, ["-v", "error", "-y", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(" ")}`);
};
/** Display size of a source: ffmpeg auto-rotates decoded frames to the display orientation, so a
 *  stored-landscape file with rotation metadata (phone video, e.g. Goldi) is really portrait. The
 *  old code read the stored size and, for portrait sources, took the FULL height and scaled it to
 *  432x600 — a 28% horizontal stretch — while for landscape it threw away ~60% of the width
 *  around a fixed horizontal guess, which is what cut Leena's head and Kangkana's face. */
function displaySize(src: string): { w: number; h: number } {
  const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:stream_tags=rotate", "-show_entries", "stream_side_data=rotation", "-of", "json", src], { encoding: "utf8" });
  if (probe.status !== 0) throw new Error(`ffprobe failed for ${src}`);
  const stream = JSON.parse(probe.stdout).streams?.[0] as { width?: number; height?: number; tags?: { rotate?: string }; side_data_list?: { rotation?: number }[] } | undefined;
  if (!stream?.width || !stream?.height) throw new Error(`cannot read the size of ${src}`);
  const rot = Number(stream.tags?.rotate ?? stream.side_data_list?.find((s) => typeof s.rotation === "number")?.rotation ?? 0);
  const swapped = Math.abs(rot) === 90 || Math.abs(rot) === 270;
  return swapped ? { w: stream.height, h: stream.width } : { w: stream.width, h: stream.height };
}

/** Portrait card out of any source, without stretching or cutting the speaker:
 *  landscape sources keep full height and take an 18:25-wide slice around faceX;
 *  portrait sources keep full width and take an 18:25-tall slice around faceY, so the
 *  face (not the middle of the frame) lands in the card and baked-in lower-thirds fall
 *  outside the slice. */
function crop(src: string, faceX: number, faceY = 0.35) {
  const { w: iw, h: ih } = displaySize(src);
  const even = (n: number) => Math.round(n / 2) * 2;
  if (iw / ih > W / H) {
    const w = Math.min(iw, even((ih * W) / H));
    const x = Math.round(Math.max(0, Math.min(iw - w, iw * faceX - w / 2)));
    return `crop=${w}:${ih}:${x}:0,scale=${W}:${H}:flags=lanczos,setsar=1,fps=${FPS}`;
  }
  const h = Math.min(ih, even((iw * H) / W));
  const y = Math.round(Math.max(0, Math.min(ih - h, ih * faceY - h / 2)));
  return `crop=${iw}:${h}:0:${y},scale=${W}:${H}:flags=lanczos,setsar=1,fps=${FPS}`;
}

async function words(wav: string, language: string) {
  const json = await transcribe({
    inputPath: wav,
    whisperPath: join(whisperData, "whisper-bin"),
    whisperCppVersion: "1.5.5",
    model: "small",
    modelFolder: join(whisperData, "whisper-models"),
    tokenLevelTimestamps: true,
    language: language as "en",
    printOutput: false,
  });
  return fromWhisperCaptions(toCaptions({ whisperCppOutput: json }).captions);
}

mkdirSync(work, { recursive: true });
const serveUrl = await bundle({ entryPoint: resolve("src/entry.ts"), onProgress: () => undefined });
const browser = await openBrowser("chrome");
const credits: Record<string, unknown> = {};

for (const c of CLIPS.filter((c) => !only || c.name === only)) {
  const look = getLook(c.look);
  if (!look) throw new Error(`unknown look ${c.look}`);
  const src = join(srcDir, c.file);

  // 1. transcribe a generous window, then cut the clip on word boundaries so the loop starts and ends cleanly
  const probeWav = join(work, `${c.name}.probe.wav`);
  ff(["-ss", String(c.from), "-t", "16", "-i", src, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", probeWav]);
  const all = (await words(probeWav, c.language ?? "en")).filter((w) => w.text.trim());
  // start on a sentence (else a pause), end on a sentence if one finishes inside the window
  const ends = (i: number) => /[.!?]$/.test(all[i]!.text);
  let first = all.findIndex((_, i) => i > 0 && ends(i - 1) && all[i]!.startMs < 9000);
  if (first < 0) first = Math.max(0, all.findIndex((w, i) => i === 0 || w.startMs - all[i - 1]!.endMs > 250));
  const startMs = Math.max(0, all[first]!.startMs - 150);
  let inClip = all.filter((w) => w.startMs >= startMs && w.endMs <= startMs + MAX_MS);
  const lastStop = inClip.findLastIndex((w) => /[.!?]$/.test(w.text));
  if (lastStop >= 5) inClip = inClip.slice(0, lastStop + 1);
  const endMs = inClip[inClip.length - 1]!.endMs + 350;
  const durationMs = endMs - startMs;

  // 2. the clip itself, cropped to the card
  const clip = join(work, `${c.name}.mp4`);
  ff(["-ss", String(c.from + startMs / 1000), "-t", String(durationMs / 1000), "-i", src, "-vf", crop(src, c.faceX, c.faceY), "-an", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", clip]);

  // 3. caption document from the transcript, shifted to the clip's own clock
  const doc = CaptionDocSchema.parse({
    version: 2,
    language: c.language ?? "en",
    words: inClip.map((w) => ({ ...w, startMs: w.startMs - startMs, endMs: w.endMs - startMs })),
  });
  const { style: lookStyle, settings } = applyLook(look, 3); // three words per card at most (3-line looks read best this way)
  // the corridor shows these as small cards, so captions run larger than on a phone and sit in the lower third
  const style = { ...lookStyle, fontSize: lookStyle.fontSize * (getTemplate(lookStyle.templateId).layout === "stack3" ? 1.9 : 1.45), maxWidth: Math.max(lookStyle.maxWidth, 0.9), position: { x: 0.5, y: c.captionY ?? 0.7 } };

  if (dataOnly) {
    ff(["-i", clip, "-c:v", "libx264", "-crf", "27", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(outDir, `${c.name}.raw.mp4`)]);
    ff(["-ss", "0.3", "-i", clip, "-frames:v", "1", "-c:v", "libwebp", "-quality", "70", join(outDir, `${c.name}.raw.webp`)]);
    writeFileSync(join(outDir, `${c.name}.json`), JSON.stringify({ language: doc.language, durationMs, words: doc.words.map(({ id, text, startMs, endMs }) => ({ id, text, startMs, endMs })) }) + "\n");
    console.log(`${c.name} data: ${inClip.map((w) => w.text).join(" ")}`);
    continue;
  }

  // 4. render with the same composition the studio exports with
  const served = await serveFile(clip);
  try {
    const inputProps = { src: served.url, media: { width: W, height: H, fps: FPS, durationMs, rotation: 0 }, doc, style, settings: { ...settings, maxWordsPerCard: Math.min(3, settings.maxWordsPerCard ?? 3) }, mode: "burn" };
    const composition = await selectComposition({ serveUrl, id: "CaptionedVideo", inputProps, puppeteerInstance: browser });
    const rendered = join(work, `${c.name}.rendered.mp4`);
    await renderMedia({ composition, serveUrl, codec: "h264", outputLocation: rendered, inputProps, puppeteerInstance: browser, crf: 18, muted: true });
    // web delivery: small, muted, fast-start
    ff(["-i", rendered, "-an", "-c:v", "libx264", "-crf", "28", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(outDir, `${c.name}.mp4`)]);
    ff(["-ss", String(Math.min(1.2, durationMs / 2000)), "-i", rendered, "-frames:v", "1", "-c:v", "libwebp", "-quality", "70", join(outDir, `${c.name}.webp`)]);
  } finally {
    await served.close();
  }
  credits[c.name] = { title: c.credit, license: c.license, source: c.url, look: look.id, lookName: look.name, text: inClip.map((w) => w.text).join(" ") };
  console.log(`${c.name} (${look.name}): ${inClip.map((w) => w.text).join(" ")}`);
}

await browser.close({ silent: true });
if (!dataOnly) writeFileSync(join(outDir, "credits.json"), JSON.stringify(credits, null, 2) + "\n");
rmSync(work, { recursive: true, force: true });
