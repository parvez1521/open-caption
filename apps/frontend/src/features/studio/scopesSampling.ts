/**
 * A14 Colour Scopes — preview-frame sampling (Phase 8). DISPLAY-ONLY: this
 * module reads pixels out of the already-rendered preview and writes nothing
 * back — it never touches the video element's playback state, the composition
 * input, or any project/settings state.
 *
 * What the preview actually is (inspected in StudioPlayer.tsx +
 * packages/compositions CaptionedVideo.tsx): the Remotion `<Player>` renders
 * the composition as DOM, not as a canvas. The picture itself is a `<video>`
 * element (Remotion's OffthreadVideo by default, `@remotion/media`'s Video in
 * the "media" engine — both render a plain <video>), possibly several of them
 * for segment chains / the blurred backdrop chain, inside the element labelled
 * "Preview". There is no composited canvas to read, so the honest sampling
 * path is: find the largest visible <video> inside the preview region, draw
 * it to a small offscreen canvas, and read those pixels.
 *
 * Honest consequences of that path, surfaced in the UI copy:
 *  - the sample is the video frame at PREVIEW resolution (downscaled again to
 *    {@link SCOPES_SAMPLE_WIDTH}px wide here), not the full-resolution export;
 *  - captions / overlays are separate DOM painted OVER the video element, so
 *    they are not part of the measured pixels;
 *  - a cross-origin source without CORS taints the canvas: `getImageData`
 *    throws and the caller degrades to an "unavailable" note — never a fake
 *    graph.
 */

/** Downscale target for sampling: wide enough for real distributions, tiny to draw. */
export const SCOPES_SAMPLE_WIDTH = 160;

/**
 * Sampling throttle: at most one sample every 250 ms (4 Hz) while the scopes
 * are open. A 160-px frame is ~45k pixels, so each tick is sub-millisecond of
 * math; 4 Hz follows the playhead/playback closely without ever competing
 * with the editor's own ~15 Hz time feed.
 */
export const SCOPES_SAMPLE_INTERVAL_MS = 250;

export type FrameSample =
  | { kind: "frame"; pixels: Uint8ClampedArray; width: number; height: number }
  | { kind: "unavailable"; reason: string };

const unavailable = (reason: string): FrameSample => ({ kind: "unavailable", reason });

/** The on-screen size a source of `naturalWidth`×`naturalHeight` is sampled at. */
export function sampledSize(
  naturalWidth: number,
  naturalHeight: number,
  targetWidth: number = SCOPES_SAMPLE_WIDTH,
): { width: number; height: number } {
  if (naturalWidth <= 0 || naturalHeight <= 0) return { width: 0, height: 0 };
  const width = Math.max(1, Math.min(targetWidth, naturalWidth));
  return { width, height: Math.max(1, Math.round((width * naturalHeight) / naturalWidth)) };
}

const areaOf = (el: Element): number => {
  const r = el.getBoundingClientRect();
  return Math.max(0, r.width) * Math.max(0, r.height);
};

/**
 * The preview's main picture element: the largest-area `<video>` inside the
 * region labelled "Preview" (segment chains render several — the backdrop
 * copy is blurred and mostly covered, the main chain's element is the big
 * one). Falls back to the largest `<video>` in the document so a layout
 * change degrades to "some video" rather than nothing. Returns null when no
 * video is mounted at all (upload/processing stage, captions-only mode).
 */
export function findPreviewVideoElement(root: ParentNode = document): HTMLVideoElement | null {
  const preview = root.querySelector('[aria-label="Preview"]');
  const scopes: ParentNode[] = preview ? [preview, root] : [root];
  for (const scope of scopes) {
    const videos = [...scope.querySelectorAll("video")];
    if (videos.length === 0) continue;
    let best: HTMLVideoElement | null = null;
    let bestArea = -1;
    for (const v of videos) {
      const a = areaOf(v);
      if (a > bestArea) {
        bestArea = a;
        best = v;
      }
    }
    if (best) return best;
  }
  return null;
}

/**
 * Draw one video element's current frame to `canvas` (sized by this call) and
 * read its pixels. Read-only with respect to the video: it is never played,
 * paused, seeked, or re-sourced — only `drawImage` + `getImageData` run.
 * Any failure (frame not ready, no 2d context, tainted canvas) returns an
 * `unavailable` sample with the reason instead of throwing.
 */
export function sampleVideoElement(video: HTMLVideoElement, canvas: HTMLCanvasElement): FrameSample {
  if (video.videoWidth <= 0 || video.videoHeight <= 0 || video.readyState < 2) {
    return unavailable("the preview frame isn't ready yet");
  }
  const { width, height } = sampledSize(video.videoWidth, video.videoHeight);
  if (width <= 0 || height <= 0) return unavailable("the preview frame has no size yet");
  canvas.width = width;
  canvas.height = height;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext("2d", { willReadFrequently: true });
  } catch {
    ctx = null;
  }
  if (!ctx) return unavailable("this browser couldn't provide a 2d canvas to read the frame");
  try {
    ctx.drawImage(video, 0, 0, width, height);
    const image = ctx.getImageData(0, 0, width, height);
    return { kind: "frame", pixels: image.data, width, height };
  } catch (e) {
    // A cross-origin video drawn without CORS taints the canvas and
    // getImageData throws a SecurityError — say so honestly.
    if (e instanceof DOMException && e.name === "SecurityError") {
      return unavailable("the browser blocked reading this frame (the video is cross-origin)");
    }
    return unavailable(e instanceof Error ? e.message : "reading this frame failed");
  }
}

let sharedCanvas: HTMLCanvasElement | null = null;

/** Sample whatever the preview is showing right now. */
export function samplePreviewFrame(root: ParentNode = document): FrameSample {
  const video = findPreviewVideoElement(root);
  if (!video) return unavailable("no preview video is on screen for this project yet");
  if (!sharedCanvas) sharedCanvas = document.createElement("canvas");
  return sampleVideoElement(video, sharedCanvas);
}
