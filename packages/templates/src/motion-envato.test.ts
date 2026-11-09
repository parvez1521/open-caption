import { describe, expect, it } from "vitest";
import { defaultStyle } from "@capseasy/shared";
import {
  blockRevealAt, entranceStyle, flickerOpacity, glowBreath, jellyTransform, rollAt,
  scrambleDurationMs, scrambleGlyph, scrambledText, seededUnit, staggerUnit, writeOnTrail,
} from "./motion";

/**
 * Envato-styles wave (2026-11-10): every new motion primitive is a pure function of time/frame, so
 * the same input must give the same output in the picker, the studio preview and the export.
 */

describe("seededUnit", () => {
  it("is deterministic and stays in [0,1)", () => {
    for (const s of [0, 1, 7, 42, 4096, 123456]) {
      expect(seededUnit(s)).toBe(seededUnit(s));
      expect(seededUnit(s)).toBeGreaterThanOrEqual(0);
      expect(seededUnit(s)).toBeLessThan(1);
    }
    expect(new Set([0, 1, 2, 3, 4, 5].map(seededUnit)).size).toBeGreaterThan(4);
  });
});

describe("flickerOpacity (Neon Strike)", () => {
  it("is dark before and at the start, steady 1 at and after the window", () => {
    expect(flickerOpacity(-10)).toBe(0);
    expect(flickerOpacity(0)).toBe(0);
    expect(flickerOpacity(300)).toBe(1);
    expect(flickerOpacity(5000)).toBe(1);
  });
  it("flickers inside the window: both lit and dark buckets occur, deterministically", () => {
    const samples = Array.from({ length: 12 }, (_, b) => flickerOpacity(b * 26 + 13));
    expect(samples).toContain(1);
    expect(samples).toContain(0.08);
    expect(samples).toEqual(Array.from({ length: 12 }, (_, b) => flickerOpacity(b * 26 + 13)));
    // different letters (different seeds) do not all strike in lockstep
    const seedPatterns = [0, 1, 2].map((seed) =>
      Array.from({ length: 8 }, (_, b) => flickerOpacity(b * 26 + 13, seed)).join(""));
    expect(new Set(seedPatterns).size).toBeGreaterThan(1);
  });
  it("glow breath is bounded at ±15%", () => {
    for (let t = 0; t < 3000; t += 37) {
      expect(glowBreath(t)).toBeGreaterThanOrEqual(0.85);
      expect(glowBreath(t)).toBeLessThanOrEqual(1.15);
    }
  });
});

