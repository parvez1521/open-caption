/**
 * mixdown — the export mixdown (Phase 4 Run 3, 4.8): MixPlan → stereo PCM at 48 kHz.
 *
 * Pipeline (exactly the order implemented below):
 * 1. Per item, in plan order: fetch the source blob via `getBlob` (null → the item is
 *    SKIPPED silently — device-local rule: sources can live only on another device;
 *    the caller reports missing sources separately, the mix never invents audio),
 *    decode the SOURCE range [sourceStartMs, sourceStartMs + sourceDurationMs * rate)
 *    (the source span is the timeline duration times the rate), rateShift the decoded
 *    channels when rate != 1 (pitch drops with rate, like the render paths), then
 *    write the item into its own stereo buffer at its timeline position with the
 *    per-sample gain g(t) = baseGain * fadeGainAt({volume: 1, fades}, t, duration).
 * 2. Cleanup, then EQ, are baked onto the item buffer copy (in that order).
 * 3. The item's DRY peaks (post gain/EQ, pre-reverb) are kept for the voice
 *    combination when the item is a voice item.
 * 4. Reverb: wet = convolveChannels(item, generateImpulse(48000)) and the master sum
 *    takes out = dry * (1 - reverb) + wet * reverb (reverb tails truncated at the
 *    item end — see convolveChannels).
 * 5. Ducking, after ALL items are built: voice peaks are max-combined onto the
 *    timeline, each duck item's envelope = duckEnvelope(voicePeaks, item.ducking),
 *    and the item's placed samples (dry and wet) are multiplied by the envelope,
 *    linearly interpolated between hops at sample resolution.
 * 6. Master: items are summed, multiplied by master.volume, the master compressor
 *    runs when enabled, and the result is hard-clamped to [-1, 1].
 *
 * The per-item PCM fetch is injectable (`opts.decodeRange`, defaulting to the real
 * Mediabunny decodeAudioRange): that seam is how tests drive the mixdown with
 * synthetic PCM, and how the preview worker reuses this pipeline.
 */
import { decodeAudioRange, type DecodedAudio } from "./decode";
import {
  applyCleanup,
  applyCompressor,
  applyEq,
  convolveChannels,
  generateImpulse,
  rateShift,
  resampleLinear,
} from "./dsp";
import { MIX_HOP_MS, combineVoicePeaks, duckEnvelope, fadeGainAt, peaksFromChannels } from "./mixMath";
import type { MixItem, MixPlan } from "./mixPlan";

export const MIX_SAMPLE_RATE = 48000;

/** The injectable per-item PCM fetch — same shape as decodeAudioRange. */
export type DecodeRangeFn = (
  blob: Blob,
  range: { startMs: number; endMs: number } | null,
  targetRate?: number,
) => Promise<DecodedAudio | null>;

export interface RenderMixedAudioOptions {
  plan: MixPlan;
  /** Resolve an item's source blob by assetId (null = the project's main source). Null result → item skipped. */
  getBlob: (assetId: string | null) => Promise<Blob | null>;
  onProgress?: (fraction: number) => void;
  /** Seam for tests / preview reuse; defaults to the real Mediabunny decoder. */
  decodeRange?: DecodeRangeFn;
}

interface ItemEntry {
  item: MixItem;
  /** placed-length stereo buffers (item timeline duration, before master placement) */
  dry: [Float32Array, Float32Array];
  wet: [Float32Array, Float32Array] | null;
  startSample: number;
  /** dry peaks of the item buffer (hop = MIX_HOP_MS), null unless the item is voice */
  voicePeaks: Float32Array | null;
}

/** Distinct assetIds of a plan, in first-use order — including null (the main video). */
export function mixSourceAssetIds(plan: MixPlan): (string | null)[] {
  const seen = new Set<string | null>();
  const out: (string | null)[] = [];
  for (const item of plan.items) {
    if (!seen.has(item.assetId)) {
      seen.add(item.assetId);
      out.push(item.assetId);
    }
  }
  return out;
}

