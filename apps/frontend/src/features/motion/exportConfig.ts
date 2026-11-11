import type { MotionConfig } from "@capseasy/motion";
import { defaultAvatarAssetId, defaultAvatarForTemplate, defaultVoiceMemberAvatars } from "@capseasy/motion";
import { ProjectSettingsSchema, emptyDoc, exportDimensionsForAspect, type OverlayItem } from "@capseasy/shared";
import type { CaptionedVideoInput } from "@capseasy/compositions";
import { buildMotionOverlayItem, type MotionAssetRef } from "./addToProject";
import { socialStageFor } from "@/features/studio/panels/socialStage";
import type { BrowserExportContainer, BrowserExportVideoCodec, BrowserVideoExportJob } from "@/features/studio/browserExport";

/**
 * Standalone Motion Studio export: ONE configured animation, rendered on its own — no project
 * is created or saved anywhere. The render input is a minimal in-memory CaptionedVideo
 * composition (no video segments, an empty caption doc, and a single social overlay item
 * spanning the whole duration, centred and scale-fitted to the canvas) painted over a SOLID
 * background colour, rendered through the same in-browser machinery as Studio MP4 exports
 * (features/studio/browserExport). The background is the composition's `backdrop`: with
 * `src: null` and mode "burn", CaptionedVideo paints exactly that colour behind the overlays
 * (verified at the composition level in packages/compositions overlayOnly tests).
 *
 * The "webm-alpha" format is the ONE transparent in-browser format: it renders with
 * `backdrop: null` (the composition then paints nothing behind the overlay) through the web
 * renderer's alpha path, and is offered behind the capability probe (alphaCapability.ts,
 * probe v2: VideoEncoder present + VP9 `alpha: "keep"` supported at the chosen size; the
 * probe's other checks are diagnostics, and a withheld option names the gate stage in the
 * section's note line). After encoding, the run helper demands a post-encode alpha
 * verification (alphaVerify.ts, injected as a dep) — without a passing verification
 * NOTHING is saved: an opaque file is never delivered labelled transparent. The copy
 * constants below are the single source the UI renders.
 */

/* ---------------- honest copy (pinned by tests) ---------------- */

/** The chroma option's label — exact wording, do not paraphrase. */
export const CHROMA_BACKGROUND_LABEL = "Solid colour background for chroma-key removal in your editor";
/** Shown wherever the MP4/WebM format choice is made. */
export const SOLID_BACKGROUND_FORMAT_NOTE = "These files have a solid background";
/** The one honest line about transparency in the in-browser export section. */
export const TRANSPARENT_EXPORT_NOTE = "Transparent export: available in this browser as WebM when the alpha checks pass (the option then appears above), and via the desktop Companion app (MOV/WebM with alpha).";
/** Shown when a transparent render's post-encode alpha check fails — the file is NOT saved. */
export const TRANSPARENT_VERIFY_FAILED_MESSAGE = "The render finished without real transparency, so nothing was downloaded — an opaque file is never labelled transparent. Try a solid-background format, or the Companion app.";

/**
 * Default chroma colour: #00FF00, pure green. Keyers separate on the green channel, and a
 * pure 0/255/0 has maximum distance from every skin tone and from the graphics' own palettes
 * (no template accent is pure green), so it keys cleanest; it is also the flat green this
 * app already uses for chroma-key assets. (#00B140 is a broadcast-safe variant some tools
 * prefer, but its red/blue residue keys worse against the dark card backgrounds.)
 */
export const DEFAULT_CHROMA_COLOR = "#00FF00";
export const DARK_BACKGROUND_COLOR = "#141412";
export const BLACK_BACKGROUND_COLOR = "#000000";
export const WHITE_BACKGROUND_COLOR = "#FFFFFF";

/* ---------------- option model ---------------- */

export type MotionExportBackgroundId = "chroma" | "dark" | "black" | "white";

export interface MotionExportBackground {
  id: MotionExportBackgroundId;
  label: string;
  /** the fixed colour for non-chroma backgrounds; null = the user's chroma colour */
  color: string | null;
}

export const MOTION_EXPORT_BACKGROUNDS: MotionExportBackground[] = [
  { id: "chroma", label: CHROMA_BACKGROUND_LABEL, color: null },
  { id: "dark", label: "Dark", color: DARK_BACKGROUND_COLOR },
  { id: "black", label: "Black", color: BLACK_BACKGROUND_COLOR },
  { id: "white", label: "White", color: WHITE_BACKGROUND_COLOR },
];

export type MotionExportAspect = "1:1" | "16:9" | "9:16";
export const MOTION_EXPORT_ASPECTS: MotionExportAspect[] = ["1:1", "16:9", "9:16"];

