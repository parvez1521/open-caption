/**
 * The source video's current frame, for the few layouts that composite against the picture itself (the difference
 * blend look, pack/premium-a-difference.tsx).
 *
 * Only the in-browser exporter needs it: @remotion/web-renderer redraws the DOM on a canvas element by element and
 * ignores mix-blend-mode, so a blend has to be computed in a <canvas> from the video's pixels. The Player and the
 * server renderer paint the DOM natively and blend with CSS, so they never use this.
 *
 * CaptionedVideo creates one bus while rendering in the browser, feeds it from the video layer's `onVideoFrame`
 * (@remotion/media's <Video> hands over each frame as an ImageBitmap that is CLOSED right after the callback, so
 * listeners must copy or draw it synchronously) and provides it through VideoFrameContext. Everywhere else the
 * context is null.
 */
import { createContext } from "react";

export type VideoFrameListener = (frame: CanvasImageSource) => void;

export class VideoFrameBus {
  private listeners = new Set<VideoFrameListener>();
  /** frames handed over so far */
  count = 0;

  /** pass as the video's `onVideoFrame` (stable identity: the video component never re-subscribes) */
  readonly emit = (frame: CanvasImageSource): void => {
    this.count++;
    for (const l of this.listeners) l(frame);
  };

  subscribe(fn: VideoFrameListener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
}

export const VideoFrameContext = createContext<VideoFrameBus | null>(null);

/** Intrinsic size of a frame source, or null when it has no picture. */
export function frameSourceSize(src: CanvasImageSource): { w: number; h: number } | null {
  if (typeof HTMLVideoElement !== "undefined" && src instanceof HTMLVideoElement) return src.readyState >= 2 && src.videoWidth > 0 ? { w: src.videoWidth, h: src.videoHeight } : null;
  if (typeof HTMLImageElement !== "undefined" && src instanceof HTMLImageElement) return src.complete && src.naturalWidth > 0 ? { w: src.naturalWidth, h: src.naturalHeight } : null;
  if (typeof VideoFrame !== "undefined" && src instanceof VideoFrame) return { w: src.displayWidth, h: src.displayHeight };
  const s = src as { width?: unknown; height?: unknown };
  const w = typeof s.width === "number" ? s.width : 0;
  const h = typeof s.height === "number" ? s.height : 0;
  return w > 0 && h > 0 ? { w, h } : null;
}

/** object-fit: contain of a w x h picture in a W x H frame (how the video layer places the video) */
export function containRect(w: number, h: number, W: number, H: number) {
  const k = Math.min(W / w, H / h);
  return { x: (W - w * k) / 2, y: (H - h * k) / 2, w: w * k, h: h * k };
}
