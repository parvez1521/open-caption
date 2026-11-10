import { describe, expect, it } from "vitest";
import { AudioSample, AudioSampleSource, BufferTarget, Output, WavOutputFormat } from "mediabunny";
import { DEFAULT_AUDIO_MASTER, NEUTRAL_AUDIO_EQ, DEFAULT_AUDIO_CLEANUP, type AudioMaster } from "@capseasy/shared";
import { decodeAudioPeaks, decodeAudioRange } from "../audio/decode";
import { mixSourceAssetIds, renderMixedAudio, type DecodeRangeFn } from "../audio/mixdown";
import type { MixItem, MixPlan } from "../audio/mixPlan";
import { peakAbs, rms } from "../audio/dsp";

const SR = 48000;

function sine(freqHz: number, seconds: number, amplitude: number): [Float32Array, Float32Array] {
  const n = Math.round(seconds * SR);
  const l = new Float32Array(n);
  for (let i = 0; i < n; i++) l[i] = amplitude * Math.sin((2 * Math.PI * freqHz * i) / SR);
  return [l, l.slice()];
}
function dc(seconds: number, amplitude: number): [Float32Array, Float32Array] {
  const n = Math.round(seconds * SR);
  return [new Float32Array(n).fill(amplitude), new Float32Array(n).fill(amplitude)];
}

/** A tiny in-test source registry: assetId → blob, blob → full-source PCM. */
class Registry {
  private blobs = new Map<string | null, Blob>();
  private pcm = new Map<Blob, [Float32Array, Float32Array]>();
  private counter = 0;
  add(assetId: string | null, channels: [Float32Array, Float32Array]): void {
    const blob = new Blob([`source-${this.counter++}`], { type: "audio/wav" });
    this.blobs.set(assetId, blob);
    this.pcm.set(blob, channels);
  }
  getBlob = async (assetId: string | null): Promise<Blob | null> => this.blobs.get(assetId) ?? null;
  decodeRange: DecodeRangeFn = async (blob, range) => {
    const full = this.pcm.get(blob);
    if (!full) return null;
    const start = range ? Math.round((range.startMs / 1000) * SR) : 0;
    const end = range ? Math.round((range.endMs / 1000) * SR) : full[0].length;
    return {
      channels: [full[0].slice(start, end), full[1].slice(start, end)],
      sampleRate: SR,
    };
  };
}

let itemCounter = 0;
function item(partial: Partial<MixItem>): MixItem {
  return {
    key: `clip:t${itemCounter++}`,
    kind: "clip",
    assetId: "a",
    timelineStartMs: 0,
    sourceStartMs: 0,
    sourceDurationMs: 2000,
    rate: 1,
    baseGain: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    eq: { ...NEUTRAL_AUDIO_EQ },
    cleanup: { ...DEFAULT_AUDIO_CLEANUP },
    reverb: 0,
    voice: false,
    duck: false,
    trackId: "t",
    ...partial,
  };
}
function plan(items: MixItem[], durationMs: number, master: AudioMaster = DEFAULT_AUDIO_MASTER): MixPlan {
  return { durationMs, items, master, bleeps: [] };
}

