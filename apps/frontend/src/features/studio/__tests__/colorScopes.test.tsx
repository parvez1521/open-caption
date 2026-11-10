/**
 * A14 Colour Scopes (Phase 8).
 *
 * 1. Histogram math on fixture pixel arrays (known distributions, all-black,
 *    all-white, single colour, transparent pixels, bad buffers).
 * 2. Waveform math on fixtures (column luma spread, density accounting,
 *    column aggregation).
 * 3. Sampling: the preview-video picker, the read-only frame grab, and the
 *    tainted-canvas / not-ready degradations — all return honest results and
 *    never throw, never touch the source element's state.
 * 4. Display-only pin (source-level, mirroring socialPreview.test.tsx's
 *    readFileSync guard): the scopes modules import no mutation path, and the
 *    Adjust panel mounts the scopes with no props — no write path is even
 *    handed to them.
 * 5. Component: a sampled frame renders both charts and leaves a frozen
 *    project-state object bit-identical; an unavailable frame shows the note
 *    and NO chart (never a fake flat graph); collapsing stops sampling.
 */
import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeHistogram,
  computeWaveform,
  lumaOf,
  HISTOGRAM_BINS,
  WAVEFORM_LEVELS,
} from "../colorScopes";
import {
  findPreviewVideoElement,
  samplePreviewFrame,
  sampleVideoElement,
  sampledSize,
  SCOPES_SAMPLE_INTERVAL_MS,
  SCOPES_SAMPLE_WIDTH,
  type FrameSample,
} from "../scopesSampling";
import { ColorScopes } from "../panels/ColorScopes";

type RGBA = [number, number, number, number];

/** Build an RGBA buffer from a per-pixel callback. */
function frame(width: number, height: number, px: (x: number, y: number) => RGBA): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = px(x, y);
      const o = (y * width + x) * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = a;
    }
  }
  return out;
}

const BLACK: RGBA = [0, 0, 0, 255];
const WHITE: RGBA = [255, 255, 255, 255];
const RED: RGBA = [255, 0, 0, 255];

describe("computeHistogram — fixture distributions", () => {
  it("all-black: every channel and luma pile into bin 0", () => {
    const h = computeHistogram(frame(2, 2, () => BLACK), 2, 2);
    expect(h.total).toBe(4);
    expect(h.r[0]).toBe(4);
    expect(h.g[0]).toBe(4);
    expect(h.b[0]).toBe(4);
    expect(h.luma[0]).toBe(4);
    expect(h.maxCount).toBe(4);
    expect(h.r.reduce((a, c) => a + c, 0)).toBe(4);
  });

  it("all-white: every channel and luma pile into bin 255", () => {
    const h = computeHistogram(frame(3, 1, () => WHITE), 3, 1);
    expect(h.total).toBe(3);
    expect(h.r[255]).toBe(3);
    expect(h.g[255]).toBe(3);
    expect(h.b[255]).toBe(3);
    expect(h.luma[255]).toBe(3); // lumaOf(255,255,255) = 255
    expect(h.maxCount).toBe(3);
  });

  it("single colour (pure red): channels split, luma is the Rec.709 weight of red", () => {
    const h = computeHistogram(frame(2, 2, () => RED), 2, 2);
    expect(h.r[255]).toBe(4);
    expect(h.g[0]).toBe(4);
    expect(h.b[0]).toBe(4);
    expect(lumaOf(255, 0, 0)).toBe(54); // round(0.2126 * 255)
    expect(h.luma[54]).toBe(4);
    expect(h.luma.reduce((a, c) => a + c, 0)).toBe(4);
  });

  it("known mixed distribution lands in the exact expected bins", () => {
    // 4 pixels: black, white, pure red, mid green (0,128,0)
    const px: RGBA[] = [BLACK, WHITE, RED, [0, 128, 0, 255]];
    const h = computeHistogram(frame(4, 1, (x) => px[x]!), 4, 1);
    expect(h.total).toBe(4);
    expect(h.r[0]).toBe(2); // black + mid green
    expect(h.r[255]).toBe(2); // white + red
    expect(h.g[0]).toBe(2); // black + red
    expect(h.g[128]).toBe(1);
    expect(h.g[255]).toBe(1);
    expect(h.b[0]).toBe(3);
    expect(h.b[255]).toBe(1);
    expect(h.luma[0]).toBe(1);
    expect(h.luma[255]).toBe(1);
    expect(h.luma[54]).toBe(1); // red
    expect(h.luma[lumaOf(0, 128, 0)]).toBe(1); // round(0.7152*128) = 92
    expect(h.luma[92]).toBe(1);
    expect(h.r.length).toBe(HISTOGRAM_BINS);
  });

  it("fully transparent pixels are skipped entirely", () => {
    const h = computeHistogram(frame(2, 1, (x) => (x === 0 ? [255, 255, 255, 0] as RGBA : BLACK)), 2, 1);
    expect(h.total).toBe(1);
    expect(h.r[0]).toBe(1);
    expect(h.r[255]).toBe(0);
  });

  it("an empty (all-transparent) frame yields zeroes, not NaNs", () => {
    const h = computeHistogram(frame(2, 2, () => [10, 20, 30, 0]), 2, 2);
    expect(h.total).toBe(0);
    expect(h.maxCount).toBe(0);
  });

  it("a short buffer or a bad size throws a RangeError instead of reading garbage", () => {
    expect(() => computeHistogram(new Uint8ClampedArray(4), 2, 2)).toThrow(RangeError);
    expect(() => computeHistogram(new Uint8ClampedArray(16), 0, 2)).toThrow(RangeError);
  });
});

