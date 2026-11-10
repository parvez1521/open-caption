import { describe, expect, it, vi } from "vitest";
import { CaptionDocSchema, ProjectSettingsSchema, type CaptionDoc } from "@capseasy/shared";
import { translateCaptionDoc } from "../translateDoc";
import { translateLines } from "../browserTranslate";
import type { TranslateIn, TranslateOut } from "../translate.worker";

const settings = ProjectSettingsSchema.parse({ maxWordsPerCard: 3, pauseMs: 400 });

const SOURCE: CaptionDoc = CaptionDocSchema.parse({
  version: 2,
  language: "en",
  words: [
    { id: "w0", text: "Hello", startMs: 0, endMs: 300 },
    { id: "w1", text: "brave", startMs: 320, endMs: 620 },
    { id: "w2", text: "world", startMs: 640, endMs: 1000 },
    { id: "w3", text: "Second", startMs: 3000, endMs: 3400 },
    { id: "w4", text: "card", startMs: 3420, endMs: 3800 },
    { id: "w5", text: "here", startMs: 3820, endMs: 4200 },
  ],
});

/** A deterministic fake "model": word-for-word dictionary swap, so outputs are exact. */
const DICT: Record<string, string> = {
  Hello: "Hola", brave: "mundo", world: "valiente", Second: "Segunda", card: "tarjeta", here: "aquí",
};
const fakeRunLines = vi.fn(async (_lang: string, lines: string[]) =>
  lines.map((l) => l.split(" ").map((w) => DICT[w] ?? w).join(" ")),
);

describe("translateCaptionDoc (mocked worker boundary)", () => {
  it("fixture lines in -> translated doc out, card timings preserved", async () => {
    const progress: number[] = [];
    const out = await translateCaptionDoc({
      doc: SOURCE,
      settings,
      targetLang: "es",
      runLines: fakeRunLines,
      onProgress: (p) => progress.push(p.progress),
    });
    // the worker boundary received exactly the derived card texts, in order
    expect(fakeRunLines).toHaveBeenCalledWith("es", ["Hello brave world", "Second card here"], expect.anything());
    expect(out.language).toBe("es");
    expect(out.words.map((w) => w.text)).toEqual(["Hola", "mundo", "valiente", "Segunda", "tarjeta", "aquí"]);
    // card windows carry over from the source cards
    expect(out.words[0]!.startMs).toBe(0);
    expect(out.words[2]!.endMs).toBeGreaterThan(900);
    expect(out.words[3]!.startMs).toBe(3000);
    // provenance is recorded, word timings honestly marked as derived
    expect(out.meta.translatedFrom?.modelId).toBe("Xenova/opus-mt-en-es");
    expect(out.meta.translatedFrom?.derivedWordTimings).toBe(true);
  });

  it("refuses an unverified language before touching the worker", async () => {
    const spy = vi.fn(async () => [] as string[]);
    await expect(translateCaptionDoc({ doc: SOURCE, settings, targetLang: "pt", runLines: spy })).rejects.toThrow(/not a verified/);
    expect(spy).not.toHaveBeenCalled();
  });

  it("an empty doc is an honest error, not an empty translation", async () => {
    const empty = CaptionDocSchema.parse({ version: 2, language: "en", words: [] });
    await expect(translateCaptionDoc({ doc: empty, settings, targetLang: "es", runLines: fakeRunLines })).rejects.toThrow(/no captions/);
  });
});

/** Minimal Worker stand-in: records the request, replies like translate.worker.ts does. */
class FakeWorker {
  listeners = new Map<string, Set<(e: unknown) => void>>();
  sent: TranslateIn | null = null;
  addEventListener(type: string, fn: (e: unknown) => void) {
    (this.listeners.get(type) ?? this.listeners.set(type, new Set()).get(type)!).add(fn);
  }
  removeEventListener(type: string, fn: (e: unknown) => void) {
    this.listeners.get(type)?.delete(fn);
  }
  postMessage(msg: TranslateIn) {
    this.sent = msg;
    if (msg.type !== "translate") return;
    const emit = (m: TranslateOut) => this.listeners.get("message")?.forEach((fn) => fn({ data: m }));
    emit({ type: "status", stage: "download", progress: 0.5 });
    emit({ type: "status", stage: "translate", progress: 1 });
    emit({ type: "done", lines: msg.lines.map((l) => `«${l}»`) });
  }
  terminate() {}
}

describe("translateLines (worker client)", () => {
  it("sends the registry model ID + pinned revision and resolves lines in order", async () => {
    const fake = new FakeWorker();
    const stages: string[] = [];
    const out = await translateLines("de", ["Hello world", "Second card"], (p) => stages.push(p.stage), () => fake as unknown as Worker);
    expect(fake.sent).toMatchObject({ type: "translate", modelId: "Xenova/opus-mt-en-de", revision: "1ca130c44c4c5441ef16d48aae521a424ab644f7" });
    expect(out).toEqual(["«Hello world»", "«Second card»"]);
    expect(stages).toEqual(["download", "translate"]);
  });

  it("rejects unverified languages without creating a worker", async () => {
    const make = vi.fn(() => new FakeWorker() as unknown as Worker);
    await expect(translateLines("pt", ["Hello"], undefined, make)).rejects.toThrow(/not a verified/);
    expect(make).not.toHaveBeenCalled();
  });
});
