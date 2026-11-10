/**
 * Standalone motion export (Wave 3): the option model, the composition builder, the run
 * helper and the state machine. The honesty pins matter most: every in-browser format is
 * opaque, the chroma label and the transparency line are the exact approved wording, and
 * a cancelled render saves nothing.
 */
import { describe, expect, it, vi } from "vitest";
import { MOTION_TEMPLATES, defaultMotionConfig } from "@capseasy/motion";
import { OverlayItemSchema } from "@capseasy/shared";
import {
  CHROMA_BACKGROUND_LABEL,
  DEFAULT_CHROMA_COLOR,
  MOTION_EXPORT_ASPECTS,
  MOTION_EXPORT_BACKGROUNDS,
  MOTION_EXPORT_FORMATS,
  MOTION_EXPORT_SHORT_EDGES,
  SOLID_BACKGROUND_FORMAT_NOTE,
  TRANSPARENT_EXPORT_NOTE,
  buildMotionExport,
  fitScaleForCanvas,
  initialMotionExportState,
  motionExportBackgroundColor,
  motionExportDimensions,
  motionExportReducer,
  runStandaloneExport,
  DEFAULT_MOTION_EXPORT_SELECTION,
  type MotionExportSelection,
} from "../exportConfig";
import { socialStageFor } from "@/features/studio/panels/socialStage";

const sel = (patch: Partial<MotionExportSelection> = {}): MotionExportSelection => ({ ...DEFAULT_MOTION_EXPORT_SELECTION, ...patch });

describe("option model + honest copy pins", () => {
  it("the chroma option carries the exact approved label and the default colour is pure green", () => {
    const chroma = MOTION_EXPORT_BACKGROUNDS.find((b) => b.id === "chroma")!;
    expect(chroma.label).toBe("Solid colour background for chroma-key removal in your editor");
    expect(CHROMA_BACKGROUND_LABEL).toBe(chroma.label);
    expect(DEFAULT_CHROMA_COLOR).toBe("#00FF00");
    expect(DEFAULT_MOTION_EXPORT_SELECTION.chromaColor).toBe("#00FF00");
  });

  it("the fixed backgrounds are Dark #141412, Black and White", () => {
    const byId = new Map(MOTION_EXPORT_BACKGROUNDS.map((b) => [b.id, b.color]));
    expect(byId.get("dark")).toBe("#141412");
    expect(byId.get("black")).toBe("#000000");
    expect(byId.get("white")).toBe("#FFFFFF");
    expect(byId.get("chroma")).toBeNull();
  });

  it("the format note and the transparency line are the exact approved wording", () => {
    expect(SOLID_BACKGROUND_FORMAT_NOTE).toBe("These files have a solid background");
    expect(TRANSPARENT_EXPORT_NOTE).toBe(
      "Transparent export: available via the desktop Companion app (MOV/WebM with alpha). In-browser exports use a solid background.",
    );
  });

  it("no in-browser format is transparent, alpha or described as transparent anywhere in the model", () => {
    expect(MOTION_EXPORT_FORMATS.map((f) => f.id)).toEqual(["mp4", "webm"]);
    for (const f of MOTION_EXPORT_FORMATS) {
      expect(f.transparent).toBe(false);
      expect(`${f.id} ${f.label} ${f.ext} ${f.container} ${f.videoCodec}`).not.toMatch(/alpha|transparent/i);
    }
    // the only place the word "transparent" appears in this module's copy is the honest
    // line that sends users to the Companion app
    for (const b of MOTION_EXPORT_BACKGROUNDS) expect(b.label).not.toMatch(/transparent/i);
  });

  it("offers exactly aspects 1:1 / 16:9 / 9:16 and short edges 720 / 1080", () => {
    expect(MOTION_EXPORT_ASPECTS).toEqual(["1:1", "16:9", "9:16"]);
    expect(MOTION_EXPORT_SHORT_EDGES).toEqual([720, 1080]);
  });
});

describe("dimensions (the shared short-edge rule)", () => {
  it.each([
    ["1:1", 720, { width: 720, height: 720 }],
    ["1:1", 1080, { width: 1080, height: 1080 }],
    ["16:9", 720, { width: 1280, height: 720 }],
    ["16:9", 1080, { width: 1920, height: 1080 }],
    ["9:16", 720, { width: 720, height: 1280 }],
    ["9:16", 1080, { width: 1080, height: 1920 }],
  ] as const)("%s at short edge %i", (aspect, edge, want) => {
    expect(motionExportDimensions(aspect, edge)).toEqual(want);
  });
});

