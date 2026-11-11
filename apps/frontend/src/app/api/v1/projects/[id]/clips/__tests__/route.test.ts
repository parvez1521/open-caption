// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level tests for POST /projects/:id/clips, database faked at the module
 * boundary (the projects route test's approach). They pin slice 5.4:
 * - a reframe window + a landscape source stores a 9:16 canvas and ONE composition
 *   segment carrying the window as its crop transform (settings + the Stage-C
 *   `composition_json` dual-write), and the row's aspect_ratio agrees;
 * - every other case (no window, portrait source, unknown dimensions) produces
 *   EXACTLY the pre-slice insert: no canvas change, no composition, aspect kept.
 */

const state = vi.hoisted(() => ({
  userDb: null as unknown,
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  video: null as Record<string, unknown> | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({ id: "user-1", guest: false, db: state.userDb }),
}));
vi.mock("@/lib/api/rateLimit", () => ({ rateLimit: async () => undefined }));

import { POST } from "../route";

const SRC_PROJECT = {
  title: "Long podcast",
  description: null,
  language: "en",
  aspect_ratio: "16:9",
  platform: "youtube",
  look_id: null,
  template_id: "tpl-1",
  style_json: {},
  settings_json: {},
  status: "ready",
};

const videoRow = (width: number, height: number) => ({
  storage_path: "local:video-1",
  preview_path: null,
  status: "ready",
  width,
  height,
  fps: 30,
  duration_ms: 120_000,
  has_audio: true,
  original_filename: "long.mp4",
  mime_type: "video/mp4",
  file_size: 1234,
  rotation: 0,
  probe_json: null,
});

/** Minimal chainable stand-in for the supabase query builder, as this route uses it. */
class FakeBuilder {
  private inserted: Record<string, unknown> | null = null;
  constructor(private table: string) {}
  select() { return this; }
  eq() { return this; }
  is() { return this; }
  order() { return this; }
  limit() { return this; }
  insert(row: Record<string, unknown>) {
    state.inserts.push({ table: this.table, row });
    this.inserted = row;
    return this;
  }
  async maybeSingle() {
    if (this.table === "projects") return { data: SRC_PROJECT, error: null };
    if (this.table === "videos") return { data: state.video, error: null };
    return { data: null, error: null };
  }
  async single() {
    if (this.table === "projects") return { data: { id: "clip-1", status: "ready", ...this.inserted }, error: null };
    if (this.table === "videos") return { data: { id: "video-copy-1" }, error: null };
    return { data: null, error: null };
  }
  // the caption_documents insert is awaited bare (no .single()): the builder is thenable
  then(resolve: (v: { data: null; error: null }) => void) {
    resolve({ data: null, error: null });
  }
}

const fakeDb = () => ({ from: (table: string) => new FakeBuilder(table) });

const DOC = { version: 2, words: [{ id: "w1", text: "hello", startMs: 0, endMs: 500 }] };

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/v1/projects/src-1/clips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "src-1" }) },
  );

const projectInsert = () => state.inserts.find((i) => i.table === "projects")!.row;

beforeEach(() => {
  state.userDb = fakeDb();
  state.inserts = [];
  state.video = videoRow(1920, 1080);
});

