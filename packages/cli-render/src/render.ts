/**
 * Server-side rendering with Remotion: the exact CaptionedVideo composition the CaptionsEasy studio previews and
 * exports, rendered by headless Chrome on this machine.
 */
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { cpus } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { serveFile } from "@capseasy/companion/src/media-server";
import { exportDimensions } from "@capseasy/shared";
import { buildCaptions } from "../../cli/src/captions";
import { CaptionsEasyError } from "../../cli/src/errors";
import { existingFile } from "../../cli/src/fsutil";
import { probeMedia } from "../../cli/src/node/media";
import { cacheDir } from "../../cli/src/node/paths";
import type { CaptionsProps, RenderOptions, RenderResult, TranscribeOptions, Transcript } from "../../cli/src/types";

/** Transcription is a separate optional add-on, loaded only when no words are given. */
async function transcribe(video: string, opts: TranscribeOptions): Promise<Transcript> {
  const pkg = "captionseasy-transcribe";
  let mod: { transcribe: (v: string, o: TranscribeOptions) => Promise<Transcript> };
  try {
    mod = await import(/* webpackIgnore: true */ pkg);
  } catch (e) {
    if ((e as { code?: string }).code === "ERR_MODULE_NOT_FOUND" && String((e as Error).message).includes(pkg)) {
      throw new CaptionsEasyError("ADDON_MISSING", "No words were given, and transcribing speech needs the optional add-on captionseasy-transcribe: `npm i captionseasy-transcribe`. Or pass words (--words words.json).", { addon: pkg, install: `npm i ${pkg}` });
    }
    throw e;
  }
  return mod.transcribe(video, opts);
}

/** Slow machines / cold video decoders need more than Remotion's 30 s default per delayRender. */
const FRAME_TIMEOUT_MS = 120_000;

/** templates drawn with mix-blend-mode against the video */
const BLEND_TEMPLATES = new Set(["pack_difference"]);

let sitePromise: Promise<string> | null = null;

/**
 * The Remotion site (bundled composition). The published package ships it pre-bundled in dist/site, so users never
 * need webpack; from the monorepo sources it is bundled once into the cache.
 */
export function getSite(quiet?: boolean): Promise<string> {
  sitePromise ??= (async () => {
    // dist/site, seen from dist/*.mjs or from a shared chunk in dist/chunks/
    const candidates = [process.env.CAPTIONSEASY_SITE, fileURLToPath(new URL("./site", import.meta.url)), fileURLToPath(new URL("../site", import.meta.url))].filter(Boolean) as string[];
    for (const c of candidates) if (existsSync(join(c, "index.html"))) return c;
    const entryPoint = fileURLToPath(new URL("../../compositions/src/entry.ts", import.meta.url)); // monorepo sources (dev only)
    if (!existsSync(entryPoint)) throw new CaptionsEasyError("RENDER_FAILED", "The bundled caption composition (dist/site) is missing from this install. Reinstall captionseasy.");
    if (!quiet) process.stderr.write("captionseasy: bundling the caption composition (dev mode)...\n");
    const { bundle } = await import("@remotion/bundler");
    return bundle({ entryPoint, outDir: join(cacheDir(), "dev-site"), onProgress: () => undefined });
  })().catch((e) => {
    sitePromise = null;
    throw e;
  });
  return sitePromise;
}

const defaultOut = (video: string, mode: "burn" | "overlay", fmt: "mov" | "webm") => {
  const stem = join(dirname(video), basename(video, extname(video)));
  return mode === "burn" ? `${stem}.captioned.mp4` : `${stem}.captions.${fmt}`;
};

/**
 * Caption a local video. Transcribes it first when no words are given, then renders either the video with captions
 * burned in (MP4, original audio) or a transparent captions-only overlay sized to the video (ProRes 4444 .mov or
 * VP9-alpha .webm) to lay over it in any editor.
 */
