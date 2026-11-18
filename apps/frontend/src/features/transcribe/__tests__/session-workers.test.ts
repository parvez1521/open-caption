import { describe, expect, it, vi } from "vitest";

/**
 * PER-05-B: two transcription runs in one tab must not fight over a single
 * shared worker. The old code gave every session the same singleton worker:
 * the second run's `worker.onmessage = …` overwrote the first run's handler,
 * and a failing session's `dropWorker` terminated the shared worker under the
 * other run. Now each run gets its own worker from `createSpeechWorker` and
 * only ever drops a worker it owns.
 */

type FakeWorker = {
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  terminated: boolean;
  terminate: () => void;
};

const workers: FakeWorker[] = [];
const dropped: FakeWorker[] = [];
const sent: Array<{ worker: FakeWorker; message: unknown }> = [];

const makeWorker = (): FakeWorker => {
  const w: FakeWorker = {
    onmessage: null,
    onerror: null,
    terminated: false,
    terminate() {
      this.terminated = true;
    },
  };
  workers.push(w);
  return w;
};

vi.mock("../browserWhisper", () => ({
  decodeAudio: vi.fn(async () => new Float32Array(0)),
  dropWorker: vi.fn((w: FakeWorker) => {
    dropped.push(w);
    w.terminate();
  }),
  sendToWorker: (w: FakeWorker, m: unknown) => sent.push({ worker: w, message: m }),
  createSpeechWorker: () => makeWorker(),
  withRetry: async <T,>(fn: () => Promise<T>) => fn(),
}));
vi.mock("@/features/upload/localVideos", () => ({
  getProgress: vi.fn(async () => null),
  saveProgress: vi.fn(async () => undefined),
  deleteProgress: vi.fn(async () => undefined),
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
vi.mock("@/services/api-client", () => ({ apiClient: { post: vi.fn(async () => ({})) } }));
vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

import { startSession } from "../session";

const partial = {
  type: "partial",
  words: [{ text: "hello", startMs: 0, endMs: 500 }],
  audioEndMs: 5000,
  progress: 0.5,
  windows: 1,
  windowIndex: 0,
  durationMs: 10_000,
  device: "wasm",
};

describe("two transcription sessions in one tab — PER-05-B", () => {
  it("each run gets its own worker and hears only its own messages", async () => {
    const a = startSession({ projectId: `pA-${Math.random()}`, videoId: "v-a", file: new Blob(["x"]), language: "en" });
    const b = startSession({ projectId: `pB-${Math.random()}`, videoId: "v-b", file: new Blob(["x"]), language: "en" });
    await vi.waitFor(() => expect(workers.length).toBe(2));
    const [workerA, workerB] = workers as [FakeWorker, FakeWorker];
    expect(workerA).not.toBe(workerB);
    await vi.waitFor(() => {
      expect(workerA.onmessage).toBeTypeOf("function");
      expect(workerB.onmessage).toBeTypeOf("function");
    });
    expect(workerA.onmessage).not.toBe(workerB.onmessage);

    // a partial meant for A lands in A only
    workerA.onmessage!({ data: partial } as MessageEvent);
    expect(a.view.words.length).toBeGreaterThan(0);
    expect(b.view.words).toHaveLength(0);
    expect(b.view.phase).toBe("running");

    a.stop();
    b.stop();
  });

  it("a failing session cannot terminate the other run's worker", async () => {
    const a = startSession({ projectId: `pA2-${Math.random()}`, videoId: "v-a2", file: new Blob(["x"]), language: "en" });
    const b = startSession({ projectId: `pB2-${Math.random()}`, videoId: "v-b2", file: new Blob(["x"]), language: "en" });
    const before = workers.length;
    await vi.waitFor(() => expect(workers.length).toBe(before + 2));
    const workerA = workers[before]!;
    const workerB = workers[before + 1]!;
    await vi.waitFor(() => {
      expect(workerA.onmessage).toBeTypeOf("function");
      expect(workerB.onmessage).toBeTypeOf("function");
    });

    // A's worker crashes: the error path drops A's worker (and retries gently
    // on a fresh one) — B's worker is never dropped and B keeps hearing.
    workerA.onerror!({ message: "boom" } as ErrorEvent);
    await vi.waitFor(() => expect(workers.length).toBeGreaterThan(before + 2));
    expect(dropped).toContain(workerA);
    expect(dropped).not.toContain(workerB);
    expect(workerB.terminated).toBe(false);
    expect(b.view.phase).toBe("running");

    workerB.onmessage!({ data: partial } as MessageEvent);
    expect(b.view.words.length).toBeGreaterThan(0);

    a.stop();
    b.stop();
  });
});