describe("POST /projects/:id/clips — reframing (5.4)", () => {
  it("a centred window on a 1920×1080 source stores the 9:16 canvas + crop segment, dual-written", async () => {
    const res = await post({ title: "Clip", startMs: 32_000, endMs: 65_000, doc: DOC, reframe: { x: 0.5, y: 0.5, zoom: 1 } });
    expect(res.status).toBe(201);
    const row = projectInsert();
    expect(row.aspect_ratio).toBe("9:16");
    const settings = row.settings_json as {
      canvas: { aspect: string };
      clipRange: { startMs: number; endMs: number };
      composition: { videoSegments: Array<{ sourceInMs: number; sourceOutMs: number; transform: { cropLeft: number; cropRight: number } }> };
    };
    expect(settings.canvas.aspect).toBe("9:16");
    expect(settings.clipRange).toEqual({ startMs: 32_000, endMs: 65_000 });
    expect(settings.composition.videoSegments).toHaveLength(1);
    const seg = settings.composition.videoSegments[0]!;
    expect(seg.sourceInMs).toBe(32_000);
    expect(seg.sourceOutMs).toBe(65_000);
    expect(seg.transform.cropLeft).toBeCloseTo(0.341796875, 9);
    expect(seg.transform.cropLeft).toBe(seg.transform.cropRight);
    // Stage-C dual-write: the column carries the same composition as the settings slice
    expect(row.composition_json).toEqual(settings.composition);
  });

  it("an off-centre window lands as asymmetric crops", async () => {
    const res = await post({ title: "Clip", startMs: 0, endMs: 30_000, doc: DOC, reframe: { x: 1, y: 0.5, zoom: 1 } });
    expect(res.status).toBe(201);
    const settings = projectInsert().settings_json as {
      composition: { videoSegments: Array<{ transform: { cropLeft: number; cropRight: number } }> };
    };
    const t = settings.composition.videoSegments[0]!.transform;
    expect(t.cropLeft).toBeCloseTo(0.68359375, 9);
    expect(t.cropRight).toBeCloseTo(0, 9);
  });

  it("no reframe window: the insert is exactly the pre-slice shape (regression)", async () => {
    const res = await post({ title: "Clip", startMs: 32_000, endMs: 65_000, doc: DOC });
    expect(res.status).toBe(201);
    const row = projectInsert();
    expect(row.aspect_ratio).toBe("16:9"); // the source's, untouched
    expect(row).not.toHaveProperty("composition_json");
    const settings = row.settings_json as { canvas: { aspect: string }; composition: { videoSegments: unknown[] } };
    expect(settings.canvas.aspect).toBe("source"); // schema default — no canvas change was stored
    expect(settings.composition.videoSegments).toEqual([]);
    // and the rest of the flow still happened: video row copied, caption doc stored
    expect(state.inserts.map((i) => i.table)).toEqual(["projects", "videos", "caption_documents"]);
    const json = (await res.json()) as { data: { videoId: string } };
    expect(json.data.videoId).toBe("video-copy-1");
  });

  it("a reframe window on a PORTRAIT source changes nothing (no vertical crop exists)", async () => {
    state.video = videoRow(1080, 1920);
    const res = await post({ title: "Clip", startMs: 0, endMs: 30_000, doc: DOC, reframe: { x: 0.5, y: 0.5, zoom: 1 } });
    expect(res.status).toBe(201);
    const row = projectInsert();
    expect(row.aspect_ratio).toBe("16:9");
    expect(row).not.toHaveProperty("composition_json");
    const settings = row.settings_json as { composition: { videoSegments: unknown[] } };
    expect(settings.composition.videoSegments).toEqual([]);
  });

  it("a reframe window with NO video row (unknown dimensions) changes nothing", async () => {
    state.video = null;
    const res = await post({ title: "Clip", startMs: 0, endMs: 30_000, doc: DOC, reframe: { x: 0.5, y: 0.5, zoom: 1 } });
    expect(res.status).toBe(201);
    const row = projectInsert();
    expect(row).not.toHaveProperty("composition_json");
    const json = (await res.json()) as { data: { videoId: string | null } };
    expect(json.data.videoId).toBeNull();
  });

  it("an out-of-range window is rejected by validation and nothing is written", async () => {
    const res = await post({ title: "Clip", startMs: 0, endMs: 30_000, doc: DOC, reframe: { x: 1.5, y: 0.5, zoom: 1 } });
    expect(res.status).toBe(422);
    expect(state.inserts).toEqual([]);
  });
});

