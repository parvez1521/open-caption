import { describe, expect, it } from "vitest";
import {
  ALPHA_EXPORT_KINDS, CREATABLE_EXPORT_KINDS, CreateExportBody, EXPORT_EXTENSIONS, EXPORT_KINDS,
  RENDER_FORMATS, TEXT_EXPORT_KINDS, TEXT_EXPORT_MIME,
  CaptionDocSchema, RenderJobSchema, defaultSettings, defaultStyle,
} from "./index";

describe("CREATABLE_EXPORT_KINDS — the one list the API and the Export UI both derive from", () => {
  it("is exactly EXPORT_KINDS minus png, with no duplicates", () => {
    expect([...CREATABLE_EXPORT_KINDS].sort()).toEqual(EXPORT_KINDS.filter((k) => k !== "png").sort());
    expect(new Set(CREATABLE_EXPORT_KINDS).size).toBe(CREATABLE_EXPORT_KINDS.length);
  });

  it("keeps png in the schema kinds but out of the creatable set (no PNG stills are produced yet)", () => {
    expect(EXPORT_KINDS).toContain("png");
    expect(CREATABLE_EXPORT_KINDS).not.toContain("png");
  });

  it("partitions into the text kinds (made instantly) and the render kinds (companion jobs)", () => {
    const text = CREATABLE_EXPORT_KINDS.filter((k) => (TEXT_EXPORT_KINDS as readonly string[]).includes(k));
    const render = CREATABLE_EXPORT_KINDS.filter((k) => !(TEXT_EXPORT_KINDS as readonly string[]).includes(k));
    expect([...text].sort()).toEqual([...TEXT_EXPORT_KINDS].sort());
    // every non-text creatable kind is a real render format, and png is the only render format not creatable
    expect([...render].sort()).toEqual(RENDER_FORMATS.filter((f) => f !== "png").sort());
    expect([...ALPHA_EXPORT_KINDS].sort()).toEqual(["mov_alpha", "webm_alpha"]);
    for (const k of ALPHA_EXPORT_KINDS) expect(render).toContain(k);
  });

  it("names a file extension for every creatable kind and a MIME type for every text kind", () => {
    expect(EXPORT_EXTENSIONS).toEqual({
      mp4: "mp4", mov_alpha: "mov", webm_alpha: "webm",
      srt: "srt", vtt: "vtt", ass: "ass", txt: "txt", json: "json",
    });
    for (const k of TEXT_EXPORT_KINDS) expect(TEXT_EXPORT_MIME[k]).toBeTruthy();
  });
});

describe("CreateExportBody — the API side of the same list", () => {
  it.each(CREATABLE_EXPORT_KINDS)("accepts creating a %s export", (kind) => {
    expect(CreateExportBody.parse({ kind }).kind).toBe(kind);
  });

  it("rejects png: it is a known kind, but not a creatable one", () => {
    expect(CreateExportBody.safeParse({ kind: "png" }).success).toBe(false);
  });

  it("rejects unknown kinds", () => {
    expect(CreateExportBody.safeParse({ kind: "gif" }).success).toBe(false);
    expect(CreateExportBody.safeParse({}).success).toBe(false);
  });

  it("keeps the render options (dims, fps, crf, range) the render kinds are created with", () => {
    const body = CreateExportBody.parse({
      kind: "mov_alpha", width: 1080, height: 1920, fps: 30, crf: 20, range: { startMs: 1000, endMs: 5000 },
    });
    expect(body).toMatchObject({ kind: "mov_alpha", width: 1080, height: 1920, fps: 30, range: { startMs: 1000, endMs: 5000 } });
  });
});

describe("render job shape for the video kinds (what the route enqueues for the companion)", () => {
  const doc = CaptionDocSchema.parse({ version: 2, words: [{ id: "w1", text: "Hello", startMs: 0, endMs: 500 }] });
  const base = {
    kind: "render" as const, exportId: "exp-1", width: 1080, height: 1920, fps: 30, crf: 21,
    range: { startMs: 0, endMs: 4000 }, docSnapshot: doc, style: defaultStyle(), settings: defaultSettings(),
    fonts: [], sourceVideoId: "vid-1",
  };

  it.each(["mp4", "mov_alpha", "webm_alpha"] as const)("accepts a render job with format %s", (format) => {
    const job = RenderJobSchema.parse({ ...base, format });
    expect(job.format).toBe(format);
    expect(job.range).toEqual({ startMs: 0, endMs: 4000 });
  });

  it("does not accept a text kind as a render format", () => {
    expect(RenderJobSchema.safeParse({ ...base, format: "srt" }).success).toBe(false);
  });
});
