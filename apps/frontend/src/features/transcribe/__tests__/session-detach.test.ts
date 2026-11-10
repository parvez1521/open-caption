import { describe, expect, it, vi } from "vitest";

/**
 * Phase 9 W2, quirk (a): in ONE project the "transcription complete" state never appeared even
 * though the transcript itself was complete, while the same clip in another project completed
 * normally. Code trace: when the browser session's claim on the server job is refused (409 —
 * the job was finished or taken elsewhere — or 404), attachJob dropped the job id and the
 * session could then NEVER save or settle: the worker finished, maybeComplete() no-oped
 * (no job / not claimed), the phase stayed "running" at 100%, hasActiveSession() stayed true,
 * so useStudio's polling stayed off and StudioPage's saved-transition refetch never fired.
 * The server's completed transcript therefore never took over in that tab (a reload, which
 * drops the session, recovered it — matching the live observation).
 *
 * Fix pinned here: a lost claim marks the session detached; when the worker finishes, the run
 * ENDS in the terminal "detached" phase (onSettled fires, hasActiveSession false), and
 * StudioPage refetches on that phase so the server document is adopted.
 */

const fakeWorker: { onmessage: ((e: MessageEvent) => void) | null; onerror: unknown } = { onmessage: null, onerror: null };
const { post, claimStatus } = vi.hoisted(() => {
  const claimStatus = { current: 0 };
  const post = vi.fn(async (_url: string, opts?: { json?: { action?: string } }) => {
    if (opts?.json?.action === "claim" && claimStatus.current !== 0) {
      throw Object.assign(new Error("claim refused"), { status: claimStatus.current });
    }
    return {};
  });
  return { post, claimStatus };
});

vi.mock("../browserWhisper", () => ({
  decodeAudio: vi.fn(async () => new Float32Array(0)),
  dropWorker: vi.fn(),
  sendToWorker: vi.fn(),
  speechWorker: () => fakeWorker,
  withRetry: async <T,>(fn: () => Promise<T>) => fn(),
}));
vi.mock("@/features/upload/localVideos", () => ({
  getProgress: vi.fn(async () => null),
  saveProgress: vi.fn(async () => undefined),
  deleteProgress: vi.fn(async () => undefined),
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
vi.mock("@/services/api-client", () => ({ apiClient: { post } }));
vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

import { getSession, hasActiveSession, startSession } from "../session";

let seq = 0;
async function startAndAttach(claim: number) {
  claimStatus.current = claim;
  post.mockClear();
  const projectId = `detach-p-${seq++}`;
  const s = startSession({ projectId, videoId: `v-${seq}`, file: new Blob(["x"]), language: "en" });
  await vi.waitFor(() => expect(fakeWorker.onmessage).toBeTypeOf("function"));
  await s.attachJob("job-1");
  return { projectId, s };
}

function workerDone() {
  fakeWorker.onmessage?.({ data: { type: "done", device: "wasm", durationMs: 1000, windowsTotal: 1, windowsSkipped: 0 } } as MessageEvent);
}

describe("session job-claim loss (quirk a)", () => {
  it("claim 409: the finished run ends as detached instead of sitting in 'running' forever", async () => {
    const { projectId, s } = await startAndAttach(409);
    expect(getSession(projectId)).toBe(s);
    let settled = false;
    s.onSettled(() => { settled = true; });
    workerDone();
    await vi.waitFor(() => expect(s.view.phase).toBe("detached"));
    expect(s.view.progress).toBe(1);
    expect(settled).toBe(true);
    // the studio may poll again: this session no longer suppresses refetchInterval
    expect(hasActiveSession(projectId)).toBe(false);
    // and it never tried to save words through a job it does not hold
    expect(post.mock.calls.some((c) => (c[1] as { json?: { action?: string } } | undefined)?.json?.action === "complete")).toBe(false);
  });

  it("claim succeeds: the finished run still saves and ends as 'saved' (unchanged path)", async () => {
    const { projectId, s } = await startAndAttach(0);
    workerDone();
    await vi.waitFor(() => expect(s.view.phase).toBe("saved"));
    expect(hasActiveSession(projectId)).toBe(false);
    expect(post.mock.calls.some((c) => (c[1] as { json?: { action?: string } } | undefined)?.json?.action === "complete")).toBe(true);
  });
});
