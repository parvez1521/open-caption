import type { CaptionDoc, OverlayItem, Page, ProjectSettings } from "@capseasy/shared";

/**
 * Stage-A composition view (STUDIO-ARCHITECTURE.md §1.2): a READ-SIDE, pure synthesis of the unified
 * track/clip model from the parts the project already stores — the device video (one main clip), the
 * caption document (via its derived pages), and `settings.overlays`. Nothing here is persisted and
 * nothing here writes: caption edits keep going through `edit()` + the caption-engine ops, overlay
 * edits through `patchSettings`, and the video through the existing device attach path. The timeline
 * and the panels read this view so every surface agrees on tracks, ordering and durations; Stage B/C
 * can grow real clip storage underneath the same shape later.
 */

export interface CompositionMediaInput {
  videoId?: string | null;
  filename?: string | null;
  size?: number | null;
  width: number;
  height: number;
  fps: number;
  durationMs: number;
}

export interface CompositionInput {
  media: CompositionMediaInput | null;
  /** the stored caption document (kept for provenance; the clips derive from `pages`) */
  doc: CaptionDoc | null;
  pages: Page[];
  settings: ProjectSettings;
  /** the studio's working duration (video duration, or the caption-derived fallback) */
  durationMs: number;
}

export type CompositionTrackKind = "video" | "captions" | "text" | "graphics";

interface ClipBase {
  id: string;
  startMs: number;
  endMs: number;
  durationMs: number;
}

export interface VideoClip extends ClipBase {
  kind: "video";
  source: {
    type: "media";
    videoId: string | null;
    filename: string | null;
    size: number | null;
    width: number;
    height: number;
    fps: number;
  };
}

export interface CaptionClip extends ClipBase {
  kind: "caption";
  /** the words this derived block spans, in document order */
  wordIds: string[];
  text: string;
}

export interface OverlayClip extends ClipBase {
  kind: "text" | "shape" | "image";
  /** the stored overlay item, by reference — reads only; writes go through patchSettings */
  overlay: OverlayItem;
}

export type CompositionClip = VideoClip | CaptionClip | OverlayClip;

export interface CompositionTrack {
  kind: CompositionTrackKind;
  clips: CompositionClip[];
}

export interface Composition {
  version: 1;
  durationMs: number;
  canvas: { width: number; height: number; fps: number };
  /** always exactly these four, in this order: video, captions, text, graphics */
  tracks: CompositionTrack[];
}

const byStartThenId = (a: ClipBase & { id: string }, b: ClipBase & { id: string }) =>
  a.startMs - b.startMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function toComposition(state: CompositionInput): Composition {
  const { media, pages, settings } = state;
  const durationMs = Math.max(0, Math.round(state.durationMs || media?.durationMs || 0));
  const canvas = {
    width: media?.width || 1080,
    height: media?.height || 1920,
    fps: media?.fps || 30,
  };

  // the single main video clip (multi-clip storage is Stage C)
  const videoClips: VideoClip[] =
    media && durationMs > 0
      ? [
          {
            id: "main-video",
            kind: "video",
            startMs: 0,
            endMs: durationMs,
            durationMs,
            source: {
              type: "media",
              videoId: media.videoId ?? null,
              filename: media.filename ?? null,
              size: media.size ?? null,
              width: media.width,
              height: media.height,
              fps: media.fps,
            },
          },
        ]
      : [];

  const captionClips: CaptionClip[] = pages
    .filter((p) => p.words.length > 0)
    .map((p) => ({
      id: p.id,
      kind: "caption" as const,
      startMs: p.startMs,
      endMs: p.endMs,
      durationMs: Math.max(0, p.endMs - p.startMs),
      wordIds: p.words.map((w) => w.id),
      text: p.words.map((w) => w.text).join(" "),
    }))
    .sort(byStartThenId);

  const overlayClip = (o: OverlayItem): OverlayClip => ({
    id: o.id,
    kind: o.kind,
    startMs: o.startMs,
    endMs: o.endMs,
    durationMs: Math.max(0, o.endMs - o.startMs),
    overlay: o,
  });
  const textClips = settings.overlays.filter((o) => o.kind === "text" || o.kind === "image").map(overlayClip).sort(byStartThenId);
  const graphicsClips = settings.overlays.filter((o) => o.kind === "shape").map(overlayClip).sort(byStartThenId);

  return {
    version: 1,
    durationMs,
    canvas,
    tracks: [
      { kind: "video", clips: videoClips },
      { kind: "captions", clips: captionClips },
      { kind: "text", clips: textClips },
      { kind: "graphics", clips: graphicsClips },
    ],
  };
}

export function trackOf(comp: Composition, kind: CompositionTrackKind): CompositionTrack {
  return comp.tracks.find((t) => t.kind === kind) ?? { kind, clips: [] };
}

/** Every overlay clip (text + graphics tracks combined), in timeline order — the timeline's overlay row. */
export function overlayClipsOf(comp: Composition): OverlayClip[] {
  const clips = [...trackOf(comp, "text").clips, ...trackOf(comp, "graphics").clips] as OverlayClip[];
  return clips.sort(byStartThenId);
}

/** Overlay items of one kind, read from the composition (panels list from here, write via patchSettings). */
export function overlayItemsOf(comp: Composition | null, kind: OverlayItem["kind"]): OverlayItem[] {
  if (!comp) return [];
  return overlayClipsOf(comp)
    .filter((c) => c.kind === kind)
    .map((c) => c.overlay);
}
