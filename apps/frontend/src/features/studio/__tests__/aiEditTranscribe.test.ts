import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AI Edit planning transcription (Hinglish fix): the planning run must send
 * the Whisper language token its model was trained with. The old code sent
 * `language: null` (auto-detect), so a Hinglish window could decode with
 * the "hi" token on a model trained with the "en" token only.
 */

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

import { planningLanguageToken, transcribeVideoForPlanning } from "../aiEditTranscribe";

type RunMessage = { type: string; model: string; file: Blob | null; language: string | null };

const setSavedLanguage = (v: string | null) => {
  if (v === null) localStorage.removeItem("ce:speech-language");
  else localStorage.setItem("ce:speech-language", v);
};

describe("planningLanguageToken", () => {
  beforeEach(() => {
    FakeWorker.instances.length = 0;
    vi.stubGlobal("Worker", FakeWorker);
    setSavedLanguage(null);
    Object.defineProperty(window.navigator, "languages", { value: ["en-US"], configurable: true });
  });

  it("the Hinglish fine-tune always gets its trained 'en' token", () => {
    expect(planningLanguageToken("hinglish")).toBe("en");
    setSavedLanguage("en");
    expect(planningLanguageToken("hinglish")).toBe("en");
  });

  it("a saved choice forces its token; no saved choice keeps auto-detect", () => {
    expect(planningLanguageToken("en")).toBeNull();
    setSavedLanguage("en");
    expect(planningLanguageToken("en")).toBe("en");
    setSavedLanguage("hindi");
    expect(planningLanguageToken("hindi")).toBe("hi");
    setSavedLanguage("tamil");
    expect(planningLanguageToken("tamil")).toBe("ta");
  });

  it("the planning run posts the token, not null, for a saved Hinglish choice", async () => {
    setSavedLanguage("hinglish");
    const promise = transcribeVideoForPlanning(new Blob(["x"], { type: "video/mp4" }));
    void promise.catch(() => undefined);
    const worker = FakeWorker.instances[0]!;
    const posted = worker.posted[0] as RunMessage;
    expect(posted.type).toBe("run");
    expect(posted.model).toBe("hinglish");
    expect(posted.language).toBe("en");
    worker.emit({ type: "error", code: "NO_AUDIO", message: "no audio" });
    await expect(promise).resolves.toEqual([]);
    expect(worker.terminated).toBe(true);
  });

  it("a run with no saved choice keeps auto-detect for the stock model", async () => {
    const promise = transcribeVideoForPlanning(new Blob(["x"], { type: "video/mp4" }));
    void promise.catch(() => undefined);
    const worker = FakeWorker.instances[0]!;
    const posted = worker.posted[0] as RunMessage;
    expect(posted.model).toBe("en");
    expect(posted.language).toBeNull();
    worker.emit({ type: "error", code: "NO_AUDIO", message: "no audio" });
    await expect(promise).resolves.toEqual([]);
  });
});
