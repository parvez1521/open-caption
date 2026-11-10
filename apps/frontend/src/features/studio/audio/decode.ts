/**
 * decode — Mediabunny audio decoding for the mix (Phase 4 Run 3, 4.8).
 *
 * PINNED INTERFACE (the preview worker and mixdown both depend on these signatures):
 *   decodeAudioRange(blob, range | null, targetRate?) -> Promise<{ channels: [L, R], sampleRate } | null>
 *   decodeAudioPeaks(blob, hopMs?) -> Promise<Float32Array | null>
 *
 * Browser module: it imports Mediabunny statically, but touches nothing DOM-ish at
 * import time. Decoding goes through Input + BlobSource + ALL_FORMATS +
 * AudioSampleSink (mediabunny 1.47, verified against the installed dist types:
 * sink.samples(startTimestamp, endTimestamp) yields AudioSamples in presentation
 * order; each sample exposes copyTo(dest, { planeIndex, format: "f32-planar" }),
 * which is used instead of toAudioBuffer() so no AudioBuffer/Web Audio object is
 * needed). Any failure — no audio track, undecodable codec, corrupt file — resolves
 * to null; callers treat null as "this source contributes silence".
 */
import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from "mediabunny";
import { MIX_HOP_MS, peaksFromChannels } from "./mixMath";
import { resampleLinear } from "./dsp";

export interface DecodedAudio {
  channels: [Float32Array, Float32Array];
  sampleRate: number;
}

interface DecodedChunk {
  /** presentation timestamp, seconds (source timeline) */
  timestamp: number;
  /** per-source-channel planar f32 data */
  planes: Float32Array[];
  numberOfFrames: number;
}

/**
 * Decode a blob's primary audio track to stereo f32 PCM.
 *
 * - `range` limits decoding to [startMs, endMs) of the SOURCE timeline (the sink is
 *   asked for exactly that window — only the requested range is decoded); null
 *   decodes the whole track. Returned samples are placed relative to the range
 *   start (or the track start when range is null), so sample 0 of the result is
 *   the range's first instant.
 * - Channels: mono is duplicated to L/R; >2 channels downmix by taking ch0 → L and
 *   ch1 → R (extra channels are ignored — documented stereo reduction).
 * - The result is resampled (linear) to `targetRate` (default 48000) when the
 *   source rate differs, and `sampleRate` in the result is the target rate.
 * - Returns null when the blob has no audio track or decoding fails.
 */
export async function decodeAudioRange(
  blob: Blob,
  range: { startMs: number; endMs: number } | null,
  targetRate = 48000,
): Promise<DecodedAudio | null> {
  let input: Input | null = null;
  try {
    input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const track = await input.getPrimaryAudioTrack().catch(() => null);
    if (!track) return null;

    const startS = range ? Math.max(0, range.startMs) / 1000 : undefined;
    const endS = range ? Math.max(0, range.endMs) / 1000 : undefined;
    const rangeStartS = startS ?? 0;

    const sink = new AudioSampleSink(track);
    const chunks: DecodedChunk[] = [];
    let sourceRate = 0;
    let maxEndS = rangeStartS;
    for await (const sample of sink.samples(startS, endS)) {
      try {
        if (!(sample.numberOfFrames > 0) || sample.numberOfChannels === 0) continue;
        sourceRate = sample.sampleRate;
        const planes: Float32Array[] = [];
        for (let c = 0; c < sample.numberOfChannels; c++) {
          const size = sample.allocationSize({ planeIndex: c, format: "f32-planar" });
          const buffer = new ArrayBuffer(size);
          sample.copyTo(buffer, { planeIndex: c, format: "f32-planar" });
          planes.push(new Float32Array(buffer));
        }
        chunks.push({ timestamp: sample.timestamp, planes, numberOfFrames: sample.numberOfFrames });
        maxEndS = Math.max(maxEndS, sample.timestamp + sample.duration);
      } finally {
        sample.close();
      }
    }
    if (sourceRate <= 0) {
      // A track that yielded no samples: silence of the requested span (or empty).
      const length = range ? Math.round(((range.endMs - range.startMs) / 1000) * targetRate) : 0;
      return { channels: [new Float32Array(Math.max(0, length)), new Float32Array(Math.max(0, length))], sampleRate: targetRate };
    }

    const totalSeconds = range ? Math.max(0, (range.endMs - range.startMs) / 1000) : Math.max(0, maxEndS - rangeStartS);
    const totalFrames = Math.ceil(totalSeconds * sourceRate);
    const left = new Float32Array(totalFrames);
    const right = new Float32Array(totalFrames);
    for (const chunk of chunks) {
      const offset = Math.round((chunk.timestamp - rangeStartS) * sourceRate);
      const lPlane = chunk.planes[0]!;
      const rPlane = chunk.planes[1] ?? chunk.planes[0]!;
      for (let i = 0; i < chunk.numberOfFrames; i++) {
        const at = offset + i;
        if (at < 0) continue;
        if (at >= totalFrames) break;
        left[at] = lPlane[i] ?? 0;
        right[at] = rPlane[i] ?? 0;
      }
    }

    if (sourceRate !== targetRate) {
      return {
        channels: [resampleLinear(left, sourceRate, targetRate), resampleLinear(right, sourceRate, targetRate)],
        sampleRate: targetRate,
      };
    }
    return { channels: [left, right], sampleRate: sourceRate };
  } catch {
    return null;
  } finally {
    input?.dispose();
  }
}

/**
 * Peaks (one absolute peak per hop) of a blob's whole audio track, or null when it
 * has no decodable audio. Decodes the full track via decodeAudioRange — acceptable
 * for audio-sized files; for a video blob only its audio track is decoded.
 */
export async function decodeAudioPeaks(blob: Blob, hopMs = MIX_HOP_MS): Promise<Float32Array | null> {
  const decoded = await decodeAudioRange(blob, null);
  if (!decoded) return null;
  return peaksFromChannels(decoded.channels, decoded.sampleRate, hopMs);
}