describe("renderMixedAudio — measurements", () => {
  it("(1) a 0.5-amplitude 440Hz sine at volume 1 gives master RMS ≈ 0.5/√2 (±5%)", async () => {
    const reg = new Registry();
    reg.add("a", sine(440, 2, 0.5));
    const out = await renderMixedAudio({ plan: plan([item({})], 2000), getBlob: reg.getBlob, decodeRange: reg.decodeRange });
    const measured = rms(out.channels[0]);
    const expected = 0.5 / Math.SQRT2;
    expect(Math.abs(measured - expected) / expected).toBeLessThan(0.05);
  });

  it("(2) volume 0.5 halves the RMS (±5%)", async () => {
    const reg = new Registry();
    reg.add("a", sine(440, 2, 0.5));
    const full = await renderMixedAudio({ plan: plan([item({})], 2000), getBlob: reg.getBlob, decodeRange: reg.decodeRange });
    const half = await renderMixedAudio({
      plan: plan([item({ baseGain: 0.5 })], 2000),
      getBlob: reg.getBlob,
      decodeRange: reg.decodeRange,
    });
    const ratio = rms(half.channels[0]) / rms(full.channels[0]);
    expect(Math.abs(ratio - 0.5) / 0.5).toBeLessThan(0.05);
  });

  it("(3) fadeIn 1000ms over a 2000ms clip: midpoint ≈ half amplitude, start quieter than end", async () => {
    const reg = new Registry();
    reg.add("a", dc(2, 0.5));
    const out = await renderMixedAudio({
      plan: plan([item({ fadeInMs: 1000 })], 2000),
      getBlob: reg.getBlob,
      decodeRange: reg.decodeRange,
    });
    const midSample = out.channels[0][Math.round(0.5 * SR)]!;
    expect(Math.abs(midSample - 0.25) / 0.25).toBeLessThan(0.1);
    const first100 = rms(out.channels[0], 0, Math.round(0.1 * SR));
    const last100 = rms(out.channels[0], Math.round(1.9 * SR), 2 * SR);
    expect(first100).toBeLessThan(last100);
    expect(last100).toBeCloseTo(0.5, 2);
  });

  it("(4) ducking: music under a loud voice is pulled down ≈12dB (±15%)", async () => {
    const reg = new Registry();
    reg.add("voice", dc(3, 0.5));
    reg.add("music", dc(3, 0.4));
    const voice = item({ assetId: "voice", sourceDurationMs: 3000, voice: true, key: "clip:voice" });
    const music = item({
      assetId: "music",
      sourceDurationMs: 3000,
      key: "clip:music",
      duck: true,
      ducking: { enabled: true, amountDb: 12, thresholdDb: -42 },
    });
    const out = await renderMixedAudio({ plan: plan([voice, music], 3000), getBlob: reg.getBlob, decodeRange: reg.decodeRange });
    // In the settled middle (1.0–1.9s) the master is voice (0.5) + ducked music.
    let musicSum = 0;
    let count = 0;
    for (let i = Math.round(1.0 * SR); i < Math.round(1.9 * SR); i++) {
      musicSum += out.channels[0][i]! - 0.5;
      count++;
    }
    const musicLevel = musicSum / count;
    const ratio = musicLevel / 0.4;
    const expected = Math.pow(10, -12 / 20);
    expect(Math.abs(ratio - expected) / expected).toBeLessThan(0.15);
  });

  it("(5) placement: an item starting at 1000ms leaves the first 900ms silent", async () => {
    const reg = new Registry();
    reg.add("a", dc(1, 0.5));
    const out = await renderMixedAudio({
      plan: plan([item({ timelineStartMs: 1000, sourceDurationMs: 1000 })], 2000),
      getBlob: reg.getBlob,
      decodeRange: reg.decodeRange,
    });
    expect(peakAbs(out.channels[0].slice(0, Math.round(0.9 * SR)))).toBeLessThan(1e-4);
    expect(out.channels[0][Math.round(1.5 * SR)]).toBeCloseTo(0.5, 6);
  });

  it("(6) EQ +12dB low on a clip raises its 100Hz RMS by ~x3.9 (±25%)", async () => {
    const reg = new Registry();
    reg.add("a", sine(100, 1, 0.3));
    const plain = await renderMixedAudio({
      plan: plan([item({ sourceDurationMs: 1000 })], 1000),
      getBlob: reg.getBlob,
      decodeRange: reg.decodeRange,
    });
    const boosted = await renderMixedAudio({
      plan: plan([item({ sourceDurationMs: 1000, eq: { lowDb: 12, midDb: 0, highDb: 0 } })], 1000),
      getBlob: reg.getBlob,
      decodeRange: reg.decodeRange,
    });
    const steady = (ch: Float32Array) => rms(ch, Math.round(0.25 * SR), Math.round(0.75 * SR));
    const ratio = steady(boosted.channels[0]) / steady(plain.channels[0]);
    expect(ratio).toBeGreaterThan(3.9 * 0.75);
    expect(ratio).toBeLessThan(3.9 * 1.25);
  });

  it("(7) the master compressor tames a loud item's peak", async () => {
    const reg = new Registry();
    reg.add("a", sine(440, 1, 0.9));
    const plain = await renderMixedAudio({
      plan: plan([item({ sourceDurationMs: 1000 })], 1000),
      getBlob: reg.getBlob,
      decodeRange: reg.decodeRange,
    });
    const compressedMaster: AudioMaster = {
      volume: 1,
      videoVolume: 1,
      compressor: { enabled: true, thresholdDb: -18, ratio: 3, kneeDb: 12, attackMs: 10, releaseMs: 200 },
    };
    const squashed = await renderMixedAudio({
      plan: plan([item({ sourceDurationMs: 1000 })], 1000, compressedMaster),
      getBlob: reg.getBlob,
      decodeRange: reg.decodeRange,
    });
    expect(peakAbs(plain.channels[0])).toBeCloseTo(0.9, 1);
    // Steady state (second half): the 10ms attack passes the first transient peak
    // by design, so the taming is measured after the envelope has built.
    const steadyPeak = peakAbs(squashed.channels[0].slice(Math.floor(SR / 2)));
    expect(steadyPeak).toBeLessThan(peakAbs(plain.channels[0]));
    expect(steadyPeak).toBeLessThan(0.45);
  });

  it("skips items whose blob is missing, silently", async () => {
    const reg = new Registry();
    reg.add("a", dc(1, 0.5));
    const out = await renderMixedAudio({
      plan: plan([item({ assetId: "missing", sourceDurationMs: 1000 }), item({ sourceDurationMs: 1000 })], 1000),
      getBlob: reg.getBlob,
      decodeRange: reg.decodeRange,
    });
    expect(rms(out.channels[0])).toBeCloseTo(0.5, 3);
  });
});

