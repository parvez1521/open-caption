import { newId } from "@capseasy/shared";
import { saveAsset, type MediaAssetRecord } from "./mediaStore";
import { REVERSED_ASSET_PREFIX } from "./segmentView";

/**
 * Reverse + freeze-frame production (Run 2, Worker D).
 *
 * Both features are MEDIA PLUMBING, not rendering (STUDIO-ARCHITECTURE.md §3.2 decision C):
 * they manufacture a new device-local media-bin asset with Mediabunny, and the composition
 * then references that asset as an ordinary source. Nothing here decides what a frame looks
 * like, and nothing is uploaded — the produced assets live in the same IndexedDB media bin as
 * every other imported file, with the same device-local honesty rules as image overlays.
 *
 * The pure parts (range remap, chunk windows, audio channel reversal, asset naming/metadata)
 * are exported separately from the Mediabunny glue so they are unit-testable without a real
 * video. Mediabunny itself is loaded with a dynamic import inside the glue functions, so
 * importing this module for its pure helpers never pulls the media stack into a test or a
 * first paint. API used (mediabunny 1.47.0, verified against the installed dist types):
 *   Input({ source: new BlobSource(blob), formats: ALL_FORMATS }),
 *   input.getPrimaryVideoTrack() / getPrimaryAudioTrack() / computeDuration(),
 *   new VideoSampleSink(track).samples(startS, endS) / .getSample(tS),
 *   VideoSample.clone() / setTimestamp() / draw(ctx, …) / close(),
 *   new AudioSampleSink(track).samples(startS, endS), AudioSample.toAudioBuffer(),
 *   new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() }),
 *   output.addVideoTrack(new VideoSampleSource({ codec: "avc", bitrate: QUALITY_HIGH })),
 *   output.addAudioTrack(new AudioBufferSource({ codec: "aac", bitrate: 128_000 })),
 *   output.start() / output.finalize(), target.buffer.
 */

/* ------------------------------------------------------------------ */
/* pure parts                                                          */
/* ------------------------------------------------------------------ */

/**
 * Remap a source range onto the reversed copy of the same source: the reversed file's time
 * runs backwards, so the piece that was [in, out] of a source of length D lives at
 * [D − out, D − in] in the reversed file. Bounds are clamped into [0, D] and the result
 * always has a positive span (a degenerate remap is a caller error, surfaced by the clamp
 * keeping at least 1 ms rather than producing an invalid segment).
 */
export function remapRangeToReversed(
  sourceDurationMs: number,
  sourceInMs: number,
  sourceOutMs: number,
): { sourceInMs: number; sourceOutMs: number } {
  const d = Math.max(0, Math.round(sourceDurationMs));
  const inMs = Math.min(Math.max(0, Math.round(sourceInMs)), d);
  const outMs = Math.min(Math.max(inMs, Math.round(sourceOutMs)), d);
  const rIn = d - outMs;
  const rOut = d - inMs;
  return { sourceInMs: rIn, sourceOutMs: Math.max(rIn + 1, rOut) };
}

/**
 * The source time shown at a timeline position inside a segment: the segment's source
 * in-point plus the timeline offset scaled by the playback rate (a still's pseudo-span
 * maps 1:1 and its rate is 1 by definition, so the same formula holds).
 */
export function sourceMsAtTimeline(
  seg: { sourceInMs: number; startMs: number; playbackRate?: number },
  timelineMs: number,
): number {
  const rate = seg.playbackRate && seg.playbackRate > 0 ? seg.playbackRate : 1;
  return Math.round(seg.sourceInMs + Math.max(0, timelineMs - seg.startMs) * rate);
}

/** One processing window of the source, in seconds-agnostic ms. */
export interface ChunkWindow {
  startMs: number;
  endMs: number;
}

/**
 * Split [0, durationMs] into consecutive windows of at most `chunkMs`, returned in REVERSE
 * order (last window first): a reversed output is written front-to-back, and its first
 * frames come from the END of the source, so processing walks the source backwards one
 * bounded window at a time instead of holding the whole decoded file in memory.
 */