export type MotionExportShortEdge = 720 | 1080;
export const MOTION_EXPORT_SHORT_EDGES: MotionExportShortEdge[] = [720, 1080];

/**
 * Frame rates. 60 fps is honest HERE (unlike upconverting a recorded video): the animation
 * is a pure function of time — OverlayView derives every phase from (frame / fps), so a 60 fps
 * render draws real intermediate frames that a 30 fps render never shows. The generic browser
 * renderer already authors compositions at an arbitrary output fps, so both rates ship.
 */
export const MOTION_EXPORT_FPS_OPTIONS: { fps: 30 | 60; hint: string }[] = [
  { fps: 30, hint: "Standard frame rate." },
  { fps: 60, hint: "Smoother motion — the animation is drawn fresh at every frame, so 60 fps adds real in-between frames." },
];

export type MotionExportFormatId = "mp4" | "webm" | "webm-alpha";

export interface MotionExportFormat {
  id: MotionExportFormatId;
  label: string;
  ext: "mp4" | "webm";
  container: BrowserExportContainer;
  videoCodec: BrowserExportVideoCodec;
  /** true ONLY for webm-alpha — gated behind the alpha probe + post-encode verification */
  transparent: boolean;
}

export const MOTION_EXPORT_FORMATS: MotionExportFormat[] = [
  { id: "mp4", label: "MP4", ext: "mp4", container: "mp4", videoCodec: "h264", transparent: false },
  { id: "webm", label: "WebM", ext: "webm", container: "webm", videoCodec: "vp9", transparent: false },
  { id: "webm-alpha", label: "WebM — transparent background", ext: "webm", container: "webm", videoCodec: "vp9", transparent: true },
];

export interface MotionExportSelection {
  background: MotionExportBackgroundId;
  /** the user's chroma colour (used when background === "chroma") */
  chromaColor: string;
  aspect: MotionExportAspect;
  shortEdge: MotionExportShortEdge;
  fps: 30 | 60;
  format: MotionExportFormatId;
}

export const DEFAULT_MOTION_EXPORT_SELECTION: MotionExportSelection = {
  background: "chroma",
  chromaColor: DEFAULT_CHROMA_COLOR,
  aspect: "9:16",
  shortEdge: 1080,
  fps: 30,
  format: "mp4",
};

const HEX6 = /^#[0-9a-fA-F]{6}$/;

/** The solid colour a selection paints, as a #rrggbb CSS colour (invalid chroma input falls back to the default green). */
export function motionExportBackgroundColor(selection: Pick<MotionExportSelection, "background" | "chromaColor">): string {
  if (selection.background === "chroma") return HEX6.test(selection.chromaColor) ? selection.chromaColor : DEFAULT_CHROMA_COLOR;
  return MOTION_EXPORT_BACKGROUNDS.find((b) => b.id === selection.background)?.color ?? BLACK_BACKGROUND_COLOR;
}

/** Output size for an aspect + short edge, via the ONE shared short-edge rule every export path uses. */
export function motionExportDimensions(aspect: MotionExportAspect, shortEdge: MotionExportShortEdge): { width: number; height: number } {
  return exportDimensionsForAspect(aspect, shortEdge === 720 ? "720p" : "1080p");
}

/**
 * The item scale that fits the graphic's preview stage box inside the canvas with a small
 * margin, at the composition's own scale factor (sc = short edge / 1080). The stage box
 * (socialStageFor) is the established framing window for the graphic, so fitting the BOX
 * guarantees the graphic itself never clips, at any aspect — the same framing the customize
 * preview shows, centred. Clamped to the OverlayItem schema's scale range.
 */
export const EXPORT_FIT_MARGIN = 0.92;
export function fitScaleForCanvas(variant: MotionConfig["variant"], width: number, height: number): number {
  const stage = socialStageFor(variant);
  const sc = Math.min(width, height) / 1080;
  const fit = Math.min((width * EXPORT_FIT_MARGIN) / (stage.width * sc), (height * EXPORT_FIT_MARGIN) / (stage.height * sc));
  return Math.min(4, Math.max(0.25, Math.round(fit * 1000) / 1000));
}

/* ---------------- composition builder ---------------- */

export interface BuiltMotionExport {
  width: number;
  height: number;
  fps: 30 | 60;
  durationMs: number;
  /** the solid colour painted behind the overlay, or the literal "transparent" for webm-alpha */
  backgroundColor: string;
  /** true for the webm-alpha format: backdrop null + renderer alpha path + post-encode verify */
  transparent: boolean;
  /** the single overlay item: spans [0, durationMs), centred, scale-fitted */
  item: OverlayItem;
  /** the in-memory render input — never saved as a project */
  input: CaptionedVideoInput;
  filename: string;
  container: BrowserExportContainer;
  videoCodec: BrowserExportVideoCodec;
  format: MotionExportFormatId;
}

