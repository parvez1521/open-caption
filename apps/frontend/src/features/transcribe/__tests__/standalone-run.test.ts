import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Standalone runner vs Studio session (transcribe fix): the two callers must send the speech worker the
 * SAME language token for the same choice, the same decode fallback, and the same safe flag. The worker
 * boundary is mocked on both sides (no real Worker in jsdom); the worker's own use of those fields is
 * covered by whisper.worker.test.ts.
 */

const sent: unknown[] = [];
const sessionWorker = { onmessage: null, onerror: null };

vi.mock("../browserWhisper", () => ({
  decodeAudio: vi.fn(),
  dropWorker: vi.fn(),
  sendToWorker: (_w: unknown, m: unknown) => sent.push(m),
  speechWorker: () => sessionWorker,
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

import { decodeAudio } from "../browserWhisper";
import { isConstrainedDevice, type SpeechLanguage } from "../runtime";
import { startSession } from "../session";
import { runStandaloneTranscribe, standaloneLanguageToken } from "../standalone";

/** A stand-in for the browser Worker: records what the runner posts, lets the test drive replies. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  posted: unknown[] = [];
  terminated = false;
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(msg: unknown) {
    this.posted.push(msg);
  }
  terminate() {
    this.terminated = true;
  }
  emit(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

type RunMessage = { type: string; model: string; file: Blob | null; audio?: Float32Array; language: string | null; safe?: boolean };

const sessionTokenFor = async (language: string | null) => {
  sent.length = 0;
  const s = startSession({ projectId: `p-${language ?? "null"}-${Math.random()}`, videoId: `v-${Math.random()}`, file: new Blob(["x"]), language });
  await vi.waitFor(() => expect(sent.length).toBeGreaterThan(0));
  s.stop();
  return sent[0] as RunMessage;
};

const standaloneMessageFor = (language: SpeechLanguage, explicit: boolean) => {
  FakeWorker.instances.length = 0;
  const run = runStandaloneTranscribe(new Blob(["x"]), language, { onStatus: () => {}, onPartial: () => {} }, { explicitLanguage: explicit });
  void run.promise.catch(() => undefined);
  const posted = FakeWorker.instances[0]!.posted[0] as RunMessage;
  run.cancel();
  return posted;
};

describe("standalone language token mirrors the session rule", () => {
  beforeEach(() => {
    sent.length = 0;
    FakeWorker.instances.length = 0;
    vi.stubGlobal("Worker", FakeWorker);
  });

  it("pins the token rule directly: only a guessed English keeps auto-detect", () => {
    expect(standaloneLanguageToken("en", false)).toBeNull();
    expect(standaloneLanguageToken("en", true)).toBe("en");
    expect(standaloneLanguageToken("hinglish", false)).toBe("en");
    expect(standaloneLanguageToken("hindi", false)).toBe("hi");
    expect(standaloneLanguageToken("tamil", false)).toBe("ta");
  });

  it("standalone and session send the same token for the same choice", async () => {
    // explicit English (a saved / just-picked choice) -> forced "en" on both
    expect(standaloneMessageFor("en", true).language).toBe((await sessionTokenFor("en")).language);
    expect(standaloneMessageFor("en", true).language).toBe("en");
    // guessed English (no saved choice, browser guess) -> auto-detect (null) on both
    expect(standaloneMessageFor("en", false).language).toBe((await sessionTokenFor(null)).language);
    expect(standaloneMessageFor("en", false).language).toBeNull();
    // Hinglish -> the fine-tune with its "en" token on both
    expect(standaloneMessageFor("hinglish", false).language).toBe((await sessionTokenFor("hi-Latn")).language);
    expect(standaloneMessageFor("hinglish", false).language).toBe("en");
    expect(standaloneMessageFor("hinglish", false).model).toBe("hinglish");
    // Hindi -> "hi" on both; Tamil -> "ta" on both
    expect(standaloneMessageFor("hindi", false).language).toBe((await sessionTokenFor("hi")).language);
    expect(standaloneMessageFor("hindi", false).language).toBe("hi");
    expect(standaloneMessageFor("tamil", false).language).toBe((await sessionTokenFor("ta")).language);
    expect(standaloneMessageFor("tamil", false).language).toBe("ta");
  });

  it("passes safe mode on constrained devices, same as the worker does for the Studio", () => {
    expect(standaloneMessageFor("en", true).safe).toBe(isConstrainedDevice());
  });
});

describe("standalone decode fallback (worker can't read the audio)", () => {
  beforeEach(() => {
    sent.length = 0;
    FakeWorker.instances.length = 0;
    vi.stubGlobal("Worker", FakeWorker);
    vi.mocked(decodeAudio).mockReset();
  });

  const startRun = () => {
    const run = runStandaloneTranscribe(new Blob(["x"], { type: "video/mp4" }), "en", { onStatus: () => {}, onPartial: () => {} }, { explicitLanguage: true });
    const worker = FakeWorker.instances[0]!;
    return { run, worker };
  };

  it("on AUDIO_UNSUPPORTED it decodes with the browser and re-runs with raw audio", async () => {
    const audio = new Float32Array([0.1, 0.2, 0.3]);
    vi.mocked(decodeAudio).mockResolvedValue(audio);
    const { run, worker } = startRun();
    worker.emit({ type: "error", code: "AUDIO_UNSUPPORTED", message: "This browser can't decode this audio format." });
    await vi.waitFor(() => expect(vi.mocked(decodeAudio)).toHaveBeenCalledTimes(1));
    expect(worker.posted).toHaveLength(2);
    const retry = worker.posted[1] as RunMessage;
    expect(retry.file).toBeNull();
    expect(retry.audio).toBe(audio);
    expect(retry.language).toBe("en");
    expect(retry.safe).toBe(isConstrainedDevice());
    worker.emit({ type: "done", durationMs: 5000, device: "wasm" });
    await expect(run.promise).resolves.toMatchObject({ words: [], durationMs: 5000 });
  });

  it("a file with genuinely no audio ends as an empty transcript, not an error", async () => {
    vi.mocked(decodeAudio).mockRejectedValue(Object.assign(new Error("This video has no audio track the browser can read."), { code: "NO_AUDIO" }));
    const { run, worker } = startRun();
    worker.emit({ type: "error", code: "NO_AUDIO", message: "This video has no audio track." });
    await expect(run.promise).resolves.toMatchObject({ words: [] });
  });

  it("the fallback runs once: a second undecodable error rejects", async () => {
    vi.mocked(decodeAudio).mockResolvedValue(new Float32Array([0.1]));
    const { run, worker } = startRun();
    worker.emit({ type: "error", code: "AUDIO_UNSUPPORTED", message: "unsupported" });
    await vi.waitFor(() => expect(vi.mocked(decodeAudio)).toHaveBeenCalledTimes(1));
    worker.emit({ type: "error", code: "AUDIO_UNSUPPORTED", message: "still unsupported" });
    await expect(run.promise).rejects.toMatchObject({ code: "AUDIO_UNSUPPORTED" });
    expect(vi.mocked(decodeAudio)).toHaveBeenCalledTimes(1);
  });
});
