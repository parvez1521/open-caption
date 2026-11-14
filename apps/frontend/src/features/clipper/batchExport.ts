"use client";

import {
  CaptionDocSchema,
  ProjectSettingsSchema,
  effectiveDurationMs,
  type CaptionStyleV2,
  type ProjectSettings,
} from "@capseasy/shared";
import { applyLook, getLook, getTemplate, loadFontFamily, resolveStyle } from "@capseasy/templates";
import type { CaptionedVideoInput } from "@capseasy/compositions";
import { studioService, type StudioData } from "@/services/studio";
import { getLocalVideo } from "@/features/upload/localVideos";
import { readCompositionSettings } from "@/features/studio/stageC";
import { canvasDims, canvasOf } from "@/features/studio/canvas";
import { buildEditorComposition } from "@/features/studio/compositionDoc";
import { toComposition } from "@/features/studio/composition";
import { mixIsActive } from "@/features/studio/audio/mixPlan";
import { buildSegmentAssetUrls, pickStudioDurationMs, type SegmentLike } from "@/features/studio/segmentView";
import { listProjectAssets } from "@/features/studio/mediaStore";
import { exportDimsWithCanvas } from "@/features/studio/exportOptions";
import { exportMp4InBrowser, saveBlob } from "@/features/studio/browserExport";
import { DEFAULT_LOOK } from "@/features/studio/useStudio";

/**
 * Batch export for the AI Clipping Studio: render several clip projects to
 * MP4 one after another, each through the SAME in-browser pipeline the
 * Studio's Export modal uses — the input object assembled here mirrors
 * StudioPage's own assembly field for field (same doc/style/settings
 * resolution, same canvas maths, same duration truth, same output-size and
 * fps rules), so a batch file is the file the Studio would have produced.
 *
 * Minutes: each clip reserves its minutes on the server before rendering
 * (the server computes them from the video row and the project settings)
 * and settles after the file is saved; a failed clip refunds its hold.
 * The same honest limit as every browser render applies: the server
 * cannot observe a render on the device, so a modified client can skip
 * the reserve call.
 *
 * Failure discipline: strictly sequential (one encoder at a time); every
 * clip is isolated — a failure is recorded against that clip and the batch
 * continues; the failed clip can be retried on its own. Two honest refusals:
 *  - a project whose video bytes are not on THIS device cannot render here
 *    (media never leaves the device in this product);
 *  - a project with an ACTIVE custom sound mix is not batch-exported: the
 *    mix is applied as a post-render step in the Studio's modal, and a
 *    silently-wrong-audio file is worse than no file. It is reported as
 *    "open in the Studio to export with its sound mix". Freshly created
 *    clips never have a mix; this only bites clips the user later mixed.
 */

export interface ClipRenderJob {
  input: CaptionedVideoInput;
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  title: string;
  /** revoke every object URL this job created (video + assets) */
  dispose: () => void;
}

/** Thrown (as a per-clip failure) when the clip's sound mix needs the Studio's export. */
export class ClipMixError extends Error {
  constructor() {
    super("This clip has a custom sound mix — open it in the Studio to export it with its sound.");
    this.name = "ClipMixError";
  }
}

/** Resolve a project's style + settings exactly as useStudio's first-open initialisation does. */
function resolveProjectState(data: StudioData): { style: CaptionStyleV2; settings: ProjectSettings } {
  const p = data.project;
  const parsedSettings = ProjectSettingsSchema.parse(p.settings_json ?? {});
  const resolvedComposition = readCompositionSettings({
    settingsComposition: parsedSettings.composition,
    compositionJson: p.composition_json,
  });
  let style: CaptionStyleV2;
  let settings = parsedSettings;
  if (p.style_json) {
    style = resolveStyle(p.style_json);
  } else {
    const look = getLook(DEFAULT_LOOK)!;
    const applied = applyLook(look);
    style = applied.style;
    settings = ProjectSettingsSchema.parse({ ...parsedSettings, ...applied.settings });
  }
  if (resolvedComposition.source === "column") {
    settings = ProjectSettingsSchema.parse({ ...settings, composition: resolvedComposition.settings });
  }
  return { style, settings };
}

/**
 * Assemble one clip project's render job headlessly. Throws Error with a
 * user-readable message on any honest refusal (no doc, no video on device,
 * active mix, unparseable state).
 */