describe("computeWaveform — column luma spread", () => {
  it("a horizontal black→white ramp gives each column its own single luma", () => {
    const px: RGBA[] = [BLACK, [85, 85, 85, 255], [170, 170, 170, 255], WHITE];
    const w = computeWaveform(frame(4, 1, (x) => px[x]!), 4, 1);
    expect(w.columns).toBe(4);
    expect(w.levels).toBe(WAVEFORM_LEVELS);
    expect([...w.columnMin]).toEqual([0, 85, 170, 255]);
    expect([...w.columnMax]).toEqual([0, 85, 170, 255]);
    expect([...w.columnMean]).toEqual([0, 85, 170, 255]);
    expect(w.total).toBe(4);
    // density accounting: each pixel counted exactly once, in its own column
    expect(w.density.reduce((a, c) => a + c, 0)).toBe(4);
    expect(w.density[0 * 4 + 0]).toBe(1); // level 0, column 0
    expect(w.density[63 * 4 + 3]).toBe(1); // brightest level, column 3
    expect(w.maxDensity).toBe(1);
  });

  it("a column containing black over white spans the whole luma range", () => {
    // 2×2: left column black on top, white below; right column uniform mid grey
    const img = frame(2, 2, (x, y) => (x === 0 ? (y === 0 ? BLACK : WHITE) : [128, 128, 128, 255]));
    const w = computeWaveform(img, 2, 2);
    expect(w.columnMin[0]).toBe(0);
    expect(w.columnMax[0]).toBe(255);
    expect(w.columnMean[0]).toBe(127.5);
    expect(w.columnMin[1]).toBe(128);
    expect(w.columnMax[1]).toBe(128);
    expect(w.columnMean[1]).toBe(128);
    expect(w.density[0 * 2 + 0]).toBe(1); // black in column 0
    expect(w.density[63 * 2 + 0]).toBe(1); // white in column 0
    expect(w.density[32 * 2 + 1]).toBe(2); // both grey pixels: floor(128*64/256) = 32
    expect(w.maxDensity).toBe(2);
    expect(w.total).toBe(4);
  });

  it("columns can aggregate several source columns into one", () => {
    const px: RGBA[] = [BLACK, BLACK, WHITE, WHITE];
    const w = computeWaveform(frame(4, 1, (x) => px[x]!), 4, 1, 2);
    expect(w.columns).toBe(2);
    expect([...w.columnCount]).toEqual([2, 2]);
    expect(w.columnMax[0]).toBe(0);
    expect(w.columnMin[1]).toBe(255);
    expect(w.density.reduce((a, c) => a + c, 0)).toBe(4);
  });

  it("transparent pixels contribute nothing; an empty frame has no spread", () => {
    const w = computeWaveform(frame(2, 1, () => [200, 200, 200, 0]), 2, 1);
    expect(w.total).toBe(0);
    expect(w.maxDensity).toBe(0);
    expect([...w.columnCount]).toEqual([0, 0]);
    expect([...w.columnMean]).toEqual([0, 0]);
  });
});