export async function render(opts: RenderOptions): Promise<RenderResult> {
  const video = existingFile(opts.video, "Video");
  const mode = opts.mode ?? "burn";
  if (mode !== "burn" && mode !== "overlay") throw new CaptionsEasyError("BAD_ARGS", `mode must be "burn" or "overlay" (got ${JSON.stringify(mode)}).`);
  const fmt = opts.overlayFormat ?? (opts.out && extname(opts.out).toLowerCase() === ".webm" ? "webm" : "mov");
  if (fmt !== "mov" && fmt !== "webm") throw new CaptionsEasyError("BAD_ARGS", `overlayFormat must be "mov" or "webm" (got ${JSON.stringify(fmt)}).`);
  const out = resolve(opts.out ?? defaultOut(video, mode, fmt));
  const info = await probeMedia(video);
  if (!info.hasVideo || !info.width || !info.height) throw new CaptionsEasyError("NO_VIDEO", `${video} has no video track.`);

  // words: given, from a transcript, or transcribed now
  let words = opts.words ?? opts.transcript?.words;
  let language = opts.transcript?.language;
  let transcribeMs: number | undefined;
  if (!words) {
    const t = await transcribe(video, { language: opts.language, quiet: opts.quiet, onProgress: (f) => opts.onProgress?.(f, "transcribe") });
    words = t.words;
    language = t.language;
    transcribeMs = t.elapsedMs;
  }

  // validate everything before starting a browser
  const props: CaptionsProps = buildCaptions({ words, look: opts.look, overrides: opts.overrides, settings: opts.settings, language: language === "auto" ? undefined : language, durationMs: info.durationMs || undefined });

  // looks that blend with the picture (difference) have no picture to blend with in a transparent overlay
  if (mode === "overlay" && BLEND_TEMPLATES.has(props.style.templateId)) {
    props.warnings.push(`${props.look.name} (#${props.look.number}) blends with the video picture; an overlay has no picture, so it renders as plain text. Use mode "burn" for this look.`);
  }

  const { ensureBrowser, renderMedia, selectComposition } = await import("@remotion/renderer");
  const started = performance.now();
  await ensureBrowser({
    logLevel: "error",
    onBrowserDownload: () => {
      if (!opts.quiet) process.stderr.write("captionseasy: downloading a headless Chrome for rendering (one time)...\n");
      return { version: null, onProgress: () => undefined };
    },
  });
  const serveUrl = await getSite(opts.quiet);
  const media = mode === "burn" ? await serveFile(video) : null;
  mkdirSync(dirname(out), { recursive: true });
  try {
    // export resolution/fps (when requested): the composition is authored at the target size/rate via
    // the output override — same mechanism the companion render job uses. No override = source size/rate.
    const outDims = opts.resolution ? exportDimensions(info.width, info.height, opts.resolution) : null;
    const inputProps = {
      src: media?.url ?? null,
      media: { width: info.width, height: info.height, fps: info.fps, durationMs: info.durationMs, rotation: 0 },
      ...(outDims ? { outputWidth: outDims.width, outputHeight: outDims.height } : {}),
      ...(opts.fps ? { outputFps: opts.fps } : {}),
      doc: props.doc,
      style: props.style,
      settings: props.settings,
      mode,
    };
    const id = mode === "burn" ? "CaptionedVideo" : "CaptionsOverlay";
    const composition = await selectComposition({ serveUrl, id, inputProps, timeoutInMilliseconds: FRAME_TIMEOUT_MS, logLevel: "error" });
    const common = {
      // renderMedia draws composition.props: pass the real ones in
      composition: { ...composition, props: inputProps },
      serveUrl,
      inputProps,
      outputLocation: out,
      overwrite: true,
      timeoutInMilliseconds: FRAME_TIMEOUT_MS,
      concurrency: opts.concurrency ?? Math.max(1, Math.floor(cpus().length / 2)),
      logLevel: "error" as const,
      onProgress: ({ progress }: { progress: number }) => opts.onProgress?.(progress, "render"),
    };
    if (mode === "burn") {
      await renderMedia({ ...common, codec: "h264", crf: 18, pixelFormat: "yuv420p" });
    } else if (fmt === "mov") {
      await renderMedia({ ...common, codec: "prores", proResProfile: "4444", pixelFormat: "yuva444p10le", imageFormat: "png", muted: true });
    } else {
      await renderMedia({ ...common, codec: "vp9", pixelFormat: "yuva420p", imageFormat: "png", muted: true });
    }
    if (!existsSync(out) || statSync(out).size === 0) throw new CaptionsEasyError("RENDER_FAILED", "The renderer produced an empty file.");
    return {
      out,
      mode,
      durationMs: Math.round((composition.durationInFrames / composition.fps) * 1000),
      width: composition.width,
      height: composition.height,
      fps: composition.fps,
      look: props.look,
      words: props.doc.words.length,
      renderMs: Math.round(performance.now() - started),
      ...(transcribeMs !== undefined ? { transcribeMs } : {}),
      warnings: props.warnings,
    };
  } catch (e) {
    if (existsSync(out) && statSync(out).size === 0) rmSync(out, { force: true });
    if (e instanceof CaptionsEasyError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    const hint = /No frame found at position/.test(msg) ? " The video has frames the decoder cannot reach (common after cutting with ffmpeg -c copy). Re-encode it (e.g. ffmpeg -i in.mp4 -c:v libx264 -c:a aac out.mp4) or render an --overlay instead." : "";
    throw new CaptionsEasyError("RENDER_FAILED", `Rendering failed: ${msg.split("\n")[0]}${hint}`, { cause: msg.slice(0, 2000) });
  } finally {
    await media?.close();
  }
}
