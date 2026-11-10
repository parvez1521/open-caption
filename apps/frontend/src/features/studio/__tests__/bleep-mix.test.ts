import { describe, expect, it } from "vitest";
import { DEFAULT_AUDIO_MASTER, NEUTRAL_AUDIO_EQ, DEFAULT_AUDIO_CLEANUP, type AudioBleep, type AudioMaster } from "@capseasy/shared";
import { renderMixedAudio, type DecodeRangeFn } from "../audio/mixdown";
import type { MixItem, MixPlan } from "../audio/mixPlan";
import { bleepMuteGain, bleepToneSample } from "../audio/mixMath";
import { rms } from "../audio/dsp";

/**
 * A6 measured mix parity (the Phase 4.8 audio-mixdown.test.ts standard):
 * synthetic PCM is driven through the real renderMixedAudio, and the bleep
 * is verified by MEASUREMENT — the source frequency's energy inside the
 * range collapses, the tone frequency's energy matches the stored level,
 * and everything outside the ranges is sample-identical to the unbleeped mix.
 */

const SR = 48000;

function sine(freqHz: number, seconds: number, amplitude: number): [Float32Array, Float32Array] {
  const n = Math.round(seconds * SR);
  const l = new Float32Array(n);
  for (let i = 0; i < n; i++) l[i] = amplitude * Math.sin((2 * Math.PI * freqHz * i) / SR);
  return [l, l.slice()];
}

/** Goertzel amplitude of one frequency over [fromMs, toMs) — the tone/source energy measure. */
function bandAmplitude(ch: Float32Array, freqHz: number, fromMs: number, toMs: number): number {
  const from = Math.round((fromMs / 1000) * SR);
  const to = Math.min(ch.length, Math.round((toMs / 1000) * SR));
  let re = 0, im = 0;
  for (let i = from; i < to; i++) {
    const ph = (2 * Math.PI * freqHz * i) / SR;
    re += ch[i]! * Math.cos(ph);
    im -= ch[i]! * Math.sin(ph);
  }
  return (Math.sqrt(re * re + im * im) / Math.max(1, to - from)) * 2;
}

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
    return { channels: [full[0].slice(start, end), full[1].slice(start, end)], sampleRate: SR };
  };
}

const item = (partial: Partial<MixItem>): MixItem => ({
  key: "video:main", kind: "video", assetId: null, timelineStartMs: 0, sourceStartMs: 0,
  sourceDurationMs: 3000, rate: 1, baseGain: 1, fadeInMs: 0, fadeOutMs: 0,
  eq: { ...NEUTRAL_AUDIO_EQ }, cleanup: { ...DEFAULT_AUDIO_CLEANUP }, reverb: 0,
  voice: true, duck: false, trackId: null, ...partial,
});
const plan = (bleeps: AudioBleep[], master: AudioMaster = DEFAULT_AUDIO_MASTER): MixPlan => ({
  durationMs: 3000, items: [item({})], master, bleeps,
});
const BLEEP: AudioBleep = { id: "b1", startMs: 1000, endMs: 2000, toneHz: 1000, level: 0.5, wordText: "fuck" };

describe("bleepToneSample / bleepMuteGain — the ONE shared definition", () => {
  it("mute gain is exactly 0 inside [start, end) and exactly 1 outside", () => {
    expect(bleepMuteGain([BLEEP], 999)).toBe(1);
    expect(bleepMuteGain([BLEEP], 1000)).toBe(0);
    expect(bleepMuteGain([BLEEP], 1999)).toBe(0);
    expect(bleepMuteGain([BLEEP], 2000)).toBe(1);
    expect(bleepMuteGain([], 1500)).toBe(1);
  });
  it("tone starts at a zero crossing, peaks near the level, and is 0 outside", () => {
    expect(bleepToneSample(BLEEP, 999)).toBe(0);
    expect(bleepToneSample(BLEEP, 1000)).toBe(0);
    expect(bleepToneSample(BLEEP, 2000)).toBe(0);
    // a quarter period (0.25 ms at 1 kHz) past the 5 ms ramp ≈ the full level
    let peak = 0;
    for (let ms = 1005; ms < 1100; ms += 0.25) peak = Math.max(peak, Math.abs(bleepToneSample(BLEEP, ms)));
    expect(peak).toBeGreaterThan(0.48);
    expect(peak).toBeLessThanOrEqual(0.5);
  });
});