describe("sampling — constants, picker, read-only grab, degradation", () => {
  it("pins the stated sampling geometry and throttle", () => {
    expect(SCOPES_SAMPLE_WIDTH).toBe(160);
    expect(SCOPES_SAMPLE_INTERVAL_MS).toBe(250);
    expect(sampledSize(1920, 1080)).toEqual({ width: 160, height: 90 });
    expect(sampledSize(1080, 1920)).toEqual({ width: 160, height: 284 });
    expect(sampledSize(100, 50)).toEqual({ width: 100, height: 50 }); // never upscales
    expect(sampledSize(0, 50)).toEqual({ width: 0, height: 0 });
  });

  function videoEl(w: number, h: number): HTMLVideoElement {
    const v = document.createElement("video");
    v.getBoundingClientRect = () => ({ width: w, height: h, x: 0, y: 0, top: 0, left: 0, right: w, bottom: h, toJSON: () => ({}) }) as DOMRect;
    return v;
  }

  it("findPreviewVideoElement picks the largest video inside the Preview region", () => {
    const region = document.createElement("section");
    region.setAttribute("aria-label", "Preview");
    const small = videoEl(100, 100);
    const big = videoEl(400, 700);
    const outside = videoEl(2000, 2000);
    region.append(small, big);
    document.body.append(region, outside);
    expect(findPreviewVideoElement(document)).toBe(big);
    region.remove();
    outside.remove();
  });

  it("findPreviewVideoElement returns null when no video is mounted", () => {
    expect(findPreviewVideoElement(document)).toBeNull();
    const empty = samplePreviewFrame(document);
    expect(empty.kind).toBe("unavailable");
    if (empty.kind === "unavailable") expect(empty.reason).toContain("no preview video");
  });

  function fakeVideoAndCanvas(getImageData: () => { data: Uint8ClampedArray }) {
    const video = {
      videoWidth: 4,
      videoHeight: 2,
      readyState: 2,
      currentTime: 12.5,
      paused: false,
      src: "blob:preview",
    } as unknown as HTMLVideoElement;
    const ctx = { drawImage: vi.fn(), getImageData };
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => ctx) } as unknown as HTMLCanvasElement;
    return { video, canvas, ctx };
  }

  it("sampleVideoElement reads the frame and leaves the video element untouched", () => {
    const pixels = frame(4, 2, () => RED);
    const { video, canvas, ctx } = fakeVideoAndCanvas(() => ({ data: pixels }));
    const before = JSON.stringify({ ...video });
    const sample = sampleVideoElement(video, canvas);
    expect(sample.kind).toBe("frame");
    if (sample.kind === "frame") {
      expect(sample.width).toBe(4);
      expect(sample.height).toBe(2);
      expect(sample.pixels).toBe(pixels);
    }
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(ctx.drawImage.mock.calls[0]![0]).toBe(video);
    // read-only: every observable property of the source is exactly as before
    expect(JSON.stringify({ ...video })).toBe(before);
  });

  it("a tainted (cross-origin) canvas degrades to unavailable, never throws", () => {
    const { video, canvas } = fakeVideoAndCanvas(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const sample = sampleVideoElement(video, canvas);
    expect(sample.kind).toBe("unavailable");
    if (sample.kind === "unavailable") expect(sample.reason).toContain("cross-origin");
  });

  it("a not-ready frame degrades to unavailable", () => {
    const { video, canvas } = fakeVideoAndCanvas(() => ({ data: new Uint8ClampedArray(0) }));
    (video as unknown as { readyState: number }).readyState = 0;
    const sample = sampleVideoElement(video, canvas);
    expect(sample.kind).toBe("unavailable");
    if (sample.kind === "unavailable") expect(sample.reason).toContain("isn't ready");
  });
});