export function reverseChunkWindows(durationMs: number, chunkMs = 4000): ChunkWindow[] {
  const d = Math.max(0, Math.round(durationMs));
  const step = Math.max(100, Math.round(chunkMs));
  const windows: ChunkWindow[] = [];
  for (let start = 0; start < d; start += step) windows.push({ startMs: start, endMs: Math.min(d, start + step) });
  return windows.reverse();
}

/**
 * Reverse the frame order of decoded PCM channel data (frame = one sample across all
 * channels at the same instant; channels stay in their own lanes). Returns new arrays;
 * the inputs are not mutated. This is how a chunk of audio is reversed before it is
 * handed to the output as an AudioBuffer.
 */
export function reverseChannelData(channels: readonly Float32Array[]): Float32Array[] {
  return channels.map((ch) => {
    const out = new Float32Array(ch.length);
    for (let i = 0; i < ch.length; i++) out[i] = ch[ch.length - 1 - i]!;
    return out;
  });
}

/** Name for a reversed conform in the media bin; the Timeline's "Reversed" badge keys off it. */
export function reversedAssetName(sourceName: string): string {
  return `${REVERSED_ASSET_PREFIX}${sourceName || "video"}`;
}

/** Name for a freeze-frame still in the media bin. */
export function freezeAssetName(sourceName: string, atMs: number): string {
  const base = (sourceName || "video").replace(/\.[^.]+$/, "");
  return `${base} — freeze at ${Math.max(0, Math.round(atMs))}ms.png`;
}

/** The media-bin record shape for a produced segment asset (bytes + probed facts). */
export function segmentAssetRecord(input: {
  projectId: string;
  kind: "video" | "image";
  name: string;
  blob: Blob;
  durationMs: number | null;
  width: number | null;
  height: number | null;
}): MediaAssetRecord {
  return {
    id: newId(),
    projectId: input.projectId,
    kind: input.kind,
    name: input.name,
    mime: input.blob.type || (input.kind === "video" ? "video/mp4" : "image/png"),
    size: input.blob.size,
    durationMs: input.durationMs,
    width: input.width,
    height: input.height,
    blob: input.blob,
    thumb: null,
    peaks: null,
    createdAt: Date.now(),
  };
}

/** Store a produced asset in the project's media bin and return the stored record. */
export async function storeSegmentAsset(input: Parameters<typeof segmentAssetRecord>[0]): Promise<MediaAssetRecord> {
  const record = segmentAssetRecord(input);
  await saveAsset(record);
  return record;
}

/* ------------------------------------------------------------------ */
/* Mediabunny glue                                                     */
/* ------------------------------------------------------------------ */

/**
 * Produce a reversed copy of a whole video blob: an MP4 whose video frames play backwards
 * and whose audio (when the source has a decodable audio track) is reversed too.
 *
 * How: the source is walked in bounded windows from its end to its start
 * (reverseChunkWindows). Inside one window, decoded VideoSamples from a VideoSampleSink are
 * buffered (that window only), then written in reverse order to a VideoSampleSource with
 * each sample's timestamp remapped to `duration − (timestamp + duration)`; the window's
 * audio samples are concatenated into PCM, frame-reversed (reverseChannelData) and written
 * through an AudioBufferSource, which appends buffers sequentially — matching the video's
 * backwards walk. Output is an in-memory BufferTarget, so very long / large sources can run
 * out of memory: that failure surfaces as the thrown error, never a partial "success".
 *
 * Progress is the share of the source duration whose windows have been fully written.
 */