/**
 * Build everything a standalone render needs from the current config + export selection.
 * Pure (aside from the item's random id): same config + selection = same composition.
 * `asset`/`assetSrc` carry the graphic's avatar/QR image exactly like Add-to-project does.
 *
 * Default avatar (owner order 2026-11-12): when the user uploaded no image and the
 * template has a default avatar photo, the export carries it through the SAME
 * overlayAssets path a user upload takes — the item gets the synthetic asset id
 * `default-avatar-<variant>` and the photo URL as its resolved src — so the MP4/WebM
 * shows the photo, not the initial disc. A user asset always wins. Voice-card gets
 * its three default member photos via overlayMemberAssets. The QR slot never gets
 * a default (a fake QR would look scannable).
 */
export function buildMotionExport(
  config: MotionConfig,
  selection: MotionExportSelection,
  asset?: MotionAssetRef | null,
  assetSrc?: string,
): BuiltMotionExport {
  const { width, height } = motionExportDimensions(selection.aspect, selection.shortEdge);
  const format = MOTION_EXPORT_FORMATS.find((f) => f.id === selection.format) ?? MOTION_EXPORT_FORMATS[0]!;
  // Transparent: no backdrop at all — with src null the composition then paints nothing behind
  // the overlay, so the renderer's alpha path carries real transparency into the WebM.
  const backgroundColor = format.transparent ? "transparent" : motionExportBackgroundColor(selection);
  const defaultAvatarSrc = !asset && !assetSrc ? defaultAvatarForTemplate(config.variant) : null;
  const defaultAsset: MotionAssetRef | null = defaultAvatarSrc
    ? { id: defaultAvatarAssetId(config.variant), name: "Default avatar photo" }
    : null;
  const effectiveAsset = asset ?? defaultAsset;
  const effectiveAssetSrc = assetSrc ?? defaultAvatarSrc ?? undefined;
  const base = buildMotionOverlayItem(config, 0, effectiveAsset);
  const item: OverlayItem = { ...base, x: 0.5, y: 0.5, scale: fitScaleForCanvas(config.variant, width, height) };
  const input: CaptionedVideoInput = {
    src: null,
    media: { width, height, fps: selection.fps, durationMs: config.durationMs, rotation: 0 },
    doc: emptyDoc(),
    settings: ProjectSettingsSchema.parse({ overlays: [item] }),
    mode: "burn",
    backdrop: format.transparent ? null : backgroundColor,
    videoEngine: "media",
    overlays: [item],
    ...(effectiveAsset && effectiveAssetSrc ? { overlayAssets: { [effectiveAsset.id]: effectiveAssetSrc } } : {}),
    ...(config.variant === "voice-card" ? { overlayMemberAssets: { [item.id]: defaultVoiceMemberAvatars() } } : {}),
  };
  return {
    width,
    height,
    fps: selection.fps,
    durationMs: config.durationMs,
    backgroundColor,
    transparent: format.transparent,
    item,
    input,
    filename: `${config.variant}-${width}x${height}.${format.ext}`,
    container: format.container,
    videoCodec: format.videoCodec,
    format: format.id,
  };
}

/* ---------------- run + state (the export hook's testable core) ---------------- */

export type MotionExportState =
  | { status: "idle" }
  | { status: "rendering"; progress: number }
  | { status: "done"; filename: string; sizeBytes: number }
  | { status: "error"; message: string };

export type MotionExportEvent =
  | { type: "start" }
  | { type: "progress"; fraction: number }
  | { type: "success"; filename: string; sizeBytes: number }
  | { type: "failure"; message: string }
  | { type: "cancelled" };

export const initialMotionExportState: MotionExportState = { status: "idle" };

/**
 * Export state machine. Cancel returns to idle (a cancelled render is not an error and
 * shows no error copy); a failure keeps the renderer's real message for the error state;
 * progress is clamped and only moves while rendering.
 */
export function motionExportReducer(state: MotionExportState, event: MotionExportEvent): MotionExportState {
  switch (event.type) {
    case "start":
      return { status: "rendering", progress: 0 };
    case "progress":
      if (state.status !== "rendering") return state;
      return { status: "rendering", progress: Math.min(1, Math.max(0, event.fraction)) };
    case "success":
      return { status: "done", filename: event.filename, sizeBytes: event.sizeBytes };
    case "failure":
      return { status: "error", message: event.message };
    case "cancelled":
      return { status: "idle" };
  }
}

