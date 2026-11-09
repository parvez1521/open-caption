/**
 * Motion-quality pass (2026-11-10): the shared layer's timing functions must keep the shapes that make
 * motion feel polished — settle overshoot, anticipation counter-move, tightened stagger, and eased
 * (not linear) highlight sweeps. All pure frame math: same values in picker, Player and export.
 */
import { describe, expect, it } from "vitest";
import { CaptionStyleSchema, type CaptionStyleV2 } from "@capseasy/shared";
import { activeEffect, overshootOut, staggerDelayMs, withAnticipation } from "./motion";

describe("overshootOut (entrance settle)", () => {
  it("starts at 0, ends at exactly 1, and overshoots into the 1.04–1.10 band in between", () => {
    expect(overshootOut(0)).toBeCloseTo(0);
    expect(overshootOut(1)).toBeCloseTo(1);
    let peak = 0;
    for (let t = 0; t <= 1.0001; t += 0.01) peak = Math.max(peak, overshootOut(t));
    expect(peak).toBeGreaterThan(1.04);
    expect(peak).toBeLessThan(1.1);
  });
  it("is deterministic and clamps outside [0,1]", () => {
    expect(overshootOut(0.63)).toBe(overshootOut(0.63));
    expect(overshootOut(-0.5)).toBeCloseTo(0);
    expect(overshootOut(1.5)).toBeCloseTo(1);
  });
});

describe("withAnticipation (travel entrances)", () => {
  it("dips negative early (a true counter-move), then rejoins plain progress by p = 0.4", () => {
    let min = Infinity;
    for (let p = 0; p <= 0.4; p += 0.01) min = Math.min(min, withAnticipation(p));
    expect(min).toBeLessThan(0);
    expect(min).toBeGreaterThan(-0.02); // a whisper of counter-move, not a bounce backwards
    expect(withAnticipation(0)).toBe(0);
    expect(withAnticipation(0.4)).toBeCloseTo(0.4);
    expect(withAnticipation(0.75)).toBe(0.75);
    expect(withAnticipation(1)).toBe(1);
  });
});

describe("stagger choreography", () => {
  const style = CaptionStyleSchema.parse({ entrance: { durationMs: 220 } }) as CaptionStyleV2;
  it("words cascade at 56 ms, letters at 22 ms (tightened from 70/28)", () => {
    expect(staggerDelayMs(style, 1, "word")).toBeCloseTo(56);
    expect(staggerDelayMs(style, 3, "word")).toBeCloseTo(168);
    expect(staggerDelayMs(style, 1, "char")).toBeCloseTo(22);
    expect(staggerDelayMs(style, 5, "char")).toBeCloseTo(110);
  });
});

describe("eased highlight sweeps (active effects)", () => {
  const word = { startMs: 1000, endMs: 1400 }; // 400 ms spoken word
  const styleWith = (effect: string) =>
    CaptionStyleSchema.parse({ active: { effect, color: "#FFA946", boxColor: "#FFA946", scale: 1.1, boxRadius: 10 } }) as CaptionStyleV2;

  it("box-sweep is eased: well past halfway across at the word's midpoint, complete before its end", () => {
    const mid = activeEffect(styleWith("box-sweep"), word, 1200, 30, 1, 1);
    const wMid = parseFloat(/calc\(([\d.]+)%/.exec(mid.behind!.css.width as string)![1]!);
    expect(wMid).toBeGreaterThan(70); // linear would be exactly 50
    const late = activeEffect(styleWith("box-sweep"), word, 1380, 30, 1, 1);
    const wLate = parseFloat(/calc\(([\d.]+)%/.exec(late.behind!.css.width as string)![1]!);
    expect(wLate).toBeGreaterThan(99); // sweep lands at ~85% of the word and settles
  });

  it("fill-sweep (karaoke) is eased, not a linear progress bar", () => {
    const mid = activeEffect(styleWith("fill-sweep"), word, 1200, 30, 1, 1);
    const p = parseFloat(/linear-gradient\(90deg, #FFA946 ([\d.]+)%/.exec(mid.css.backgroundImage as string)![1]!);
    expect(p).toBeGreaterThan(65); // linear would be exactly 50
    expect(p).toBeLessThan(100);
  });

  it("scribble-ring draws eased: more than half drawn a quarter of the way in", () => {
    const early = activeEffect(styleWith("scribble-ring"), word, 1075, 30, 1, 1);
    expect(early.ring!.progress).toBeGreaterThan(0.4); // linear would be 0.25 of the 300 ms draw
    const done = activeEffect(styleWith("scribble-ring"), word, 1310, 30, 1, 1);
    expect(done.ring!.progress).toBe(1);
  });

  it("spoken-word pop overshoots its target scale, then settles to it", () => {
    const style = styleWith("pop");
    let peak = 0;
    for (let t = 1000; t <= 1400; t += 16) {
      const r = activeEffect(style, word, t, 30, 1, 1);
      const m = /scale\(([\d.]+)\)/.exec(r.css.transform as string);
      if (m) peak = Math.max(peak, parseFloat(m[1]!));
    }
    expect(peak).toBeGreaterThan(1.1); // target is 1 + (1.1 - 1) = 1.10: the spring must pass it
    const settled = activeEffect(style, word, 1399, 30, 1, 1);
    const endScale = parseFloat(/scale\(([\d.]+)\)/.exec(settled.css.transform as string)![1]!);
    expect(Math.abs(endScale - 1.1)).toBeLessThan(0.02);
  });
});
