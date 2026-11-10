/**
 * denoise — RNNoise noise suppression as a DERIVED ASSET (Phase 5, A12).
 *
 * LICENCE RECORD (verified at adoption, 2026-11-10): the processor is
 * `@shiguredo/rnnoise-wasm@2025.1.5` — Apache-2.0 (the SPDX `license` field in
 * its package.json AND the Apache-2.0 LICENSE file in the published tarball).
 * The WASM is a build of RNNoise itself (Xiph.Org Foundation; upstream RNNoise
 * is BSD-3-Clause per its COPYING file, which the package README points to).
 * No other candidate was adopted: `@timephy/rnnoise-wasm@1.0.0` also carries an
 * Apache-2.0 LICENSE file, but declares it only via the legacy `licenses`
 * array (no SPDX `license` field) and exposes an AudioWorklet-oriented API.
 *
 * THE ONLY PARITY-SAFE ARCHITECTURE (why this module exists in this shape):
 * RNNoise is NEVER run live — not in the preview graph, not in the export
 * mixdown. The decoded source audio is processed ONCE here into a derived WAV
 * asset in the media bin (the same derived-asset pattern as the reverse
 * conforms in segmentAssets.ts); the composition then references that asset
 * (`audio.noiseSuppressionAssetId`) and the ONE mix plan points the video
 * items at it, so preview and export consume IDENTICAL samples.
 *
 * MEASURED EVIDENCE (spike, 2026-11-10, this package + this framing/scaling):
 * - white noise only, RMS 0.144: output/input RMS ratio 0.003 (−50.7 dB).
 * - real human speech (Open Speech Repository recording OSR_us_000_0010,
 *   8 kHz upsampled to 48 kHz): RMS ratio 0.97 overall, 0.96 across
 *   speech-active 10 ms hops — speech is preserved.
 * - that speech + added white noise (RMS 0.05): pause hops drop to ratio
 *   0.12, and the processed mix's RMS (0.0419) lands on the clean speech's
 *   processed RMS (0.0428) — the noise is removed, the speech stays.
 * - LIMITATION, stated plainly: synthetic "speech-like" fixtures (stationary
 *   harmonic stacks, formant-synth tones) are NOT recognised as speech by
 *   RNNoise's VAD (mean VAD ≈ 0.06 on our synth) and are suppressed like
 *   noise. That is why the repo tests assert the real-WASM noise suppression
 *   directly, and the pipeline (framing, scaling, per-channel state) with an
 *   injected processor — no test fakes a speech-preservation number it did
 *   not measure.
 *
 * RNNoise facts this code is built on (from the package's types/README):
 * 48 kHz only, mono, frames of `frameSize` (480 samples = 10 ms), and the
 * frame floats are 16-bit-PCM scaled — callers convert −1..1 float PCM by
 * ×32768 on the way in and ÷32768 on the way out.
 */
import { newId } from "@capseasy/shared";
import { decodeAudioRange } from "./decode";
import { MIX_SAMPLE_RATE } from "./mixdown";
import type { MediaAssetRecord } from "../mediaStore";

/** One RNNoise denoise state: processes exactly `frameSize` samples per call, in place. */
export interface DenoiseFrameProcessor {
  readonly frameSize: number;
  /** Process one frame in place; returns the VAD probability 0..1. */
  processFrame(frame: Float32Array): number;
  destroy(): void;
}

/** Creates a fresh processor (one per channel — RNNoise state is per-stream). */
export type DenoiseProcessorFactory = () => Promise<DenoiseFrameProcessor>;

/** 16-bit PCM scale RNNoise frames are expressed in. */
export const RNNOISE_PCM_SCALE = 32768;

/**
 * Process ONE channel of −1..1 float PCM through a frame processor: full
 * frames only, scaled to 16-bit PCM for the processor and back. The tail
 * (fewer than `frameSize` samples) passes through UNCHANGED — under 10 ms at
 * the very end of the source, documented here rather than zero-padded into
 * the RNN. Returns a NEW array; the input is untouched.
 */
export function processChannelFrames(pcm: Float32Array, processor: DenoiseFrameProcessor): Float32Array {
  const out = new Float32Array(pcm.length);
  out.set(pcm);
  const frameSize = processor.frameSize;
  if (!(frameSize > 0)) return out;
  const frame = new Float32Array(frameSize);
  for (let off = 0; off + frameSize <= pcm.length; off += frameSize) {
    for (let i = 0; i < frameSize; i++) frame[i] = pcm[off + i]! * RNNOISE_PCM_SCALE;
    processor.processFrame(frame);
    for (let i = 0; i < frameSize; i++) out[off + i] = frame[i]! / RNNOISE_PCM_SCALE;
  }
  return out;
}

