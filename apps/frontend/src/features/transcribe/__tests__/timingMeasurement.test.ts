import { describe, expect, it } from "vitest";
import { SR, refineWordTimings } from "../speech";

/**
 * Timing measurement: how far are Whisper's word starts from the sound, and how much of that
 * error does refineWordTimings actually correct?
 *
 * Ground truth here is STIPULATED BY CONSTRUCTION, not measured from audio: one continuous
 * 3 s tone burst holds five 600 ms "words" at known boundaries [0,600,1200,1800,2400,3000] ms,
 * and the simulated Whisper times carry the systematic error measured on the repo's own test
 * clip (speech-test.mp3, pinned in speech.test.ts): starts 160-290 ms LATE, ends 10-190 ms
 * EARLY. This measures the CORRECTION ALGORITHM's response to that known input error — it
 * does not re-measure the model. The real-clip case below (all words are burst edges) is the
 * control: refine already fixes those exactly, so the gap this file quantifies is the
 * mid-burst words, which are the near-continuous narration the owner actually records
 * (the Sherlock reference: 151 words in 43 s, few bursts, so most words are mid-burst).
 *
 * A word is a burst EDGE word when it is the first or last word assigned to its burst;
 * every other word is MID-BURST. refineWordTimings snaps edges to the burst onset/offset;
 * mid-burst words keep Whisper's times unless the calibrated bias correction is on.
 */

function tone(seconds: number, amp = 0.2): Float32Array {
  const a = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < a.length; i++) a[i] = amp * Math.sin((2 * Math.PI * 200 * i) / SR);
  return a;
}

const w = (text: string, startMs: number, endMs: number) => ({ text, startMs, endMs });

// True boundaries [0,600,1200,1800,2400,3000]; Whisper error per word (start late, end early),
// cycling through the measured range: 160/10, 220/100, 290/190, 220/100, 160/10.
const TRUE_STARTS = [0, 600, 1200, 1800, 2400];
const TRUE_ENDS = [600, 1200, 1800, 2400, 3000];
const WHISPER = [
  w("one", 160, 590),
  w("two", 820, 1100),
  w("three", 1490, 1610),
  w("four", 2020, 2300),
  w("five", 2560, 2990),
];

interface TimingStats {
  /** mean absolute start error across all words, ms */
  meanAbsStartErr: number;
  /** share of words whose |start error| exceeds 150 ms (visible lip-sync lag) */
  shareStartErrOver150: number;
  /** mean absolute start error for edge words (first/last of the burst) */
  edgeMeanAbsStartErr: number;
  /** mean absolute start error for mid-burst words */
  midMeanAbsStartErr: number;
  /** words whose start or end moved by at least 1 ms */
  movedWords: number;
}

function measure(words: { text: string; startMs: number; endMs: number }[]): TimingStats {
  const startErrs = words.map((x, i) => Math.abs(x.startMs - TRUE_STARTS[i]!));
  const edge = [startErrs[0]!, startErrs[4]!];
  const mid = startErrs.slice(1, 4);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  return {
    meanAbsStartErr: mean(startErrs),
    shareStartErrOver150: startErrs.filter((e) => e > 150).length / startErrs.length,
    edgeMeanAbsStartErr: mean(edge),
    midMeanAbsStartErr: mean(mid),
    movedWords: words.filter((x, i) => x.startMs !== WHISPER[i]!.startMs || x.endMs !== WHISPER[i]!.endMs).length,
  };
}

describe("caption timing measurement — baseline vs bias-corrected", () => {
  const audio = tone(3);

  it("BASELINE (refine only): edge words are fixed, mid-burst words keep the full DTW lag", () => {
    const out = refineWordTimings(WHISPER, audio, { biasCorrection: false });
    const s = measure(out);
    // Edge words snap exactly onto the burst: first start 160 -> 0, last end 2990 -> 3000.
    expect(out[0]!.startMs).toBe(0);
    expect(out[4]!.endMs).toBe(3000);
    // Mid-burst words are untouched: starts stay 220/290/220 ms late.
    expect(out[1]!.startMs).toBe(820);
    expect(out[2]!.startMs).toBe(1490);
    expect(out[3]!.startMs).toBe(2020);
    // Coverage gap: only the 2 edge words move out of 5.
    expect(s.movedWords).toBe(2);
    // Mean |start error| stays above the 150 ms visibility line, driven by mid-burst words.
    expect(s.midMeanAbsStartErr).toBeCloseTo(243.3, 0);
    expect(s.meanAbsStartErr).toBeCloseTo(178, 0);
    expect(s.shareStartErrOver150).toBeCloseTo(0.8, 5);
  });

  it("CORRECTED (bias on): mean start error drops below 100 ms and mid-burst words improve", () => {
    const out = refineWordTimings(WHISPER, audio, { biasCorrection: true });
    const s = measure(out);
    // Mid-burst starts move 200 ms earlier: 220 -> 20, 290 -> 90, 220 -> 20.
    expect(out[1]!.startMs).toBe(620);
    expect(out[2]!.startMs).toBe(1290);
    expect(out[3]!.startMs).toBe(1820);
    // Edge words still snap exactly; the last word's start keeps Whisper's time
    // (it is a burst-edge word, so the bias does not apply to it — known limit).
    expect(out[0]!.startMs).toBe(0);
    expect(out[4]!.endMs).toBe(3000);
    expect(s.midMeanAbsStartErr).toBeLessThan(100);
    expect(s.midMeanAbsStartErr).toBeLessThan(243.3);
    expect(s.meanAbsStartErr).toBeLessThan(100);
    expect(s.shareStartErrOver150).toBeLessThan(0.8);
    expect(s.movedWords).toBe(5);
    // Words stay monotonic with at least 40 ms each after the shift.
    for (let i = 0; i < out.length; i++) {
      expect(out[i]!.endMs - out[i]!.startMs).toBeGreaterThanOrEqual(40);
      if (i > 0) expect(out[i]!.startMs).toBeGreaterThanOrEqual(out[i - 1]!.endMs);
    }
  });

  it("CONTROL (real test clip): all words are burst edges, so refine alone already fixes them", () => {
    // speech-test.mp3 ("hyperbola / hyperbole / hyperbolic"): bursts [240,1080] [1700,2540]
    // [3020,3900]; Whisper reported [530,1070] [1890,2350] [3180,3480].
    const realClip = (() => {
      const parts: Float32Array[] = [];
      const push = (seconds: number, voiced: boolean) => {
        const a = voiced ? tone(seconds) : new Float32Array(Math.round(seconds * SR));
        parts.push(a);
      };
      push(0.24, false); push(0.84, true); push(0.62, false); push(0.84, true); push(0.48, false); push(0.88, true); push(0.394, false);
      const out = new Float32Array(parts.reduce((n, a) => n + a.length, 0));
      let o = 0;
      for (const a of parts) { out.set(a, o); o += a.length; }
      return out;
    })();
    const whisper = [w("Hyperbola.", 530, 1070), w("Hyperbola.", 1890, 2350), w("Hyperbolic.", 3180, 3480)];
    const truth = [240, 1700, 3020];
    for (const bias of [false, true]) {
      const out = refineWordTimings(whisper, realClip, { biasCorrection: bias });
      const meanErr = out.reduce((s, x, i) => s + Math.abs(x.startMs - truth[i]!), 0) / out.length;
      expect(meanErr).toBe(0);
    }
  });
});
