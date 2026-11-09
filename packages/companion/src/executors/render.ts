import { existsSync, rmSync, statSync } from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureBrowser, makeCancelSignal, renderMedia, selectComposition } from "@remotion/renderer";
import type { RenderJob } from "@capseasy/shared";
import { dirs } from "../config";
import { log } from "../log";
import { serveFile } from "../media-server";
import { downloadTo, uploadSigned } from "../transfer";
import { extOf, jobDir, mediaCacheDir, slice, type JobContext } from "./context";

/** Slow machines / cold video decoders need more than Remotion's 30 s default per delayRender. */
const FRAME_TIMEOUT_MS = 120_000;

let sitePromise: Promise<string> | null = null;

/** Bundles the shared composition once per process (the same code the browser Player runs). */
export function getSite(): Promise<string> {
  sitePromise ??= (async () => {
    // release builds ship a pre-bundled site next to cli.mjs, so users never need webpack or our sources
    const shipped = process.env.CAPSEASY_SITE ?? fileURLToPath(new URL("./site", import.meta.url));
    if (existsSync(join(shipped, "index.html"))) return shipped;
    const entryPoint = process.env.CAPSEASY_ENTRY ?? fileURLToPath(new URL("../../../compositions/src/entry.ts", import.meta.url));
    log.info("bundling caption composition...");
    const t0 = Date.now();
    // dev only: webpack-bundle our sources (the bundler is not shipped in release builds)
    const { bundle } = await import("@remotion/bundler");
    const site = await bundle({ entryPoint, outDir: join(dirs.cache, "site"), onProgress: () => undefined });
    log.info(`composition bundled in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return site;
  })().catch((e) => {
    sitePromise = null;
    throw e;
  });
  return sitePromise;
}

const OUT = {
  mp4: { ext: "mp4", mime: "video/mp4" },
  mov_alpha: { ext: "mov", mime: "video/quicktime" },
  webm_alpha: { ext: "webm", mime: "video/webm" },
  png: { ext: "png", mime: "image/png" },
} as const;

export async function runRender(ctx: JobContext) {
  const { claimed, signal, report } = ctx;
  const job = claimed.job.payload as RenderJob;
  const burn = job.format === "mp4";
  const started = Date.now();
  const dir = jobDir(claimed.job.id);
  let media: Awaited<ReturnType<typeof serveFile>> | null = null;

  try {
    let src: string | null = null;
    if (burn) {
      if (!claimed.urls.sourceGet) throw new Error("No source video URL was provided for this job.");
      const source = join(mediaCacheDir(), `${job.sourceVideoId}.${extOf(claimed.media?.mime)}`);
      await report("Downloading video", 2);
      await downloadTo(claimed.urls.sourceGet, source, { signal, onProgress: (f) => void report("Downloading video", slice(2, 12, f)) });
      media = await serveFile(source);
      src = media.url;
    }

    await report("Preparing renderer", 13);
    await ensureBrowser();
    const serveUrl = await getSite();

    const inputProps = {
      src,
      // media stays the truth about the SOURCE file; the job's width/height/fps are the chosen EXPORT
      // output (resolution + frame rate from the project's export settings, resolved by the API into
      // absolute dims), passed as the composition's output override so calculateMetadata authors the
      // composition at exactly that size/rate — including UPSCALING past the source when 2K/4K is picked.
      media: { width: claimed.media?.width || job.width, height: claimed.media?.height || job.height, fps: claimed.media?.fps || job.fps, durationMs: claimed.media?.durationMs ?? 0, rotation: 0 },
      outputWidth: job.width,
      outputHeight: job.height,
      outputFps: job.fps,
      doc: job.docSnapshot,
      style: job.style,
      settings: job.settings,
      mode: burn ? "burn" : "overlay",
    };
    const composition = await selectComposition({ serveUrl, id: burn ? "CaptionedVideo" : "CaptionsOverlay", inputProps, timeoutInMilliseconds: FRAME_TIMEOUT_MS });

    const { ext, mime } = OUT[job.format];
    const output = join(dir, `export.${ext}`);
    const { cancelSignal, cancel } = makeCancelSignal();
    signal.addEventListener("abort", () => cancel(), { once: true });

    await report("Rendering", 15);
    // trim: render only the requested frames (video, audio and captions stay in sync)
    const last = composition.durationInFrames - 1;
    const frameRange: [number, number] | undefined = job.range
      ? [Math.max(0, Math.min(last, Math.floor((job.range.startMs / 1000) * composition.fps))), Math.max(0, Math.min(last, Math.ceil((job.range.endMs / 1000) * composition.fps) - 1))]
      : undefined;
    // resolution + fps: the composition was already authored at the job's output size/rate by
    // calculateMetadata (see the output override in inputProps), so NO render-time scale is applied —
    // the old scale factor capped exports at the source size and could never upscale to 2K/4K.
    const common = { composition, serveUrl, inputProps, outputLocation: output, cancelSignal, frameRange, timeoutInMilliseconds: FRAME_TIMEOUT_MS, concurrency: Math.max(1, Math.floor(cpus().length / 2)) } as const;
    const onProgress = ({ progress }: { progress: number }) => void report("Rendering", slice(15, 88, progress));

    if (job.format === "mp4") {
      await renderMedia({ ...common, codec: "h264", crf: job.crf, pixelFormat: "yuv420p", onProgress });
    } else if (job.format === "mov_alpha") {
      await renderMedia({ ...common, codec: "prores", proResProfile: "4444", pixelFormat: "yuva444p10le", imageFormat: "png", onProgress });
    } else {
      await renderMedia({ ...common, codec: "vp8", pixelFormat: "yuva420p", imageFormat: "png", onProgress });
    }

    const size = statSync(output).size;
    if (size === 0) throw new Error("The renderer produced an empty file.");
    if (!claimed.urls.exportPut) throw new Error("No upload URL was provided for the export.");
    await report("Uploading export", 90);
    await uploadSigned(claimed.urls.exportPut, output, mime, signal);

    await ctx.api.complete(claimed.job.id, {
      kind: "render",
      path: "server-computed",
      size,
      durationMs: frameRange ? ((frameRange[1] - frameRange[0] + 1) / composition.fps) * 1000 : (composition.durationInFrames / composition.fps) * 1000,
      renderMs: Date.now() - started,
    });
  } finally {
    await media?.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
