import { describe, expect, it, vi } from "vitest";
import {
  clipFileName,
  exportClipProject,
  runBatchExport,
  type BatchExportDeps,
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
    billing: {
      reserve: vi.fn(async () => ({ minutes: 1 })),
      settle: vi.fn(async () => ({})),
    },
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

describe("minutes billing — reserve before render, settle after save", () => {
  it("reserves before rendering and settles completed after the save", async () => {
    const d = deps();
    const reserve = d.billing!.reserve as ReturnType<typeof vi.fn>;
    const settle = d.billing!.settle as ReturnType<typeof vi.fn>;
    const results = await runBatchExport(["a"], { deps: d });
    expect(results[0]!.ok).toBe(true);
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(reserve.mock.calls[0]![0]).toBe("a");
    expect(reserve.mock.calls[0]![1]).toMatchObject({ kind: "mp4" });
    expect(typeof reserve.mock.calls[0]![1].exportId).toBe("string");
    expect(settle).toHaveBeenCalledTimes(1);
    expect(settle.mock.calls[0]![0]).toBe("a");
    expect(settle.mock.calls[0]![1]).toMatchObject({ kind: "mp4", outcome: "completed", actualMinutes: 1 });
    expect(settle.mock.calls[0]![1].exportId).toBe(reserve.mock.calls[0]![1].exportId);
    // reserve ran before the render: the mock render records its call order
    const order: string[] = [];
    const d2 = deps({
      billing: {
        reserve: vi.fn(async () => { order.push("reserve"); return { minutes: 1 }; }),
        settle: vi.fn(async () => { order.push("settle"); return {}; }),
      },
      render: async () => { order.push("render"); return new Blob(["x"], { type: "video/mp4" }); },
    });
    await runBatchExport(["a"], { deps: d2 });
    expect(order).toEqual(["reserve", "render", "settle"]);
  });

  it("a failed render refunds the hold and the batch continues", async () => {
    const d = deps({
      render: async (job) => {
        if (job.title.includes("bad")) throw new Error("encoder exploded");
        return new Blob(["x"], { type: "video/mp4" });
      },
      loadJob: async (id) => fakeJob(id === "bad" ? "bad clip" : `Clip ${id}`),
    });
    const settle = d.billing!.settle as ReturnType<typeof vi.fn>;
    const results = await runBatchExport(["one", "bad", "three"], { deps: d });
    expect(results.map((r) => r.ok)).toEqual([true, false, true]);
    const failedSettles = settle.mock.calls.filter((c) => (c[1] as { outcome: string }).outcome === "failed");
    expect(failedSettles).toHaveLength(1);
    expect(failedSettles[0]![0]).toBe("bad");
    expect(settle.mock.calls.filter((c) => (c[1] as { outcome: string }).outcome === "completed")).toHaveLength(2);
  });

  it("a reserve failure (minutes used up) fails just that clip and the batch continues", async () => {
    const d = deps({
      billing: {
        reserve: vi.fn(async (projectId: string) => {
          if (projectId === "broke") throw new Error("Monthly minutes used up — your plan includes 5 minutes a month. Upgrade for more minutes.");
          return { minutes: 1 };
        }),
        settle: vi.fn(async () => ({})),
      },
    });
    const results = await runBatchExport(["ok", "broke", "ok2"], { deps: d });
    expect(results.map((r) => r.ok)).toEqual([true, false, true]);
    expect(results[1]!.message).toMatch(/Monthly minutes used up/);
  });

  it("a load failure reserves nothing", async () => {
    const d = deps({
      loadJob: async (id) => {
        if (id === "gone") throw new Error("The video file isn't on this device.");
        return fakeJob(`Clip ${id}`);
      },
    });
    const reserve = d.billing!.reserve as ReturnType<typeof vi.fn>;
    const results = await runBatchExport(["gone", "ok"], { deps: d });
    expect(results.map((r) => r.ok)).toEqual([false, true]);
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(reserve.mock.calls[0]![0]).toBe("ok");
  });
});
