import { describe, expect, it } from "vitest";
import { defaultStyle } from "@capseasy/shared";
import {
  FLAP_CHARSET, LOADED_WEIGHT_STEPS, activeEffect, entranceStyle, flapAt, flapText,
  panelsRevealAt, shimmerAt, staggerUnit, weightWaveAt,
} from "./motion";

/**
 * Animation-expansion wave (2026-11-10): split-flap, curtain panels, shimmer sweep, weight wave.
 * Every primitive is a pure function of time/index, so preview ≡ picker ≡ export by construction.
 */

describe("flapAt / flapText (Split-Flap Resolve)", () => {
  it("walks FORWARD through the ordered charset — never backwards, never random", () => {
    let prevIdx = -1;
    for (let t = 0; t <= 400; t += 16) {
      const s = flapAt("S", t, 400);
      const idx = FLAP_CHARSET.indexOf(s.glyph.toUpperCase());
      expect(idx).toBeGreaterThanOrEqual(prevIdx);
      expect(s.steps).toBeLessThanOrEqual(s.totalSteps);
      prevIdx = idx;
    }
    // intermediate glyphs are the intervening charset members, in order (that's what makes it
    // split-flap and not scramble, whose glyphs are seeded-random substitutes)
    const mid = flapAt("S", 200, 400);
    expect(mid.glyph).toBe(FLAP_CHARSET[mid.steps]);
    expect(mid.glyph).not.toBe("S");
  });
  it("resolution boundary: blank at 0, target at and after the duration, decelerating", () => {
    expect(flapAt("S", 0, 400).glyph).toBe(" ");
    expect(flapAt("S", -5, 400).glyph).toBe(" ");
    expect(flapAt("S", 400, 400)).toMatchObject({ glyph: "S", done: true, foldDeg: 0 });
    expect(flapAt("S", 9999, 400).glyph).toBe("S");
    // ease-out drum: more steps land in the first half than the second
    expect(flapAt("S", 200, 400).steps).toBeGreaterThan(flapAt("S", 400, 400).steps - flapAt("S", 200, 400).steps);
  });
  it("spaces and off-charset characters never flip; case is preserved; deterministic", () => {
    expect(flapAt(" ", 100, 400).glyph).toBe(" ");
    expect(flapAt("é", 100, 400).glyph).toBe("é");
    expect(flapAt("a", 400, 400).glyph).toBe("a");
    expect(flapAt("K", 137, 400)).toEqual(flapAt("K", 137, 400));
  });
  it("cascades left to right: earlier letters are further along the drum", () => {
    // per-char drum progress (not glyph index — different targets sit at different charset depths)
    const ps = [..."BOARD"].map((c, i) => flapAt(c, 120 - i * 30, 400).p);
    for (let i = 1; i < ps.length; i++) expect(ps[i]!).toBeLessThanOrEqual(ps[i - 1]!);
    expect(flapText("BOARD", 400 + 4 * 30, 400)).toBe("BOARD");
    expect(flapText("BOARD", 200, 400)).toBe(flapText("BOARD", 200, 400));
  });
  it("the tile folds only in the final flip window and rests flat when done", () => {
    expect(flapAt("S", 400, 400).foldDeg).toBe(0);
    const folding = flapAt("S", 350, 400).foldDeg;
    expect(folding).toBeGreaterThan(10);
  });
});

describe("panelsRevealAt (Curtain Panels)", () => {
  it("boundaries: all panels closed at 0, all retracted at duration", () => {
    const start = panelsRevealAt(0, 460);
    expect(start.panels).toHaveLength(4);
    expect(start.panels.every((p) => p.p === 0 && p.topPct === 0)).toBe(true);
    const end = panelsRevealAt(460, 460);
    expect(end.done).toBe(true);
    expect(end.panels.every((p) => p.topPct === -100)).toBe(true);
  });
  it("panels retract in stagger order and the wake follows the slowest", () => {
    const mid = panelsRevealAt(200, 460);
    for (let i = 1; i < 4; i++) expect(mid.panels[i]!.p).toBeLessThanOrEqual(mid.panels[i - 1]!.p);
    expect(mid.wake).toBe(Math.min(...mid.panels.map((p) => p.p)));
    expect(mid.panels[0]!.p).toBeGreaterThan(0);
    expect(panelsRevealAt(200, 460)).toEqual(panelsRevealAt(200, 460));
  });
  it("generalises block-reveal: it is the same wake idea with N>1 panels", () => {
    const one = panelsRevealAt(200, 460, 1);
    expect(one.panels).toHaveLength(1);
    expect(one.wake).toBe(one.panels[0]!.p);
  });
});

