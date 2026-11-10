import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * UI -> session -> worker trace (Slice 5.2): the project language chosen on the upload screen must arrive at the
 * speech worker as the right model key AND the right Whisper language token. The worker boundary is mocked (no
 * real Worker in jsdom); the worker's own use of those fields is covered by whisper.worker.test.ts.
 */

const sent: unknown[] = [];
const fakeWorker = { onmessage: null, onerror: null };

vi.mock("../browserWhisper", () => ({
  decodeAudio: vi.fn(async () => new Float32Array(0)),
  dropWorker: vi.fn(),
  sendToWorker: (_w: unknown, m: unknown) => sent.push(m),
  speechWorker: () => fakeWorker,
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

const runMessageFor = async (language: string | null) => {
  sent.length = 0;
  const s = startSession({ projectId: `p-${language ?? "null"}-${Math.random()}`, videoId: `v-${Math.random()}`, file: new Blob(["x"]), language });
  await vi.waitFor(() => expect(sent.length).toBeGreaterThan(0));
  s.stop();
  return sent[0] as { type: string; model: string; language: string | null };
};

describe("session -> worker language trace", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  it("Hindi project ('hi') runs the multilingual model keyed 'hindi' with the 'hi' token", async () => {
    const m = await runMessageFor("hi");
    expect(m.type).toBe("run");
    expect(m.model).toBe("hindi");
    expect(m.language).toBe("hi");
  });

  it("Roman Hinglish project ('hi-Latn') still runs the Hinglish fine-tune with its 'en' token (unchanged)", async () => {
    const m = await runMessageFor("hi-Latn");
    expect(m.model).toBe("hinglish");
    expect(m.language).toBe("en");
  });

  it("English project runs the English model with the 'en' token", async () => {
    const m = await runMessageFor("en");
    expect(m.model).toBe("en");
    expect(m.language).toBe("en");
  });

  it("a project with no language keeps the old behaviour (English model, auto-detect)", async () => {
    const m = await runMessageFor(null);
    expect(m.model).toBe("en");
    expect(m.language).toBeNull();
  });
});
