"use client";

/**
 * On-device thumbnails for clip cards: seek a hidden <video> to each clip's
 * first moment and draw the frame to a small canvas. A clip whose frame
 * can't be captured (codec, seek failure) simply gets no entry — the card
 * renders its labelled placeholder instead. No frame ever leaves the device,
 * and no image is ever faked: a missing thumbnail is shown as missing.
 */
export async function captureClipThumbnails(
  sourceUrl: string | null,
  items: readonly { key: string; atMs: number }[],
  onProgress?: (done: number, total: number) => void,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!sourceUrl || items.length === 0) return out;
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.preload = "auto";
  video.playsInline = true;
  video.src = sourceUrl;
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;
  const ctx = canvas.getContext("2d");
  if (!ctx) return out;

  const seek = (ms: number) =>
    new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("seek timeout")), 8000);
      video.onseeked = () => {
        clearTimeout(t);
        resolve();
      };
      video.onerror = () => {
        clearTimeout(t);
        reject(new Error("decode error"));
      };
      video.currentTime = Math.max(0, ms) / 1000;
    });

  try {
    await new Promise<void>((resolve, reject) => {
      if (video.readyState >= 1) return resolve();
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("The source video could not be read."));
    });
    let done = 0;
    for (const item of items) {
      try {
        await seek(item.atMs + 250);
        // cover-fit the frame into 320×180
        const vw = video.videoWidth || 16;
        const vh = video.videoHeight || 9;
        const scale = Math.max(canvas.width / vw, canvas.height / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        ctx.drawImage(video, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
        out[item.key] = canvas.toDataURL("image/jpeg", 0.72);
      } catch {
        /* no thumbnail for this clip — the card shows its placeholder */
      }
      done += 1;
      onProgress?.(done, items.length);
    }
  } catch {
    /* no thumbnails at all — cards show placeholders */
  } finally {
    video.removeAttribute("src");
    video.load();
  }
  return out;
}