export interface RunStandaloneExportDeps {
  render: (job: BrowserVideoExportJob) => Promise<Blob>;
  save: (blob: Blob, filename: string) => void;
  /**
   * Post-encode alpha verification (alphaVerify.ts in the app). REQUIRED for a transparent
   * build: without it — or when it returns false — the export FAILS and nothing is saved.
   */
  verify?: (blob: Blob) => Promise<boolean>;
}

/**
 * Preload one image URL (decode it) — resolves false instead of rejecting when
 * the URL cannot load, so a failed preload never blocks an export.
 */
async function preloadImageOk(src: string): Promise<boolean> {
  if (typeof window === "undefined" || typeof Image === "undefined") return true;
  try {
    const img = new Image();
    const loaded = new Promise<boolean>((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
    });
    img.src = src;
    // never stall an export on a slow image: after 2 s proceed as if loaded
    // (the render may still catch it); a hard load failure still resolves
    // false fast via onerror and gets dropped by the caller.
    const timedOut = new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 2000));
    return await Promise.race([loaded, timedOut]);
  } catch {
    return false;
  }
}

/**
 * Run one standalone export: render the built composition, then download it via the same
 * saveBlob helper the Studio export uses. Cancellation is cooperative through the
 * AbortSignal (the renderer checks it between frames, exactly like the Studio path):
 * an abort mid-render resolves as `{ cancelled: true }` and saves NOTHING; a real render
 * failure is rethrown with its original message so the UI can show it verbatim.
 *
 * Before rendering, every overlay image URL is preloaded (decoded): the social
 * avatar draws through a plain <img>, which Remotion's delayRender never waits
 * for, so without this a cold export could capture frames before the photo
 * arrives. A URL that fails to preload is DROPPED from the input first — the
 * render then falls back to the initial-letter disc (and a dropped default
 * avatar also drops the item's assetId) instead of painting a broken image.
 *
 * Transparent builds additionally pass the encoded blob through deps.verify BEFORE saving:
 * if the file does not provably contain real alpha, the run throws
 * TRANSPARENT_VERIFY_FAILED_MESSAGE and the opaque file is never delivered.
 */
export async function runStandaloneExport(args: {
  built: BuiltMotionExport;
  deps: RunStandaloneExportDeps;
  signal: AbortSignal;
  onProgress?: (fraction: number) => void;
}): Promise<{ cancelled: true } | { cancelled: false; filename: string; sizeBytes: number }> {
  const { built, deps, signal, onProgress } = args;
  // preload + fail-safe drop (see the header note above)
  const assetUrls = Object.entries(built.input.overlayAssets ?? {});
  if (assetUrls.length) {
    const ok = await Promise.all(assetUrls.map(([, src]) => preloadImageOk(src)));
    const kept: Record<string, string> = {};
    assetUrls.forEach(([id, src], i) => { if (ok[i]) kept[id] = src; });
    built.input.overlayAssets = Object.keys(kept).length ? kept : undefined;
    if (built.item.assetId && !kept[built.item.assetId]) {
      delete built.item.assetId;
      delete built.item.assetName;
    }
  }
  const memberUrls = Object.entries(built.input.overlayMemberAssets ?? {});
  if (memberUrls.length) {
    const keptMembers: Record<string, string[]> = {};
    for (const [itemId, srcs] of memberUrls) {
      const ok = await Promise.all(srcs.map((src) => preloadImageOk(src)));
      const kept = srcs.filter((_, i) => ok[i]);
      if (kept.length) keptMembers[itemId] = kept;
    }
    built.input.overlayMemberAssets = Object.keys(keptMembers).length ? keptMembers : undefined;
  }
  let blob: Blob;
  try {
    blob = await deps.render({
      input: built.input,
      width: built.width,
      height: built.height,
      fps: built.fps,
      durationMs: built.durationMs,
      quality: "high",
      container: built.container,
      videoCodec: built.videoCodec,
      transparent: built.transparent,
      signal,
      onProgress,
    });
  } catch (e) {
    if (signal.aborted) return { cancelled: true };
    throw e;
  }
  if (signal.aborted) return { cancelled: true };
  if (built.transparent) {
    let verified = false;
    if (deps.verify) {
      try {
        verified = await deps.verify(blob);
      } catch {
        verified = false; // a verification that cannot run is a failed verification
      }
    }
    if (!verified) throw new Error(TRANSPARENT_VERIFY_FAILED_MESSAGE);
  }
  deps.save(blob, built.filename);
  return { cancelled: false, filename: built.filename, sizeBytes: blob.size };
}