/**
 * Process stereo PCM with ONE PROCESSOR PER CHANNEL (independent RNNoise
 * states — a single shared state would cross-contaminate the channels).
 */
export async function denoiseChannels(
  channels: [Float32Array, Float32Array],
  makeProcessor: DenoiseProcessorFactory,
): Promise<[Float32Array, Float32Array]> {
  const out: [Float32Array, Float32Array] = [new Float32Array(0), new Float32Array(0)];
  for (let c = 0 as 0 | 1; c < 2; c = (c + 1) as 0 | 1) {
    const processor = await makeProcessor();
    try {
      out[c] = processChannelFrames(channels[c], processor);
    } finally {
      processor.destroy();
    }
  }
  return out;
}

let rnnoiseModulePromise: Promise<DenoiseProcessorFactory> | null = null;

/**
 * The real factory: lazily dynamic-imports the WASM package (its ~4.8 MB
 * inlined-WASM JS must never land in the first-paint bundle — it loads only
 * when a user actually asks for noise suppression) and caches the loaded
 * module; each call still creates a FRESH DenoiseState per channel.
 */
export function loadRnnoiseFactory(): Promise<DenoiseProcessorFactory> {
  if (!rnnoiseModulePromise) {
    rnnoiseModulePromise = (async () => {
      const { Rnnoise } = await import("@shiguredo/rnnoise-wasm");
      const rnnoise = await Rnnoise.load();
      return () => {
        const state = rnnoise.createDenoiseState();
        const processor: DenoiseFrameProcessor = {
          frameSize: rnnoise.frameSize,
          processFrame: (frame) => state.processFrame(frame),
          destroy: () => state.destroy(),
        };
        return Promise.resolve(processor);
      };
    })();
    // a failed load must not poison the cache — a later attempt may retry
    rnnoiseModulePromise.catch(() => { rnnoiseModulePromise = null; });
  }
  return rnnoiseModulePromise;
}

/** Encode stereo PCM as a WAV blob (Mediabunny, the same stack the mix tests round-trip). */
export async function encodeWavBlob(
  channels: [Float32Array, Float32Array],
  sampleRate: number,
): Promise<Blob> {
  const mb = await import("mediabunny");
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.WavOutputFormat(), target });
  const source = new mb.AudioSampleSource({ codec: "pcm-s16" });
  output.addAudioTrack(source);
  await output.start();
  const frames = Math.min(channels[0].length, channels[1].length);
  const CHUNK = 48000; // 1 s chunks
  try {
    for (let start = 0; start < frames; start += CHUNK) {
      const n = Math.min(CHUNK, frames - start);
      const data = new Float32Array(n * 2);
      data.set(channels[0].subarray(start, start + n), 0);
      data.set(channels[1].subarray(start, start + n), n);
      const sample = new mb.AudioSample({
        data: data.buffer as ArrayBuffer,
        format: "f32-planar",
        numberOfChannels: 2,
        sampleRate,
        timestamp: start / sampleRate,
      });
      await source.add(sample);
      sample.close();
    }
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => undefined);
    throw e;
  }
  if (!target.buffer) throw new Error("Noise suppression finished without producing a file.");
  return new Blob([target.buffer], { type: "audio/wav" });
}

/**
 * The full derived-asset pipeline: decode a source blob's audio ONCE (48 kHz
 * stereo), RNNoise-process both channels, and encode the result as a WAV
 * blob for the media bin. Returns null when the source has no decodable
 * audio track — the caller surfaces that honestly and stores nothing.
 * `makeProcessor` is the test seam; production uses the real WASM factory.
 */
/** The media-bin record for a produced noise-suppressed WAV (the segmentAssets
 *  derived-asset record pattern: bytes + probed facts, device-local). */
export function noiseSuppressedAssetRecord(input: {
  projectId: string;
  blob: Blob;
  durationMs: number | null;
}): MediaAssetRecord {
  return {
    id: newId(),
    projectId: input.projectId,
    kind: "audio",
    name: "Noise-suppressed audio.wav",
    mime: input.blob.type || "audio/wav",
    size: input.blob.size,
    durationMs: input.durationMs,
    width: null,
    height: null,
    blob: input.blob,
    thumb: null,
    peaks: null,
    createdAt: Date.now(),
  };
}

export async function makeNoiseSuppressedWav(
  sourceBlob: Blob,
  makeProcessor: DenoiseProcessorFactory = () => loadRnnoiseFactory().then((f) => f()),
): Promise<Blob | null> {
  const decoded = await decodeAudioRange(sourceBlob, null, MIX_SAMPLE_RATE);
  if (!decoded || decoded.channels[0].length === 0) return null;
  const processed = await denoiseChannels(decoded.channels, makeProcessor);
  return encodeWavBlob(processed, decoded.sampleRate);
}
