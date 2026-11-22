import { describe, expect, it } from "vitest";
import { AUTO_DEG_PER_MS, RESUME_AFTER_MS, cardTransform, cylinderRadius, dragDeltaDeg, facing, facingOpacity, frontIndex, shouldResumeAutoRotate, stepDeg } from "../heroCylinderMath";

describe("hero cylinder geometry", () => {
  it("spaces 10 trending cards evenly around the ring", () => {
    expect(stepDeg(10)).toBe(36);
    expect(stepDeg(0)).toBe(0);
    expect(cardTransform(0, 10, 400)).toContain("rotateY(0deg)");
    expect(cardTransform(3, 10, 400)).toContain("rotateY(108deg)");
    expect(cardTransform(3, 10, 400)).toContain("translateZ(400px)");
  });

  it("radius grows with card width and with card count (same cards, bigger polygon)", () => {
    const r = cylinderRadius(280, 10);
    // (140 + 14) / tan(18deg) = 473.9
    expect(r).toBe(474);
    expect(cylinderRadius(200, 10)).toBeLessThan(r);
    expect(cylinderRadius(280, 12)).toBeGreaterThan(r);
    expect(cylinderRadius(280, 2)).toBe(0);
  });

  it("facing is 1 dead ahead, 0 edge-on and -1 facing away, wrapping past 360", () => {
    expect(facing(0, 10, 0)).toBeCloseTo(1);
    expect(facing(0, 10, 90)).toBeCloseTo(0);
    expect(facing(0, 10, 180)).toBeCloseTo(-1);
    expect(facing(0, 10, 360)).toBeCloseTo(1);
    expect(facing(5, 10, 0)).toBeCloseTo(-1);
  });

  it("frontIndex is the card facing dead ahead (the argmax of facing)", () => {
    for (const count of [10, 12, 14]) {
      for (let deg = 0; deg < 360; deg += 3) {
        // The nearest card sits at most half a step away: facing >= cos(step/2),
        // which is cos(18deg) ~= 0.951 for the widest (10-card) ring.
        const f = frontIndex(count, deg);
        expect(facing(f, count, deg)).toBeGreaterThan(0.95);
      }
    }
    expect(frontIndex(10, 0)).toBe(0);
    expect(frontIndex(10, 36)).toBe(9);
    expect(frontIndex(10, -36)).toBe(1);
    expect(frontIndex(10, 180)).toBe(5);
    expect(frontIndex(10, 360)).toBe(0);
    expect(frontIndex(0, 0)).toBe(0);
    // Exact half-step rotations tie two cards (same facing); either is front — the
    // round-half-up tie-break just picks the next one. Assert the tie, not the winner.
    expect(facing(6, 10, 126)).toBeCloseTo(facing(7, 10, 126));
    expect([6, 7]).toContain(frontIndex(10, 126));
  });

  it("opacity keeps backs readable as depth, never as competition", () => {
    expect(facingOpacity(1)).toBeCloseTo(1);
    expect(facingOpacity(0)).toBeCloseTo(0.45);
    expect(facingOpacity(-1)).toBeCloseTo(0.15);
  });

  it("drag and auto-rotation rates stay slow and deliberate", () => {
    expect(dragDeltaDeg(100)).toBeCloseTo(22);
    expect(AUTO_DEG_PER_MS * 72_000).toBeCloseTo(360);
    expect(RESUME_AFTER_MS).toBe(2500);
  });

  it("auto-rotation resumes only after the post-drag pause (and never while dragging)", () => {
    // mid-drag: never resumes, however long the drag lasts
    expect(shouldResumeAutoRotate(true, 10_000, 0)).toBe(false);
    expect(shouldResumeAutoRotate(true, 100_000, 0)).toBe(false);
    // drag just ended: still paused inside the 2.5s window (boundary is strict)
    expect(shouldResumeAutoRotate(false, 10_000, 9_000)).toBe(false);
    expect(shouldResumeAutoRotate(false, 10_000, 7_500)).toBe(false);
    // past the window: resumes
    expect(shouldResumeAutoRotate(false, 10_000, 7_499)).toBe(true);
    expect(shouldResumeAutoRotate(false, 10_000, 0)).toBe(true);
    // never dragged at all: resumes once the page is older than the window
    expect(shouldResumeAutoRotate(false, 2_500, 0)).toBe(false);
    expect(shouldResumeAutoRotate(false, 2_501, 0)).toBe(true);
  });
});