describe("scramble / decode resolve (Decode Resolve)", () => {
  it("glyph substitution is deterministic, never returns the original, and spares spaces/punctuation", () => {
    expect(scrambleGlyph("A", 3, 1)).toBe(scrambleGlyph("A", 3, 1));
    expect(scrambleGlyph("A", 3, 1)).not.toBe("A");
    expect(scrambleGlyph(" ", 3, 1)).toBe(" ");
    expect(scrambleGlyph("!", 3, 1)).toBe("!");
    expect(scrambleGlyph("a", 3, 1)).toBe(scrambleGlyph("a", 3, 1).toLowerCase());
  });
  it("resolves in reveal order and is fully real at the duration boundary", () => {
    const text = "DECODE";
    expect(scrambledText(text, 300, 5)).toBe(text);
    expect(scrambledText(text, 9999, 5)).toBe(text);
    expect(scrambledText(text, 0, 5)).not.toBe(text);
    // halfway: the first half is resolved, the rest is not
    const mid = scrambledText(text, 150, 5);
    expect(mid.slice(0, 3)).toBe("DEC");
    expect(mid.slice(3)).not.toBe("ODE");
    // resolved prefix only grows with time (monotone resolve)
    const resolvedCount = (s: string) => [...s].filter((c, i) => c === text[i]).length;
    let prev = -1;
    for (let t = 0; t <= 300; t += 25) {
      const n = resolvedCount(scrambledText(text, t, 5));
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
    // same inputs -> same output (frame-exact across preview and export)
    expect(scrambledText(text, 120, 7)).toBe(scrambledText(text, 120, 7));
  });
  it("duration is capped before the spoken midpoint and floored for short words", () => {
    expect(scrambleDurationMs({ startMs: 0, endMs: 1000 })).toBe(300);
    expect(scrambleDurationMs({ startMs: 0, endMs: 400 })).toBe(200);
    expect(scrambleDurationMs({ startMs: 0, endMs: 100 })).toBe(90);
  });
});

describe("blockRevealAt (Block Reveal)", () => {
  it("boundaries: nothing revealed at 0, fully revealed at duration, block gone after", () => {
    const start = blockRevealAt(0, 260);
    expect(start.clipRightPct).toBe(100);
    expect(start.blockScaleY).toBe(1);
    const end = blockRevealAt(260, 260);
    expect(end.clipRightPct).toBe(0);
    expect(end.done).toBe(true);
    expect(end.blockScaleY).toBe(0);
  });
  it("the block travels left to right and the clip follows its progress", () => {
    const a = blockRevealAt(65, 260);
    const b = blockRevealAt(195, 260);
    expect(b.blockLeftPct).toBeGreaterThan(a.blockLeftPct);
    expect(b.clipRightPct).toBeLessThan(a.clipRightPct);
    expect(blockRevealAt(130, 260)).toEqual(blockRevealAt(130, 260));
  });
  it("collapses only in the final 60 ms", () => {
    expect(blockRevealAt(200, 260).blockScaleY).toBe(1);
    expect(blockRevealAt(230, 260).blockScaleY).toBeLessThan(1);
    expect(blockRevealAt(230, 260).blockScaleY).toBeGreaterThan(0);
  });
});

describe("rollAt (Word Roll)", () => {
  it("boundaries: incoming starts a full height below, outgoing ends a full height above", () => {
    expect(rollAt(0, 180)).toMatchObject({ p: 0, incomingPct: 100, outgoingPct: 0 });
    expect(rollAt(180, 180)).toMatchObject({ p: 1, incomingPct: 0, outgoingPct: -100, done: true });
    expect(rollAt(-50, 180).incomingPct).toBe(100);
  });
  it("is monotonic and deterministic", () => {
    let prev = 101;
    for (let t = 0; t <= 180; t += 20) {
      const r = rollAt(t, 180);
      expect(r.incomingPct).toBeLessThanOrEqual(prev);
      prev = r.incomingPct;
    }
    expect(rollAt(90, 180)).toEqual(rollAt(90, 180));
  });
});

describe("writeOnTrail (Pen Reveal)", () => {
  it("extends at ~32 ms per character, holds, then fades out", () => {
    expect(writeOnTrail(-5, 5)).toEqual({ widthPct: 0, opacity: 0 });
    expect(writeOnTrail(0, 5).widthPct).toBe(0);
    expect(writeOnTrail(80, 5).widthPct).toBeCloseTo(50, 5);
    expect(writeOnTrail(160, 5)).toEqual({ widthPct: 100, opacity: 1 });
    const fading = writeOnTrail(310, 5);
    expect(fading.widthPct).toBe(100);
    expect(fading.opacity).toBeLessThan(1);
    expect(fading.opacity).toBeGreaterThan(0);
    expect(writeOnTrail(460, 5).opacity).toBe(0);
    expect(writeOnTrail(80, 5)).toEqual(writeOnTrail(80, 5));
  });
});

describe("jellyTransform (Jelly Settle)", () => {
  it("distorts shape: at the spring overshoot scaleX and scaleY move opposite ways (unlike elastic's uniform scale)", () => {
    // scan for the overshoot peak at 30 fps
    let peak = jellyTransform(0, 30);
    for (let t = 0; t <= 500; t += 10) {
      const j = jellyTransform(t, 30);
      if (j.scaleY > peak.scaleY) peak = j;
    }
    expect(peak.scaleY).toBeGreaterThan(1.05);
    expect(peak.scaleX).toBeLessThan(1);
    expect(peak.scaleX).not.toBeCloseTo(peak.scaleY, 2);
  });
  it("skew decays to ~0 and the shape settles to rest", () => {
    const early = Math.abs(jellyTransform(60, 30).skewDeg);
    const late = jellyTransform(1200, 30);
    expect(early).toBeGreaterThan(0.1);
    expect(Math.abs(late.skewDeg)).toBeLessThan(0.05);
    expect(Math.abs(late.scaleY - 1)).toBeLessThan(0.01);
    expect(Math.abs(late.scaleX - 1)).toBeLessThan(0.01);
    expect(jellyTransform(120, 30)).toEqual(jellyTransform(120, 30));
  });
  it("jelly's rendered transform differs from elastic's at the same moment and contains skew", () => {
    const base = defaultStyle({ entrance: { type: "jelly", durationMs: 420, stagger: "none", easing: "spring" } });
    const jellyCss = entranceStyle(base, 140, 30, 1);
    const elasticCss = entranceStyle(defaultStyle({ entrance: { type: "elastic", durationMs: 420, stagger: "none", easing: "spring" } }), 140, 30, 1);
    expect(String(jellyCss.transform)).toContain("skewX");
    expect(jellyCss.transform).not.toBe(elasticCss.transform);
  });
});

describe("stagger units for the new entrances", () => {
  const withType = (type: string) => defaultStyle({ entrance: { type: type as never, durationMs: 300, stagger: "none", easing: "outExpo" } });
  it("per-letter entrances stagger by char, roll by word, whole-page compositions by none", () => {
    expect(staggerUnit(withType("flicker"))).toBe("char");
    expect(staggerUnit(withType("scramble"))).toBe("char");
    expect(staggerUnit(withType("write-on"))).toBe("char");
    expect(staggerUnit(withType("roll"))).toBe("word");
    expect(staggerUnit(withType("block-reveal"))).toBe("none");
    expect(staggerUnit(withType("jelly"))).toBe("none");
  });
  it("every new entrance renders something at mid-entrance", () => {
    for (const type of ["flicker", "scramble", "block-reveal", "roll", "write-on", "jelly"]) {
      const css = entranceStyle(withType(type), 90, 30, 1);
      expect(Object.keys(css).length, type).toBeGreaterThan(0);
    }
  });
});
