import { describe, expect, it, vi } from "vitest";
import {
  QUOTA_LIMIT_MESSAGE,
  clipFileName,
  exportClipProject,
  runBatchExport,
  type BatchExportDeps,
  type ClipQuotaDeps,
  type ClipRenderJob,
} from "./batchExport";

/**
 * Batch export tests (brief §11): the orchestration — sequential order,
 * per-clip progress events, and above all FAILURE ISOLATION (one clip's
 * failure never kills the batch, and the failed clip stays retryable) — is
 * exercised with injected deps, so no encoder runs here. The render job
 * assembly itself mirrors StudioPage field-for-field (see batchExport.ts).
 */

const fakeJob = (title: string): ClipRenderJob => ({
  input: {} as ClipRenderJob["input"],
  width: 1080,
  height: 1920,
  fps: 30,
  durationMs: 30_000,
  title,
  dispose: vi.fn(),
});

function deps(over: Partial<BatchExportDeps> = {}): BatchExportDeps {
  return {
    loadJob: async (id) => fakeJob(`Clip ${id}`),
    render: async (_job, onProgress) => {
      onProgress(0.5);
      onProgress(1);
      return new Blob(["x"], { type: "video/mp4" });
    },
    save: vi.fn(),
    ...over,
  };
}

describe("runBatchExport", () => {
  it("exports every clip in order and reports progress + done per clip", async () => {
    const events: string[] = [];
    const d = deps();
    const results = await runBatchExport(["a", "b"], {
      deps: d,
      onEvent: (e) => events.push(e.type === "progress" ? `progress:${e.projectId}:${e.fraction}` : `${e.type}:${e.projectId}`),
    });
    expect(results.map((r) => [r.projectId, r.ok])).toEqual([
      ["a", true],
      ["b", true],
    ]);
    expect(events).toContain("start:a");
    expect(events).toContain("progress:a:0.5");
    expect(events).toContain("done:b");
    expect(d.save).toHaveBeenCalledTimes(2);
  });

  it("isolates a single clip's failure: the rest still export, and the failure is retryable", async () => {
    const d = deps({
      render: async (job) => {
        if (job.title.includes("bad")) throw new Error("encoder exploded");
        return new Blob(["x"], { type: "video/mp4" });
      },
      loadJob: async (id) => fakeJob(id === "bad" ? "bad clip" : `Clip ${id}`),
    });
    const events: string[] = [];
    const results = await runBatchExport(["one", "bad", "three"], {
      deps: d,
      onEvent: (e) => events.push(`${e.type}:${e.projectId}`),
    });
    expect(results.map((r) => r.ok)).toEqual([true, false, true]);
    expect(results[1]!.message).toMatch(/encoder exploded/);
    expect(events).toContain("failed:bad");
    expect(events.indexOf("done:three")).toBeGreaterThan(events.indexOf("failed:bad"));

    // retry of just the failed clip, with a healthy renderer, succeeds
    const retry = await runBatchExport(["bad"], { deps: deps() });
    expect(retry[0]!.ok).toBe(true);
  });

  it("a load failure (video not on this device) is isolated the same way", async () => {
    const d = deps({
      loadJob: async (id) => {
        if (id === "gone") throw new Error("The video file isn't on this device.");
        return fakeJob(`Clip ${id}`);
      },
    });
    const results = await runBatchExport(["gone", "ok"], { deps: d });
    expect(results.map((r) => r.ok)).toEqual([false, true]);
    expect(results[0]!.message).toMatch(/isn't on this device/);
  });

  it("disposes every loaded job, success or failure", async () => {
    const job = fakeJob("Clip x");
    const d = deps({
      loadJob: async () => job,
      render: async () => {
        throw new Error("boom");
      },
    });
    await expect(exportClipProject("x", { deps: d })).rejects.toThrow(/boom/);
    expect(job.dispose).toHaveBeenCalledTimes(1);
  });
});

describe("clipFileName", () => {
  it("sanitises titles the way the Studio's export does", () => {
    expect(clipFileName("My great clip! (2026)")).toBe("My-great-clip-2026.mp4");
    expect(clipFileName("")).toBe("captionit.mp4");
  });
});

describe("monthly video quota (E-02)", () => {
  function quota(over: Partial<ClipQuotaDeps> = {}): ClipQuotaDeps {
    return {
      checkQuota: async () => ({ remaining: 5 }),
      reserve: vi.fn(async () => ({ reserved: true })),
      release: vi.fn(async () => undefined),
      record: vi.fn(async () => undefined),
      ...over,
    };
  }

  it("blocks the export at the limit before rendering anything", async () => {
    const render = vi.fn(async () => new Blob(["x"], { type: "video/mp4" }));
    const save = vi.fn();
    const q = quota({ checkQuota: async () => ({ remaining: 0 }) });
    await expect(exportClipProject("x", { deps: deps({ render, save, quota: q }) })).rejects.toThrow(QUOTA_LIMIT_MESSAGE);
    expect(render).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(q.reserve).not.toHaveBeenCalled();
  });

  it("blocks when the server reservation says the cap is hit", async () => {
    const render = vi.fn(async () => new Blob(["x"], { type: "video/mp4" }));
    const q = quota({ reserve: vi.fn(async () => ({ reserved: false, limited: true })) });
    await expect(exportClipProject("x", { deps: deps({ render, quota: q }) })).rejects.toThrow(QUOTA_LIMIT_MESSAGE);
    expect(render).not.toHaveBeenCalled();
    expect(q.record).not.toHaveBeenCalled();
  });

  it("reserves before rendering and records once, with the same export id", async () => {
    const q = quota();
    const d = deps({ quota: q });
    const done = await exportClipProject("x", { deps: d });
    expect(done.name).toBe("Clip-x.mp4");
    expect(q.reserve).toHaveBeenCalledTimes(1);
    expect(q.record).toHaveBeenCalledTimes(1);
    expect(q.release).not.toHaveBeenCalled();
    const reservedId = (q.reserve as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    const recordedId = (q.record as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(recordedId).toBe(reservedId);
    expect((q.reserve as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe("x");
    expect((q.record as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe("x");
  });

  it("a failed render releases the reservation and records nothing", async () => {
    const q = quota();
    const d = deps({
      quota: q,
      render: async () => {
        throw new Error("encoder exploded");
      },
    });
    await expect(exportClipProject("x", { deps: d })).rejects.toThrow(/encoder exploded/);
    expect(q.release).toHaveBeenCalledTimes(1);
    expect(q.record).not.toHaveBeenCalled();
    const releasedId = (q.release as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(releasedId).toBe((q.reserve as ReturnType<typeof vi.fn>).mock.calls[0]![1]);
  });

  it("a batch at the limit fails every clip with the limit message and renders nothing", async () => {
    const render = vi.fn(async () => new Blob(["x"], { type: "video/mp4" }));
    const q = quota({ checkQuota: async () => ({ remaining: 0 }) });
    const results = await runBatchExport(["a", "b"], { deps: deps({ render, quota: q }) });
    expect(results.map((r) => r.ok)).toEqual([false, false]);
    expect(results[0]!.message).toBe(QUOTA_LIMIT_MESSAGE);
    expect(render).not.toHaveBeenCalled();
    expect(q.record).not.toHaveBeenCalled();
  });

  it("a batch records once per finished clip, each with its own export id", async () => {
    const q = quota();
    const results = await runBatchExport(["a", "b"], { deps: deps({ quota: q }) });
    expect(results.map((r) => r.ok)).toEqual([true, true]);
    expect(q.reserve).toHaveBeenCalledTimes(2);
    expect(q.record).toHaveBeenCalledTimes(2);
    const ids = (q.record as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1] as string);
    expect(new Set(ids).size).toBe(2);
  });
});
