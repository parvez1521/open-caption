import { describe, expect, it } from "vitest";
import { canvasDims, canvasOf, effectiveAspect, DEFAULT_CANVAS_SETTINGS } from "../canvas";

describe("canvasOf", () => {
  it("defaults to source aspect + blur background when settings carry no canvas", () => {
    expect(canvasOf({})).toEqual(DEFAULT_CANVAS_SETTINGS);
    expect(canvasOf(null)).toEqual(DEFAULT_CANVAS_SETTINGS);
    expect(canvasOf(undefined)).toEqual(DEFAULT_CANVAS_SETTINGS);
  });

  it("passes a stored canvas through, and repairs invalid fields individually", () => {
    expect(canvasOf({ canvas: { aspect: "4:5", background: "#101010" } })).toEqual({ aspect: "4:5", background: "#101010" });
    expect(canvasOf({ canvas: { aspect: "bogus", background: "" } })).toEqual({ aspect: "source", background: "blur" });
    expect(canvasOf({ canvas: { aspect: "16:9" } })).toEqual({ aspect: "16:9", background: "blur" });
  });
});

describe("canvasDims", () => {
  it("aspect 'source' passes the source dims through untouched", () => {
    expect(canvasDims({ aspect: "source" }, 1080, 1920)).toEqual({ width: 1080, height: 1920 });
    expect(canvasDims({ aspect: "source" }, 1920, 1080)).toEqual({ width: 1920, height: 1080 });
  });

  it("fits a portrait aspect inside a landscape source box (both dims ≤ source, exact ratio)", () => {
    // 9:16 inside 1920×1080: height-bound → 1080 tall, 1080*9/16 = 607.5 → even 608
    const d = canvasDims({ aspect: "9:16" }, 1920, 1080);
    expect(d.height).toBe(1080);
    expect(d.width).toBeLessThanOrEqual(1920);
    expect(Math.abs(d.width / d.height - 9 / 16)).toBeLessThan(0.01);
    expect(d.width % 2).toBe(0);
    expect(d.height % 2).toBe(0);
  });

  it("fits a landscape aspect inside a portrait source box", () => {
    // 16:9 inside 1080×1920: width-bound → 1080 wide, 1080*9/16 = 607.5 → even 608
    const d = canvasDims({ aspect: "16:9" }, 1080, 1920);
    expect(d.width).toBe(1080);
    expect(d.height).toBeLessThanOrEqual(1920);
    expect(Math.abs(d.width / d.height - 16 / 9)).toBeLessThan(0.01);
  });

  it("square and 4:5 aspects fit inside either orientation", () => {
    expect(canvasDims({ aspect: "1:1" }, 1920, 1080)).toEqual({ width: 1080, height: 1080 });
    expect(canvasDims({ aspect: "1:1" }, 1080, 1920)).toEqual({ width: 1080, height: 1080 });
    const d = canvasDims({ aspect: "4:5" }, 1080, 1920);
    expect(d).toEqual({ width: 1080, height: 1350 });
  });

  it("never returns odd or sub-2 dimensions, even for tiny sources", () => {
    const d = canvasDims({ aspect: "9:16" }, 3, 3);
    expect(d.width).toBeGreaterThanOrEqual(2);
    expect(d.height).toBeGreaterThanOrEqual(2);
    expect(d.width % 2).toBe(0);
    expect(d.height % 2).toBe(0);
  });

  it("the same aspect as the source returns (even-rounded) source dims", () => {
    expect(canvasDims({ aspect: "9:16" }, 1080, 1920)).toEqual({ width: 1080, height: 1920 });
    expect(canvasDims({ aspect: "16:9" }, 1920, 1080)).toEqual({ width: 1920, height: 1080 });
  });
});

describe("effectiveAspect", () => {
  it("is the canvas aspect when one is chosen, else the source's own W:H", () => {
    expect(effectiveAspect({ aspect: "1:1" }, 1080, 1920)).toBe("1:1");
    expect(effectiveAspect({ aspect: "source" }, 1080, 1920)).toBe("1080:1920");
    expect(effectiveAspect({ aspect: "source" }, 1920, 1080)).toBe("1920:1080");
  });
});