export async function loadClipRenderJob(projectId: string): Promise<ClipRenderJob> {
  const data = await studioService.getStudio(projectId);
  const doc = data.document.doc ? CaptionDocSchema.parse(data.document.doc) : null;
  if (!doc) throw new Error("This clip has no captions yet — open it in the Studio first.");
  const video = data.video;
  if (!video) throw new Error("This clip has no video.");

  const { style, settings } = resolveProjectState(data);

  const width = video.width || 1080;
  const height = video.height || 1920;
  const fps = video.fps || 30;
  const sourceDurationMs = video.durationMs || Math.max(0, ...doc.words.map((w) => w.endMs)) + 500;
  const storedSegments = (settings.composition?.videoSegments ?? []) as SegmentLike[];
  const durationMs = pickStudioDurationMs({
    storedSegments,
    fallbackDurationMs: video.durationMs ? effectiveDurationMs(sourceDurationMs, settings.clipRange) : sourceDurationMs,
  });
  const canvasSettings = canvasOf(settings);
  const canvasSize = canvasDims(canvasSettings, width, height);

  // sound-mix gate (fresh clips never trip it; user-mixed clips are refused honestly)
  try {
    const view = toComposition({
      media: { videoId: video.id, filename: video.filename, size: video.size, width, height, fps, durationMs },
      doc,
      pages: [],
      settings,
      durationMs,
    });
    const comp = buildEditorComposition({ view, settings, sourceDurationMs });
    if (mixIsActive(comp)) throw new ClipMixError();
  } catch (e) {
    if (e instanceof ClipMixError) throw e;
    throw new Error("This clip's sound setup couldn't be checked — open it in the Studio to export.");
  }

  const urls: string[] = [];
  const own = (blob: Blob): string => {
    const url = URL.createObjectURL(blob);
    urls.push(url);
    return url;
  };
  try {
    const localBlob = await getLocalVideo(video.id);
    const src = localBlob ? own(localBlob) : video.url;
    if (!src) throw new Error("The video file isn't on this device — open the clip in the Studio and re-attach it there.");

    const assets = await listProjectAssets(projectId).catch(() => []);
    const overlayAssets: Record<string, string> = {};
    for (const o of settings.overlays) {
      if ((o.kind !== "image" && o.kind !== "social") || !o.assetId || overlayAssets[o.assetId]) continue;
      const asset = assets.find((a) => a.id === o.assetId);
      if (asset) overlayAssets[o.assetId] = own(asset.blob);
    }
    const segmentAssets = buildSegmentAssetUrls(storedSegments, assets, (a) => own(a.blob));

    // the style's fonts, so caption metrics in the render match the Studio's
    const families = [style.fontId, style.hero.fontId ?? "", ...getTemplate(style.templateId).fonts].filter(Boolean);
    await Promise.all(families.map((f) => loadFontFamily(f).catch(() => undefined)));

    const input: CaptionedVideoInput = {
      src,
      media: { width: canvasSize.width, height: canvasSize.height, fps, durationMs, rotation: 0 },
      doc,
      style,
      settings,
      mode: "burn",
      videoAdjust: settings.videoAdjust,
      overlays: settings.overlays,
      overlayAssets,
      segmentAssets,
    };
    const outDims = exportDimsWithCanvas({ width, height }, canvasSettings, settings.exportSettings.resolution);
    return {
      input,
      width: outDims.width,
      height: outDims.height,
      fps: settings.exportSettings.fps,
      durationMs,
      title: data.project.title,
      dispose: () => urls.forEach((u) => URL.revokeObjectURL(u)),
    };
  } catch (e) {
    urls.forEach((u) => URL.revokeObjectURL(u));
    throw e;
  }
}

export const clipFileName = (title: string): string =>
  `${(title || "captionit").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "captionit"}.mp4`;

export interface BatchExportDeps {
  loadJob: (projectId: string) => Promise<ClipRenderJob>;
  render: (job: ClipRenderJob, onProgress: (fraction: number) => void, signal?: AbortSignal) => Promise<Blob>;
  save: (blob: Blob, name: string) => void;
  /**
   * Minutes billing for one clip. The default talks to the server
   * (reserve before render, settle after); tests inject a stub. A
   * reserve failure (minutes used up) fails just that clip, like any
   * other per-clip failure, and the batch continues.
   */
  billing?: BatchBillingDeps;
}