describe("mixSourceAssetIds", () => {
  it("returns distinct assetIds in first-use order, including null", () => {
    const p = plan(
      [item({ assetId: null }), item({ assetId: "x" }), item({ assetId: "x" }), item({ assetId: null }), item({ assetId: "y" })],
      1000,
    );
    expect(mixSourceAssetIds(p)).toEqual([null, "x", "y"]);
  });
});

describe("decodeAudioRange — real Mediabunny WAV round-trip", () => {
  it("writes a WAV with Mediabunny, decodes it back and measures its peaks", async () => {
    const [left] = sine(440, 1, 0.5);
    const target = new BufferTarget();
    const output = new Output({ format: new WavOutputFormat(), target });
    const source = new AudioSampleSource({ codec: "pcm-s16" });
    output.addAudioTrack(source);
    await output.start();
    const frames = left.length;
    const data = new Float32Array(frames * 2);
    data.set(left, 0);
    data.set(left, frames);
    const sample = new AudioSample({
      data: data.buffer as ArrayBuffer,
      format: "f32-planar",
      numberOfChannels: 2,
      sampleRate: SR,
      timestamp: 0,
    });
    await source.add(sample);
    sample.close();
    await output.finalize();
    expect(target.buffer).not.toBeNull();
    const blob = new Blob([target.buffer!], { type: "audio/wav" });

    const decoded = await decodeAudioRange(blob, null);
    expect(decoded).not.toBeNull();
    expect(decoded!.sampleRate).toBe(SR);
    expect(Math.abs(decoded!.channels[0].length - SR)).toBeLessThan(SR * 0.02);
    const measured = rms(decoded!.channels[0]);
    const expected = 0.5 / Math.SQRT2;
    expect(Math.abs(measured - expected) / expected).toBeLessThan(0.05);

    // a range decode returns only that window, placed from its start
    const ranged = await decodeAudioRange(blob, { startMs: 250, endMs: 750 });
    expect(ranged).not.toBeNull();
    expect(Math.abs(ranged!.channels[0].length - SR / 2)).toBeLessThan(SR * 0.02);

    const peaks = await decodeAudioPeaks(blob);
    expect(peaks).not.toBeNull();
    expect(peaks!.length).toBe(100); // 1s at 10ms hops
    expect(peakAbs(peaks!)).toBeGreaterThan(0.45);
    expect(peakAbs(peaks!)).toBeLessThan(0.55);
  });

  it("returns null for a blob with no audio track", async () => {
    expect(await decodeAudioRange(new Blob(["not media at all"], { type: "text/plain" }), null)).toBeNull();
  });
});