export async function reverseVideoBlob(
  blob: Blob,
  opts: { onProgress?: (fraction: number) => void; chunkMs?: number } = {},
): Promise<Blob> {
  const mb = await import("mediabunny");
  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
  const videoTrack = await input.getPrimaryVideoTrack().catch(() => null);
  if (!videoTrack) throw new Error("That video has no picture track to reverse.");
  const audioTrack = await input.getPrimaryAudioTrack().catch(() => null);
  const durationS = await input.computeDuration().catch(() => Number.NaN);
  if (!Number.isFinite(durationS) || durationS <= 0) throw new Error("Couldn't read that video's length, so it can't be reversed here.");
  const durationMs = Math.round(durationS * 1000);

  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.Mp4OutputFormat(), target });
  const videoSource = new mb.VideoSampleSource({ codec: "avc", bitrate: mb.QUALITY_HIGH });
  output.addVideoTrack(videoSource);
  let audioSource: InstanceType<typeof mb.AudioBufferSource> | null = null;
  if (audioTrack) {
    audioSource = new mb.AudioBufferSource({ codec: "aac", bitrate: 128_000 });
    output.addAudioTrack(audioSource);
  }
  await output.start();

  const videoSink = new mb.VideoSampleSink(videoTrack);
  const audioSink = audioTrack ? new mb.AudioSampleSink(audioTrack) : null;
  const windows = reverseChunkWindows(durationMs, opts.chunkMs);
  let processedMs = 0;
  try {
    for (const win of windows) {
      const startS = win.startMs / 1000;
      const endS = win.endMs / 1000;
      // --- video: buffer this window's decoded samples, then write them backwards ---
      const samples: InstanceType<typeof mb.VideoSample>[] = [];
      for await (const sample of videoSink.samples(startS, endS)) samples.push(sample);
      try {
        for (let i = samples.length - 1; i >= 0; i--) {
          const sample = samples[i]!;
          const outTs = durationS - (sample.timestamp + sample.duration);
          const toWrite = sample.clone();
          toWrite.setTimestamp(Math.max(0, outTs));
          await videoSource.add(toWrite, { keyFrame: i === samples.length - 1 });
          toWrite.close();
        }
      } finally {
        for (const s of samples) s.close();
      }
      // --- audio: concatenate this window's PCM, reverse its frames, append it ---
      if (audioSink && audioSource) {
        const buffers: AudioBuffer[] = [];
        for await (const sample of audioSink.samples(startS, endS)) {
          try { buffers.push(sample.toAudioBuffer()); } finally { sample.close(); }
        }
        if (buffers.length > 0) {
          const sampleRate = buffers[0]!.sampleRate;
          const channels = buffers[0]!.numberOfChannels;
          const totalFrames = buffers.reduce((n, b) => n + b.length, 0);
          if (totalFrames > 0) {
            const joined: Float32Array[] = Array.from({ length: channels }, () => new Float32Array(totalFrames));
            let offset = 0;
            for (const b of buffers) {
              for (let c = 0; c < channels; c++) joined[c]!.set(b.getChannelData(c), offset);
              offset += b.length;
            }
            const reversed = reverseChannelData(joined);
            const outBuffer = new AudioBuffer({ length: totalFrames, numberOfChannels: channels, sampleRate });
            for (let c = 0; c < channels; c++) outBuffer.copyToChannel(reversed[c] as Float32Array<ArrayBuffer>, c);
            await audioSource.add(outBuffer);
          }
        }
      }
      processedMs += win.endMs - win.startMs;
      opts.onProgress?.(Math.min(1, processedMs / durationMs));
    }
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => undefined);
    throw e instanceof Error ? e : new Error("Reversing failed on this device.");
  }
  if (!target.buffer) throw new Error("Reversing finished without producing a file. Try a shorter video.");
  return new Blob([target.buffer], { type: "video/mp4" });
}

/**
 * Extract one frame of a video blob as a PNG, via Mediabunny's VideoSampleSink (the same
 * decode stack mediaProbe.ts probes with): the sample at `atMs` is drawn onto a canvas at
 * its display size and encoded as PNG. Throws an honest error when no frame can be decoded
 * at that time — callers surface it, never a placeholder still.
 */
export async function extractFramePng(blob: Blob, atMs: number): Promise<Blob> {
  const mb = await import("mediabunny");
  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack().catch(() => null);
  if (!track) throw new Error("That video has no picture track to take a frame from.");
  const sink = new mb.VideoSampleSink(track);
  const sample = await sink.getSample(Math.max(0, atMs) / 1000).catch(() => null);
  if (!sample) throw new Error("Couldn't decode a frame at that point in the video.");
  try {
    const width = Math.max(2, sample.displayWidth || track.displayWidth || 2);
    const height = Math.max(2, sample.displayHeight || track.displayHeight || 2);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser couldn't make a still image here.");
    sample.draw(ctx, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("This browser couldn't make a still image here."))), "image/png");
    });
  } finally {
    sample.close();
  }
}