export async function renderMixedAudio(
  opts: RenderMixedAudioOptions,
): Promise<{ channels: [Float32Array, Float32Array]; sampleRate: 48000 }> {
  const { plan } = opts;
  const decodeRange = opts.decodeRange ?? decodeAudioRange;
  const sampleRate = MIX_SAMPLE_RATE;
  const totalSamples = Math.max(0, Math.round((plan.durationMs / 1000) * sampleRate));
  const master: [Float32Array, Float32Array] = [new Float32Array(totalSamples), new Float32Array(totalSamples)];
  if (plan.items.length === 0 || totalSamples === 0) {
    opts.onProgress?.(1);
    return { channels: master, sampleRate };
  }

  const entries: ItemEntry[] = [];
  const impulse = generateImpulse(sampleRate);

  for (let index = 0; index < plan.items.length; index++) {
    const item = plan.items[index]!;
    try {
      const blob = await opts.getBlob(item.assetId);
      if (!blob) continue;
      const decoded = await decodeRange(
        blob,
        {
          startMs: item.sourceStartMs,
          endMs: item.sourceStartMs + item.sourceDurationMs * item.rate,
        },
        sampleRate,
      );
      if (!decoded) continue;

      // Normalise to the mix rate, then to timeline rate.
      let channels: [Float32Array, Float32Array] = decoded.channels;
      if (decoded.sampleRate !== sampleRate) {
        channels = [
          resampleLinear(channels[0], decoded.sampleRate, sampleRate),
          resampleLinear(channels[1], decoded.sampleRate, sampleRate),
        ];
      }
      if (item.rate !== 1) {
        channels = [rateShift(channels[0], item.rate), rateShift(channels[1], item.rate)];
      }

      const itemSamples = Math.max(0, Math.round((item.sourceDurationMs / 1000) * sampleRate));
      const dry: [Float32Array, Float32Array] = [new Float32Array(itemSamples), new Float32Array(itemSamples)];
      for (let s = 0; s < itemSamples; s++) {
        const localMs = (s / sampleRate) * 1000;
        const g =
          item.baseGain *
          fadeGainAt({ volume: 1, fadeInMs: item.fadeInMs, fadeOutMs: item.fadeOutMs }, localMs, item.sourceDurationMs);
        if (g === 0) continue;
        dry[0][s] = (channels[0][s] ?? 0) * g;
        dry[1][s] = (channels[1][s] ?? 0) * g;
      }

      // Bake processors onto the item copy: cleanup first, then EQ.
      applyCleanup(dry, sampleRate, item.cleanup);
      applyEq(dry, sampleRate, item.eq);

      const voicePeaks = item.voice ? peaksFromChannels(dry, sampleRate, MIX_HOP_MS) : null;

      let wet: [Float32Array, Float32Array] | null = null;
      if (item.reverb > 0) {
        const convolved = convolveChannels(dry, impulse);
        wet = [convolved[0]!, convolved[1]!];
      }

      entries.push({
        item,
        dry,
        wet,
        startSample: Math.round((item.timelineStartMs / 1000) * sampleRate),
        voicePeaks,
      });
    } finally {
      opts.onProgress?.((index + 1) / plan.items.length);
    }
  }

  // Ducking: combine the voice peaks, derive each duck item's envelope, apply it to
  // the item's placed samples (dry and wet) with per-sample hop interpolation.
  const totalHops = Math.ceil(plan.durationMs / MIX_HOP_MS);
  const voiceTimeline = combineVoicePeaks(
    entries
      .filter((e) => e.voicePeaks)
      .map((e) => ({ peaks: e.voicePeaks!, startHop: Math.round(e.item.timelineStartMs / MIX_HOP_MS) })),
    totalHops,
  );
  const samplesPerHop = Math.round((sampleRate * MIX_HOP_MS) / 1000);
  for (const entry of entries) {
    if (!entry.item.duck) continue;
    const ducking = entry.item.ducking ?? { enabled: true, amountDb: 12, thresholdDb: -42 };
    const envelope = duckEnvelope(voiceTimeline, ducking, MIX_HOP_MS);
    const applyTo = (buffer: Float32Array) => {
      for (let s = 0; s < buffer.length; s++) {
        const global = entry.startSample + s;
        const hop = Math.floor(global / samplesPerHop);
        const frac = (global - hop * samplesPerHop) / samplesPerHop;
        const a = envelope[hop] ?? 1;
        const b = envelope[hop + 1] ?? a;
        buffer[s] = buffer[s]! * (a + (b - a) * frac);
      }
    };
    applyTo(entry.dry[0]);
    applyTo(entry.dry[1]);
    if (entry.wet) {
      applyTo(entry.wet[0]);
      applyTo(entry.wet[1]);
    }
  }

  // Sum into the master: dry * (1 - reverb) + wet * reverb.
  for (const entry of entries) {
    const reverb = entry.item.reverb;
    const dryScale = reverb > 0 ? 1 - reverb : 1;
    for (let c = 0 as 0 | 1; c < 2; c = (c + 1) as 0 | 1) {
      const target = master[c];
      const dry = entry.dry[c];
      const wet = entry.wet ? entry.wet[c] : null;
      for (let s = 0; s < dry.length; s++) {
        const at = entry.startSample + s;
        if (at < 0) continue;
        if (at >= target.length) break;
        target[at] = target[at]! + dry[s]! * dryScale + (wet ? wet[s]! * reverb : 0);
      }
    }
  }

  // Master chain: volume → compressor (no-op when disabled) → hard clamp.
  const volume = plan.master.volume;
  if (volume !== 1) {
    for (const ch of master) {
      for (let i = 0; i < ch.length; i++) ch[i] = ch[i]! * volume;
    }
  }
  applyCompressor(master, sampleRate, plan.master.compressor);
  for (const ch of master) {
    for (let i = 0; i < ch.length; i++) {
      const v = ch[i]!;
      ch[i] = v > 1 ? 1 : v < -1 ? -1 : v;
    }
  }

  return { channels: master, sampleRate };
}