describe("renderMixedAudio with an approved bleep — measurements", () => {
  it("inside the range: the 300 Hz source collapses (<2% of its outside level) and 1 kHz tone energy ≈ the stored level", async () => {
    const reg = new Registry();
    reg.add(null, sine(300, 3, 0.6));
    const out = await renderMixedAudio({ plan: plan([BLEEP]), getBlob: reg.getBlob, decodeRange: reg.decodeRange });
    const ch = out.channels[0];
    const srcOutside = bandAmplitude(ch, 300, 100, 900);
    const srcInside = bandAmplitude(ch, 300, 1100, 1900);
    expect(srcOutside).toBeGreaterThan(0.5); // fixture sanity: ~0.6 amplitude
    expect(srcInside / srcOutside).toBeLessThan(0.02);
    const toneInside = bandAmplitude(ch, 1000, 1100, 1900);
    expect(Math.abs(toneInside - BLEEP.level) / BLEEP.level).toBeLessThan(0.1);
    // and the tone is absent outside the range
    expect(bandAmplitude(ch, 1000, 100, 900)).toBeLessThan(0.02);
    // overall inside-range RMS ≈ the tone's own RMS (level/√2), i.e. the source is gone
    const insideRms = rms(ch, Math.round(1.1 * SR), Math.round(1.9 * SR));
    expect(Math.abs(insideRms - BLEEP.level / Math.SQRT2) / (BLEEP.level / Math.SQRT2)).toBeLessThan(0.1);
  }, 30_000);

  it("outside the ranges the mix is SAMPLE-IDENTICAL to the unbleeped mix", async () => {
    const reg = new Registry();
    reg.add(null, sine(300, 3, 0.6));
    const plain = await renderMixedAudio({ plan: plan([]), getBlob: reg.getBlob, decodeRange: reg.decodeRange });
    const bleeped = await renderMixedAudio({ plan: plan([BLEEP]), getBlob: reg.getBlob, decodeRange: reg.decodeRange });
    for (let c = 0 as 0 | 1; c < 2; c = (c + 1) as 0 | 1) {
      expect(bleeped.channels[c].subarray(0, Math.round(0.99 * SR))).toEqual(plain.channels[c].subarray(0, Math.round(0.99 * SR)));
      expect(bleeped.channels[c].subarray(Math.round(2.01 * SR))).toEqual(plain.channels[c].subarray(Math.round(2.01 * SR)));
    }
  }, 30_000);

  it("no bleeps in the plan (nothing approved) renders bit-identical to the plain mix", async () => {
    const reg = new Registry();
    reg.add(null, sine(300, 3, 0.6));
    const a = await renderMixedAudio({ plan: plan([]), getBlob: reg.getBlob, decodeRange: reg.decodeRange });
    const b = await renderMixedAudio({ plan: plan([]), getBlob: reg.getBlob, decodeRange: reg.decodeRange });
    expect(b.channels[0]).toEqual(a.channels[0]);
    expect(b.channels[1]).toEqual(a.channels[1]);
    // and a plan whose bleeps were never added because approval was withheld is
    // exactly this plan — the approval gate lives in bleep.ts/audioOps and is
    // covered there; here the render-level fact is: no bleeps, no change.
  }, 30_000);

  it("a bleep over a silent source still produces the tone (tone is synthesised, not sampled)", async () => {
    const reg = new Registry();
    reg.add(null, [new Float32Array(3 * SR), new Float32Array(3 * SR)]);
    const out = await renderMixedAudio({ plan: plan([BLEEP]), getBlob: reg.getBlob, decodeRange: reg.decodeRange });
    expect(bandAmplitude(out.channels[0], 1000, 1100, 1900)).toBeGreaterThan(0.45);
    expect(rms(out.channels[0], 0, Math.round(0.9 * SR))).toBe(0);
  }, 30_000);
});
