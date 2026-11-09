import { describe, expect, it } from "vitest";
import { Resampler } from "../resample";
import { SR, TimelineAligner, capWordEnd, detectSpeech, isLooping, dropRepeatedRuns, planWindows, renderWindow, toOriginalSeconds } from "../speech";

/** a "voiced" burst: a 200 Hz tone with an envelope, loud enough to count as speech */
function tone(seconds: number, amp = 0.2): Float32Array {
  const a = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < a.length; i++) a[i] = amp * Math.sin((2 * Math.PI * 200 * i) / SR);
  return a;
}
function clip(parts: (["speech" | "silence", number])[]): Float32Array {
  const arrs = parts.map(([k, s]) => (k === "speech" ? tone(s) : new Float32Array(Math.round(s * SR))));
  const out = new Float32Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

describe("Resampler", () => {
  it("turns 48 kHz into 16 kHz keeping a 1 kHz tone's level", () => {
    const src = new Float32Array(48_000);
    for (let i = 0; i < src.length; i++) src[i] = 0.5 * Math.sin((2 * Math.PI * 1000 * i) / 48_000);
    const r = new Resampler(48_000);
    const parts = [r.push(src.subarray(0, 20_000)), r.push(src.subarray(20_000)), r.flush()];
    const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    expect(Math.abs(out.length - 16_000)).toBeLessThanOrEqual(2);
    let peak = 0;
    for (let i
= 2000; i < 14_000; i++) peak = Math.max(peak, Math.abs(out[i]!));
    expect(peak).toBeGreaterThan(0.47);
    expect(peak).toBeLessThan(0.53);
  });

  it("removes content above the new Nyquist instead of folding it back", () => {
    const src = new Float32Array(48_000);
    for (let i = 0; i < src.length; i++) src[i] = 0.5 * Math.sin((2 * Math.PI * 12_000 * i) / 48_000); // 12 kHz > 8 kHz
    const out = new Resampler(48_000).push(src);
    let peak = 0;
    for (let i = 500; i < out.length - 500; i++) peak = Math.max(peak, Math.abs(out[i]!));
    expect(peak).toBeLessThan(0.05);
  });

  it("passes 16 kHz through untouched", () => {
    const a = tone(0.1);
    expect(new Resampler(16_000).push(a)).toBe(a);
  });
});

describe("speech packing", () => {
  it("finds speech and ignores silence", () => {
    const segs = detectSpeech(clip([["silence", 2], ["speech", 3], ["silence", 2]]));
    expect(segs).toHaveLength(1);
    expect(segs[0]!.start / SR).toBeGreaterThan(1.6);
    expect(segs[0]!.end / SR).toBeLessThan(5.5);
  });

  it("returns nothing for near-silence", () => {
    expect(planWindows(new Float32Array(SR * 10))).toHaveLength(0);
  });

  it("packs speech across short pauses into one window, dropping the silence", () => {
    const audio = clip([["speech", 5], ["silence", 1.5], ["speech", 5], ["silence", 1.5], ["speech", 5]]);
    const wins = planWindows(audio, undefined, 0, false);
    expect(wins).toHaveLength(1);
    expect(wins[0]!.samples / SR).toBeLessThan(audio.length / SR - 1.5);
  });

  it("starts a new window across long gaps", () => {
    const wins = planWindows(clip([["speech", 4], ["silence", 6], ["speech", 4]]));
    expect(wins).toHaveLength(2);
  });

  it("never exceeds the window length", () => {
    const wins = planWindows(clip([["speech", 70]]));
    for (const w of wins) expect(w.samples / SR).toBeLessThanOrEqual(28.01);
    expect(wins.length).toBeGreaterThanOrEqual(3);
  });

  it("maps packed times back onto the original clock (within 10 ms) and never into a removed gap", () => {
    const audio = clip([["silence", 1], ["speech", 4], ["silence", 1.5], ["speech", 4]]);
    const [w] = planWindows(audio, undefined, 0, false);
    expect(w).toBeTruthy();
    const first = w!.pieces[0]!;
    const second = w!.pieces[1]!;
    // a moment 1 s into the second packed piece is 1 s into the second original segment
    const packed = (second.packedStart + SR) / SR;
    expect(toOriginalSeconds(w!, packed)).toBeCloseTo((second.origStart + SR) / SR, 2);
    // a time inside the glue snaps to a piece edge, never to the original silence in between
    const glueMid = (first.packedEnd + (second.packedStart - first.packedEnd) / 2) / SR;
    const mapped = toOriginalSeconds(w!, glueMid) * SR;
    const firstEnd = first.origStart + (first.packedEnd - first.packedStart);
    expect(mapped === firstEnd || mapped === second.origStart).toBe(true);
    expect(renderWindow(audio, w!).length).toBe(w!.samples);
  });
});

describe("TimelineAligner (decoded samples belong on the media clock)", () => {
  it("pads an audio track that starts late, so speech stays at its media time", () => {
    const a = new TimelineAligner(SR);
    const out = a.align(0.35, tone(0.5)); // first decoded sample is stamped 0.35 s, holds 0.5 s of speech
    expect(out.length).toBe(Math.round(0.35 * SR) + Math.round(0.5 * SR));
    expect(out[Math.round(0.35 * SR) - 1]).toBe(0); // silence before 0.35 s
    expect(Math.abs(out[Math.round(0.35 * SR) + 100]!)).toBeGreaterThan(0.05); // speech from 0.35 s
    expect(a.positionSec).toBeCloseTo(0.85, 6);
    // plain concatenation (the old behaviour) would have placed this speech at 0 s: a 350 ms caption shift
  });

  it("keeps a mid-stream gap as silence instead of collapsing it", () => {
    const a = new TimelineAligner(SR);
    a.align(0, tone(0.5));
    const second = a.align(1.7, tone(0.5)); // next sample is stamped 1.7 s: a 1.2 s hole before it
    expect(second.length).toBe(Math.round(1.2 * SR) + Math.round(0.5 * SR));
    expect(second[Math.round(1.2 * SR) - 1]).toBe(0);
    expect(Math.abs(second[Math.round(1.2 * SR) + 100]!)).toBeGreaterThan(0.05);
    expect(a.positionSec).toBeCloseTo(2.2, 6);
  });

  it("trims codec priming stamped before t=0 and drops samples that end before 0", () => {
    const a = new TimelineAligner(48_000);
    const out = a.align(-0.04, new Float32Array(4800).fill(0.9)); // 0.1 s at 48 kHz, stamped -0.04 s
    expect(out.length).toBe(4800 - Math.round(0.04 * 48_000));
    expect(a.positionSec).toBeCloseTo(0.06, 6);
    const b = new TimelineAligner(48_000);
    expect(b.align(-0.2, new Float32Array(4800))).toHaveLength(0);
    expect(b.align(0, new Float32Array(4800))).toHaveLength(4800);
  });

  it("end to end: bursts keep their media times through alignment + window packing", () => {
    // a container whose audio starts 0.35 s late and has a hole before the second burst
    const a = new TimelineAligner(SR);
    const parts = [
      a.align(0.35, tone(1)), // speech at media 0.35–1.35
      a.align(1.35, new Float32Array(SR)), // silence 1.35–2.35
      a.align(4.95, tone(1)), // speech at media 4.95–5.95, after a 2.6 s hole
    ];
    const audio = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) { audio.set(p, o); o += p.length; }
    // the aligned stream spans the media duration (5.95 s), not the concatenated length (3 s)
    expect(audio.length / SR).toBeCloseTo(5.95, 3);

    const wins = planWindows(audio, undefined, 0, false);
    expect(wins).toHaveLength(2);
    const truths = [0.35, 4.95];
    wins.forEach((w, i) => {
      const packed = renderWindow(audio, w);
      // first 5 ms hop whose RMS says "speech", mapped back to the original clock
      let onset = -1;
      for (let s = 0; s + 160 <= packed.length; s += 80) {
        let sum = 0;
        for (let j = s; j < s + 160; j++) sum += packed[j]! * packed[j]!;
        if (Math.sqrt(sum / 160) > 0.05) { onset = s / SR; break; }
      }
      expect(onset).toBeGreaterThanOrEqual(0);
      expect(Math.abs(toOriginalSeconds(w, onset) - truths[i]!)).toBeLessThanOrEqual(0.04);
    });
  });
});