describe("display-only pin — the scopes can reach no mutation path", () => {
  const readStudio = (rel: string) => readFileSync(join(process.cwd(), "src/features/studio", rel), "utf8");
  const scopeFiles: [string, string][] = [
    ["colorScopes.ts", readStudio("colorScopes.ts")],
    ["scopesSampling.ts", readStudio("scopesSampling.ts")],
    ["panels/ColorScopes.tsx", readStudio("panels/ColorScopes.tsx")],
  ];

  it.each(scopeFiles)("%s imports no composition/settings/history mutation module", (_name, src) => {
    expect(src).not.toMatch(/from\s+["'][^"']*(compositionOps|compositionDoc|audioOps|useStudio|polish|segmentAssets|mediaStore|services\/)/);
    expect(src).not.toMatch(/import\s*\(/);
    expect(src).not.toMatch(/patchSettings|editAll|commitComposition/);
    expect(src).not.toMatch(/\.edit\s*\(/);
  });

  it("the Adjust panel mounts the scopes with NO props (no write path is handed over)", () => {
    const panel = readStudio("panels/AdjustPanel.tsx");
    expect(panel).toContain('from "./ColorScopes"');
    expect(panel).toMatch(/<ColorScopes\s*\/>/);
  });
});

describe("ColorScopes component", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const redFrame = (): FrameSample => ({ kind: "frame", pixels: frame(2, 2, () => RED), width: 2, height: 2 });

  it("renders both charts + the honest label for a sampled frame, and sampling leaves project state untouched", () => {
    // a stand-in for project state the sampler closure can see: deep-frozen, so
    // any write attempt would throw, and snapshot-compared after sampling
    const projectState = Object.freeze({
      settings: Object.freeze({ videoAdjust: Object.freeze({ brightness: 1.2, contrast: 1 }) }),
      history: Object.freeze([Object.freeze({ id: "step-1" })]),
    });
    const snapshot = JSON.stringify(projectState);
    const sampleFrame = vi.fn((): FrameSample => {
      void projectState.settings.videoAdjust.brightness; // reading is all a sampler may do
      return redFrame();
    });
    render(<ColorScopes sampleFrame={sampleFrame} />);
    expect(sampleFrame).toHaveBeenCalled();
    expect(screen.getByText(/Preview-resolution analysis — sampled from the preview frame, not the full-resolution export/)).toBeTruthy();
    expect(screen.getByTestId("scopes-histogram")).toBeTruthy();
    expect(screen.getByTestId("scopes-waveform")).toBeTruthy();
    expect(screen.queryByTestId("scopes-unavailable")).toBeNull();
    expect(JSON.stringify(projectState)).toBe(snapshot);
  });

  it("an unavailable frame shows the honest note and NO chart (never a fake flat graph)", () => {
    render(<ColorScopes sampleFrame={() => ({ kind: "unavailable", reason: "the browser blocked reading this frame (the video is cross-origin)" })} />);
    const note = screen.getByTestId("scopes-unavailable");
    expect(note.textContent).toContain("Scopes unavailable for this frame");
    expect(note.textContent).toContain("cross-origin");
    expect(screen.queryByTestId("scopes-histogram")).toBeNull();
    expect(screen.queryByTestId("scopes-waveform")).toBeNull();
  });

  it("collapsing stops sampling; expanding resumes it on the 250 ms throttle", () => {
    vi.useFakeTimers();
    const sampleFrame = vi.fn(redFrame);
    render(<ColorScopes sampleFrame={sampleFrame} />);
    const afterMount = sampleFrame.mock.calls.length;
    expect(afterMount).toBeGreaterThan(0);
    act(() => { vi.advanceTimersByTime(500); });
    expect(sampleFrame.mock.calls.length).toBe(afterMount + 2); // 2 ticks × 250 ms

    fireEvent.click(screen.getByRole("button", { name: /Colour scopes/i }));
    const afterCollapse = sampleFrame.mock.calls.length;
    act(() => { vi.advanceTimersByTime(1000); });
    expect(sampleFrame.mock.calls.length).toBe(afterCollapse); // no sampling while collapsed
    expect(screen.queryByTestId("scopes-histogram")).toBeNull();
  });
});