describe("background colour resolution", () => {
  it("chroma uses the chosen colour, and an invalid colour falls back to pure green", () => {
    expect(motionExportBackgroundColor(sel({ background: "chroma", chromaColor: "#123ABC" }))).toBe("#123ABC");
    expect(motionExportBackgroundColor(sel({ background: "chroma", chromaColor: "green" }))).toBe("#00FF00");
    expect(motionExportBackgroundColor(sel({ background: "chroma", chromaColor: "#FFF" }))).toBe("#00FF00");
  });
  it("fixed backgrounds ignore the chroma colour", () => {
    expect(motionExportBackgroundColor(sel({ background: "dark", chromaColor: "#123ABC" }))).toBe("#141412");
    expect(motionExportBackgroundColor(sel({ background: "white" }))).toBe("#FFFFFF");
  });
});

describe("fitScaleForCanvas (centred stage-box fit, never clips)", () => {
  it("matches hand-computed fits", () => {
    // subscribe-pill stage 700x360 at sc=1 (1080 short edge): width binds on square canvas
    expect(fitScaleForCanvas("subscribe-pill", 1080, 1080)).toBeCloseTo(1.419, 3);
    expect(fitScaleForCanvas("subscribe-pill", 1920, 1080)).toBeCloseTo(2.523, 3);
    // tall stage (qr-frame 700x540): height binds on a landscape canvas
    expect(fitScaleForCanvas("qr-frame", 1920, 1080)).toBeCloseTo(1.84, 3);
    expect(fitScaleForCanvas("qr-frame", 1080, 1920)).toBeCloseTo(1.419, 3);
  });

  it("the fitted stage box fits inside every canvas, for every template and offered size", () => {
    for (const t of MOTION_TEMPLATES) {
      const stage = socialStageFor(t.id);
      for (const aspect of MOTION_EXPORT_ASPECTS) {
        for (const edge of MOTION_EXPORT_SHORT_EDGES) {
          const { width, height } = motionExportDimensions(aspect, edge);
          const scale = fitScaleForCanvas(t.id, width, height);
          const sc = Math.min(width, height) / 1080;
          expect(scale, `${t.id} ${aspect} ${edge}`).toBeGreaterThanOrEqual(0.25);
          expect(scale, `${t.id} ${aspect} ${edge}`).toBeLessThanOrEqual(4);
          expect(stage.width * sc * scale).toBeLessThanOrEqual(width + 0.5);
          expect(stage.height * sc * scale).toBeLessThanOrEqual(height + 0.5);
        }
      }
    }
  });
});

describe("buildMotionExport (composition from config)", () => {
  const config = defaultMotionConfig("subscribe-pill");

  it("builds one centred social item spanning the whole duration", () => {
    const built = buildMotionExport(config, sel());
    expect(built.item.kind).toBe("social");
    expect(built.item.variant).toBe("subscribe-pill");
    expect(built.item.startMs).toBe(0);
    expect(built.item.endMs).toBe(config.durationMs);
    expect(built.item.x).toBe(0.5);
    expect(built.item.y).toBe(0.5);
    expect(built.item.text).toBe(config.text);
    expect(built.item.color).toBe(config.color);
    expect(built.item.scale).toBe(fitScaleForCanvas("subscribe-pill", built.width, built.height));
    expect(OverlayItemSchema.safeParse(built.item).success).toBe(true);
  });

  it("the input is an overlay-only composition: no src, empty doc, backdrop = the solid colour, item in both overlay slots", () => {
    const built = buildMotionExport(config, sel({ background: "dark" }));
    expect(built.input.src).toBeNull();
    expect(built.input.mode).toBe("burn");
    expect(built.input.backdrop).toBe("#141412");
    expect(built.input.media).toMatchObject({ width: 1080, height: 1920, fps: 30, durationMs: config.durationMs });
    expect(built.input.doc?.words).toEqual([]);
    expect(built.input.overlays).toEqual([built.item]);
    expect(built.input.settings?.overlays).toEqual([built.item]);
    expect(built.backgroundColor).toBe("#141412");
    expect(built.durationMs).toBe(config.durationMs);
  });

  it("file naming is <template>-<w>x<h>.<ext> and the container/codec follow the format", () => {
    expect(buildMotionExport(config, sel()).filename).toBe("subscribe-pill-1080x1920.mp4");
    const webm = buildMotionExport(config, sel({ format: "webm", aspect: "16:9", shortEdge: 720 }));
    expect(webm.filename).toBe("subscribe-pill-1280x720.webm");
    expect(webm.container).toBe("webm");
    expect(webm.videoCodec).toBe("vp9");
    const mp4 = buildMotionExport(config, sel({ aspect: "1:1" }));
    expect(mp4.container).toBe("mp4");
    expect(mp4.videoCodec).toBe("h264");
  });

  it("fps flows into the media meta (60fps authors at 60)", () => {
    const built = buildMotionExport(config, sel({ fps: 60 }));
    expect(built.fps).toBe(60);
    expect(built.input.media?.fps).toBe(60);
  });

  it("an avatar/QR asset rides along only when a resolved URL exists", () => {
    const withAsset = buildMotionExport(config, sel(), { id: "a1", name: "me.png" }, "blob:preview");
    expect(withAsset.item.assetId).toBe("a1");
    expect(withAsset.input.overlayAssets).toEqual({ a1: "blob:preview" });
    const noUrl = buildMotionExport(config, sel(), { id: "a1", name: "me.png" });
    expect(noUrl.item.assetId).toBe("a1");
    expect(noUrl.input.overlayAssets).toBeUndefined();
    const noAsset = buildMotionExport(config, sel());
    expect(noAsset.item.assetId).toBeUndefined();
    expect(noAsset.input.overlayAssets).toBeUndefined();
  });
});