describe("shimmerAt (Shimmer Sweep)", () => {
  it("the band starts off the word, crosses it, and rests off it (unlike fill-sweep, which stays)", () => {
    expect(shimmerAt(0, 380).posPct).toBe(-20);
    const mid = shimmerAt(95, 380);
    expect(mid.posPct).toBeGreaterThan(30);
    expect(mid.posPct).toBeLessThan(90);
    const end = shimmerAt(380, 380);
    expect(end.posPct).toBe(120);
    expect(end.done).toBe(true);
    expect(shimmerAt(5000, 9000).posPct).toBe(120); // sweep capped at 500 ms even for long words
    expect(shimmerAt(120, 380).bandPct).toBe(18);
    expect(shimmerAt(120, 380)).toEqual(shimmerAt(120, 380));
  });
  it("the active effect paints the band in the highlight colour (active.color MUST-WIRE)", () => {
    const style = defaultStyle({ fontWeight: 700, active: { effect: "shimmer", color: "#123456", scale: 1, boxRadius: 10 } });
    const res = activeEffect(style, { startMs: 0, endMs: 380 }, 190, 30, 1, 1);
    expect(String(res.css.backgroundImage)).toContain("#123456");
    expect(res.css.WebkitBackgroundClip).toBe("text");
    // after the sweep the word rests at its fill colour with no band colour stop dominating
    const rest = activeEffect(style, { startMs: 0, endMs: 380 }, 5000, 30, 1, 1);
    expect(String(rest.css.backgroundImage)).toContain("120.0%");
  });
});

describe("weightWaveAt (Weight Wave — stepped, honest)", () => {
  it("swells on a sine over the spoken duration: base at both ends, peak mid-word", () => {
    expect(weightWaveAt(0, 400, 600).swell).toBe(0);
    expect(weightWaveAt(400, 400, 600).swell).toBeCloseTo(0, 5);
    expect(weightWaveAt(200, 400, 600).swell).toBeCloseTo(1, 5);
  });
  it("the shipped weight is STEPPED to a loaded discrete weight (no variable axis in our loader)", () => {
    for (let t = 0; t <= 400; t += 25) {
      const w = weightWaveAt(t, 400, 600);
      expect(LOADED_WEIGHT_STEPS).toContain(w.weight as never);
      expect(w.weight).toBeGreaterThanOrEqual(600);
      expect(w.weight).toBeLessThanOrEqual(900);
    }
    // base 600 peaks at the +300 ceiling (900); base 800 caps at 900, never beyond
    expect(weightWaveAt(200, 400, 600).weight).toBe(900);
    expect(weightWaveAt(200, 400, 600).idealWeight).toBe(900);
    expect(weightWaveAt(200, 400, 800).weight).toBe(900);
    expect(weightWaveAt(200, 400, 800).idealWeight).toBe(1100);
    expect(weightWaveAt(137, 400, 600)).toEqual(weightWaveAt(137, 400, 600));
  });
  it("the active effect changes the rendered fontWeight mid-word and restores it at the ends", () => {
    const style = defaultStyle({ fontWeight: 600, active: { effect: "weight-wave", color: "#34D399", scale: 1, boxRadius: 10 } });
    const mid = activeEffect(style, { startMs: 100, endMs: 500 }, 300, 30, 1, 1);
    expect(mid.css.fontWeight).toBe(900);
    expect(mid.css.color).toBe("#34D399");
    const end = activeEffect(style, { startMs: 100, endMs: 500 }, 500, 30, 1, 1);
    expect(end.css.fontWeight).toBe(600);
  });
});

describe("entrance wiring for the new entrances", () => {
  const withType = (type: string) => defaultStyle({ entrance: { type: type as never, durationMs: 300, stagger: "none", easing: "outExpo" } });
  it("split-flap staggers by char; panels-reveal is a whole-page composition", () => {
    expect(staggerUnit(withType("split-flap"))).toBe("char");
    expect(staggerUnit(withType("panels-reveal"))).toBe("none");
  });
  it("both render card-level motion at mid-entrance", () => {
    for (const type of ["split-flap", "panels-reveal"]) {
      const css = entranceStyle(withType(type), 120, 30, 1);
      expect(Object.keys(css).length, type).toBeGreaterThan(0);
    }
    const panels = entranceStyle(withType("panels-reveal"), 120, 30, 1);
    expect(String(panels.clipPath)).toContain("inset");
  });
});
