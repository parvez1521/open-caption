import { describe, expect, it } from "vitest";
import { AUTO_DEG_PER_MS, RESUME_AFTER_MS, cardTransform, cylinderRadius, dragDeltaDeg, facing, facingOpacity, stepDeg } from "../heroCylinderMath";

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
});