describe("motionExportReducer (cancel / error / progress handling)", () => {
  it("start -> progress (clamped) -> success", () => {
    let s = motionExportReducer(initialMotionExportState, { type: "start" });
    expect(s).toEqual({ status: "rendering", progress: 0 });
    s = motionExportReducer(s, { type: "progress", fraction: 0.4 });
    expect(s).toEqual({ status: "rendering", progress: 0.4 });
    s = motionExportReducer(s, { type: "progress", fraction: 1.7 });
    expect(s).toEqual({ status: "rendering", progress: 1 });
    s = motionExportReducer(s, { type: "progress", fraction: -1 });
    expect(s).toEqual({ status: "rendering", progress: 0 });
    s = motionExportReducer(s, { type: "success", filename: "a.mp4", sizeBytes: 10 });
    expect(s).toEqual({ status: "done", filename: "a.mp4", sizeBytes: 10 });
  });

  it("progress outside a render is ignored", () => {
    expect(motionExportReducer(initialMotionExportState, { type: "progress", fraction: 0.5 })).toEqual({ status: "idle" });
  });

  it("cancel returns to idle from rendering (not an error state)", () => {
    const rendering = motionExportReducer(initialMotionExportState, { type: "start" });
    expect(motionExportReducer(rendering, { type: "cancelled" })).toEqual({ status: "idle" });
  });

  it("failure keeps the real message", () => {
    const rendering = motionExportReducer(initialMotionExportState, { type: "start" });
    expect(motionExportReducer(rendering, { type: "failure", message: "encoder died" })).toEqual({ status: "error", message: "encoder died" });
  });
});

describe("runStandaloneExport", () => {
  const built = buildMotionExport(defaultMotionConfig("subscribe-pill"), sel());

  it("renders with the built job shape, then saves via the injected saver and reports the file", async () => {
    const blob = new Blob(["video-bytes"], { type: "video/mp4" });
    const render = vi.fn(async (job: { onProgress?: (f: number) => void }) => {
      job.onProgress?.(0.25);
      job.onProgress?.(1);
      return blob;
    });
    const save = vi.fn();
    const progress: number[] = [];
    const out = await runStandaloneExport({
      built,
      deps: { render: render as never, save },
      signal: new AbortController().signal,
      onProgress: (f) => progress.push(f),
    });
    expect(out).toEqual({ cancelled: false, filename: "subscribe-pill-1080x1920.mp4", sizeBytes: blob.size });
    expect(save).toHaveBeenCalledWith(blob, "subscribe-pill-1080x1920.mp4");
    expect(progress).toEqual([0.25, 1]);
    const job = (render.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(job).toMatchObject({ width: 1080, height: 1920, fps: 30, durationMs: 4000, quality: "high", container: "mp4", videoCodec: "h264" });
    expect(job.input).toBe(built.input);
  });

  it("a real render failure is rethrown with its message and nothing is saved", async () => {
    const render = vi.fn(async () => {
      throw new Error("VP9 encoder exploded");
    });
    const save = vi.fn();
    await expect(
      runStandaloneExport({ built, deps: { render, save }, signal: new AbortController().signal }),
    ).rejects.toThrow("VP9 encoder exploded");
    expect(save).not.toHaveBeenCalled();
  });

  it("an abort mid-render resolves as cancelled and saves nothing", async () => {
    const ctrl = new AbortController();
    const render = vi.fn(
      (job: { signal?: AbortSignal }) =>
        new Promise<Blob>((_resolve, reject) => {
          job.signal?.addEventListener("abort", () => reject(new Error("renderMediaOnWeb() was cancelled")));
        }),
    );
    const save = vi.fn();
    const pending = runStandaloneExport({ built, deps: { render: render as never, save }, signal: ctrl.signal });
    ctrl.abort();
    await expect(pending).resolves.toEqual({ cancelled: true });
    expect(save).not.toHaveBeenCalled();
  });

  it("an abort that lands after the render resolves still saves nothing", async () => {
    const ctrl = new AbortController();
    const render = vi.fn(async () => {
      ctrl.abort();
      return new Blob(["x"]);
    });
    const save = vi.fn();
    await expect(runStandaloneExport({ built, deps: { render, save }, signal: ctrl.signal })).resolves.toEqual({ cancelled: true });
    expect(save).not.toHaveBeenCalled();
  });
});