export interface BatchBillingDeps {
  reserve: (projectId: string, body: { exportId: string; kind: "mp4" }) => Promise<{ minutes: number }>;
  settle: (projectId: string, body: { exportId: string; kind: "mp4"; outcome: "completed" | "failed"; actualMinutes?: number }) => Promise<unknown>;
}

const defaultBatchBilling: BatchBillingDeps = {
  reserve: (projectId, body) => studioService.reserveBrowserExport(projectId, body),
  settle: (projectId, body) => studioService.settleBrowserExport(projectId, body),
};

export const defaultBatchDeps: BatchExportDeps = {
  loadJob: loadClipRenderJob,
  render: (job, onProgress, signal) =>
    exportMp4InBrowser({
      input: job.input,
      width: job.width,
      height: job.height,
      fps: job.fps,
      durationMs: job.durationMs,
      quality: "balanced",
      signal,
      onProgress,
    }),
  save: saveBlob,
};

export type BatchEvent =
  | { type: "start"; projectId: string; index: number; total: number }
  | { type: "progress"; projectId: string; fraction: number }
  | { type: "done"; projectId: string; name: string; size: number }
  | { type: "failed"; projectId: string; message: string };

export interface BatchItemResult {
  projectId: string;
  ok: boolean;
  name?: string;
  size?: number;
  message?: string;
}

/** Export one clip project end to end (load → reserve → render → save → settle). Throws on failure. */
export async function exportClipProject(
  projectId: string,
  opts: { onProgress?: (fraction: number) => void; signal?: AbortSignal; deps?: BatchExportDeps } = {},
): Promise<{ name: string; size: number }> {
  const deps = opts.deps ?? defaultBatchDeps;
  const billing = deps.billing ?? defaultBatchBilling;
  const job = await deps.loadJob(projectId);
  try {
    // Minutes: the server computes them from the video row and the
    // project settings — the client never supplies a number. A failed
    // reserve (minutes used up) fails just this clip, and the batch
    // continues with the rest.
    const exportId = crypto.randomUUID();
    const reservation = await billing.reserve(projectId, { exportId, kind: "mp4" });
    try {
      const blob = await deps.render(job, opts.onProgress ?? (() => undefined), opts.signal);
      const name = clipFileName(job.title);
      deps.save(blob, name);
      // Completion charges the reserved minutes. A failed settle just
      // means the hold is swept later — the file is already saved.
      await billing.settle(projectId, { exportId, kind: "mp4", outcome: "completed", actualMinutes: reservation.minutes }).catch(() => {});
      return { name, size: blob.size };
    } catch (e) {
      // A failed render refunds the whole hold.
      await billing.settle(projectId, { exportId, kind: "mp4", outcome: "failed" }).catch(() => {});
      throw e;
    }
  } finally {
    job.dispose();
  }
}

/**
 * Run a batch strictly sequentially with per-clip failure isolation: the
 * returned array has one result per item, in item order, and a failure never
 * stops the remaining clips.
 */
export async function runBatchExport(
  projectIds: readonly string[],
  opts: { onEvent?: (event: BatchEvent) => void; signal?: AbortSignal; deps?: BatchExportDeps } = {},
): Promise<BatchItemResult[]> {
  const results: BatchItemResult[] = [];
  for (let i = 0; i < projectIds.length; i++) {
    const projectId = projectIds[i]!;
    opts.onEvent?.({ type: "start", projectId, index: i, total: projectIds.length });
    try {
      const done = await exportClipProject(projectId, {
        signal: opts.signal,
        deps: opts.deps,
        onProgress: (fraction) => opts.onEvent?.({ type: "progress", projectId, fraction }),
      });
      results.push({ projectId, ok: true, name: done.name, size: done.size });
      opts.onEvent?.({ type: "done", projectId, name: done.name, size: done.size });
    } catch (e) {
      const message = e instanceof Error ? e.message : "The export failed on this device.";
      results.push({ projectId, ok: false, message });
      opts.onEvent?.({ type: "failed", projectId, message });
    }
  }
  return results;
}