describe("POST /projects/:id/clips — AI Clipping Studio (aspect + cropPath)", () => {
  const pathBody = {
    title: "Clip",
    startMs: 10_000,
    endMs: 50_000,
    doc: DOC,
    aspect: "9:16" as const,
    cropPath: {
      scenes: [
        { startMs: 10_000, endMs: 30_000, window: { x: 0.5, y: 0.5, zoom: 1 }, keyframes: [] },
        {
          startMs: 30_000,
          endMs: 50_000,
          window: { x: 0.8, y: 0.5, zoom: 1 },
          keyframes: [
            { atMs: 0, property: "offsetX" as const, value: 0 },
            { atMs: 5000, property: "offsetX" as const, value: -0.12 },
          ],
        },
      ],
    },
  };

  it("a crop path stores per-scene segments re-derived from the video's real dimensions, dual-written", async () => {
    const res = await post(pathBody);
    expect(res.status).toBe(201);
    const row = projectInsert();
    expect(row.aspect_ratio).toBe("9:16");
    const settings = row.settings_json as {
      canvas: { aspect: string };
      composition: {
        videoSegments: Array<{
          sourceInMs: number;
          sourceOutMs: number;
          transform: { cropLeft: number };
          keyframes: Array<{ property: string; value: number; atMs: number }>;
        }>;
      };
    };
    expect(settings.canvas.aspect).toBe("9:16");
    const segs = settings.composition.videoSegments;
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ sourceInMs: 10_000, sourceOutMs: 30_000 });
    expect(segs[1]).toMatchObject({ sourceInMs: 30_000, sourceOutMs: 50_000 });
    // scene 2's window sits right: its cropLeft is larger than the centred scene 1's
    expect(segs[1]!.transform.cropLeft).toBeGreaterThan(segs[0]!.transform.cropLeft);
    // the path's keyframes survive the round trip (the mapping they encode is compositions-pinned)
    expect(segs[1]!.keyframes).toHaveLength(2);
    expect(segs[1]!.keyframes[1]).toMatchObject({ property: "offsetX", value: -0.12, atMs: 5000 });
    expect(row.composition_json).toEqual(settings.composition);
  });

  it("aspect + a single window reframes for that aspect (1:1 geometry)", async () => {
    const res = await post({ title: "Clip", startMs: 0, endMs: 30_000, doc: DOC, aspect: "1:1", reframe: { x: 0.5, y: 0.5, zoom: 1 } });
    expect(res.status).toBe(201);
    const row = projectInsert();
    expect(row.aspect_ratio).toBe("1:1");
    const settings = row.settings_json as {
      canvas: { aspect: string };
      composition: { videoSegments: Array<{ transform: { cropLeft: number; cropRight: number } }> };
    };
    expect(settings.canvas.aspect).toBe("1:1");
    const t = settings.composition.videoSegments[0]!.transform;
    // 1:1 window on a 16:9 source: fw = 9/16, centred → cropLeft = (1 − 9/16) / 2
    expect(t.cropLeft).toBeCloseTo(0.21875, 9);
    expect(t.cropLeft).toBeCloseTo(t.cropRight, 9);
  });

  it("aspect alone is a canvas-only change (contain): no segments, no composition column", async () => {
    const res = await post({ title: "Clip", startMs: 0, endMs: 30_000, doc: DOC, aspect: "1:1" });
    expect(res.status).toBe(201);
    const row = projectInsert();
    expect(row.aspect_ratio).toBe("1:1");
    expect(row).not.toHaveProperty("composition_json");
    const settings = row.settings_json as { canvas: { aspect: string }; composition: { videoSegments: unknown[] } };
    expect(settings.canvas.aspect).toBe("1:1");
    expect(settings.composition.videoSegments).toEqual([]);
  });

  it("a crop path on a portrait source falls back to the canvas-only change", async () => {
    state.video = videoRow(1080, 1920);
    const res = await post(pathBody);
    expect(res.status).toBe(201);
    const row = projectInsert();
    expect(row).not.toHaveProperty("composition_json");
    const settings = row.settings_json as { canvas: { aspect: string }; composition: { videoSegments: unknown[] } };
    expect(settings.canvas.aspect).toBe("9:16");
    expect(settings.composition.videoSegments).toEqual([]);
  });

  it("an over-long crop path (25 scenes) is rejected by validation", async () => {
    const scenes = Array.from({ length: 25 }, (_, i) => ({
      startMs: i * 1000,
      endMs: i * 1000 + 500,
      window: { x: 0.5, y: 0.5, zoom: 1 },
      keyframes: [],
    }));
    const res = await post({ title: "Clip", startMs: 0, endMs: 30_000, doc: DOC, aspect: "9:16", cropPath: { scenes } });
    expect(res.status).toBe(422);
    expect(state.inserts).toEqual([]);
  });
});