describe("dropRepeatedRuns", () => {
  const w = (s: string) => s.split(" ").map((text) => ({ text }));
  it("keeps normal repetition", () => {
    expect(dropRepeatedRuns(w("no no no way")).length).toBe(4);
  });
  it("cuts a runaway single word to two", () => {
    expect(dropRepeatedRuns(w("so thank you you you you you you bye")).map((x) => x.text).join(" ")).toBe("so thank you you bye");
  });
  it("cuts a runaway phrase", () => {
    const out = dropRepeatedRuns(w("a b c a b c a b c a b c end")).map((x) => x.text).join(" ");
    expect(out).toBe("a b c a b c end");
  });
  it("cuts a long looping sentence (and its cut-off last copy) down to one", () => {
    const s = "I will not be able to get up in the next few days";
    const out = dropRepeatedRuns(w(`hello there ${s} ${s} ${s} ${s} I will not be able to get up`)).map((x) => x.text).join(" ");
    expect(out).toBe(`hello there ${s}`);
  });
  it("keeps a long phrase that is only said twice", () => {
    const s = "we are going to build something amazing together";
    expect(dropRepeatedRuns(w(`${s} ${s} thanks`)).length).toBe(s.split(" ").length * 2 + 1);
  });
});

describe("capWordEnd", () => {
  it("keeps normal words as they are", () => {
    expect(capWordEnd(" hai", 2, 2.3, 10)).toBe(2.3);
  });
  it("stops a last word from stretching over the silence after it", () => {
    expect(capWordEnd(" hain.", 7.16, 14.68, 8.66)).toBeCloseTo(7.16 + 0.6 + 0.12 * 5, 5);
  });
  it("never runs past the audio and never ends before it starts", () => {
    expect(capWordEnd(" sanskriti", 8.5, 12, 8.66)).toBe(8.66);
    expect(capWordEnd(" a", 9, 9, 8.66)).toBeCloseTo(9.05, 5);
  });
});

describe("isLooping", () => {
  it("spots a phrase said over and over", () => {
    expect(isLooping([9, 8, 1, 2, 3, 1, 2, 3, 1, 2, 3])).toBe(true);
    expect(isLooping([5, 6, 7, 6, 7, 6, 7, 6, 7])).toBe(true);
    expect(isLooping([1, 4, 4, 4, 4, 4, 4, 4, 4])).toBe(true);
  });
  it("lets real speech repeat a word or two", () => {
    expect(isLooping([10, 11, 12, 12, 13])).toBe(false); // "vah roya aur aur roya"
    expect(isLooping([1, 2, 3, 1, 2, 3, 4])).toBe(false);
    expect(isLooping([5, 6, 7, 6, 7, 6, 7])).toBe(false); // a two-token phrase three times
    expect(isLooping([])).toBe(false);
  });
  it("works on the bigint ids the decoder produces", () => {
    expect(isLooping([1, 2, 3, 1, 2, 3, 1, 2, 3].map(BigInt))).toBe(true);
  });
});
