import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Worker trace (Slice 5.2): the REAL whisper.worker.ts, with only the transformers.js pipeline mocked at the
 * model boundary (the weights cannot run in this sandbox). Proves the worker (a) loads the model ID the language
 * map assigns to the requested language, (b) passes that language's Whisper token into the decode options, and
 * (c) maps the model's Devanagari word chunks back onto the clip clock as sane, monotonic word timings — the same
 * chunk shape the caption-engine gate fixtures use downstream.
 */

const pipelineCalls: { task: string; modelId: string; opts: Record<string, unknown> }[] = [];
const decodeCalls: Record<string, unknown>[] = [];
const posted: { type: string; words?: { text: string; startMs: number; endMs: number }[] }[] = [];

const HINDI_CHUNKS = [
  { text: " नमस्ते", timestamp: [0, 0.42] as [number, number] },
  { text: " दोस्तों", timestamp: [0.42, 0.9] as [number, number] },
  { text: " यह", timestamp: [1.0, 1.25] as [number, number] },
  { text: " है।", timestamp: [1.25, 1.6] as [number, number] },
];

vi.mock("@huggingface/transformers", () => ({
  env: { allowLocalModels: true, remoteHost: "", backends: { onnx: { wasm: {} } } },
  StoppingCriteria: class {},
  pipeline: vi.fn(async (task: string, modelId: string, opts: Record<string, unknown>) => {
    pipelineCalls.push({ task, modelId, opts });
    const asr = async (_audio: Float32Array, decodeOpts: Record<string, unknown>) => {
      decodeCalls.push(decodeOpts);
      return { chunks: decodeOpts.language === "hi" ? HINDI_CHUNKS : [{ text: " Hello", timestamp: [0, 0.4] as [number, number] }] };
    };
    return Object.assign(asr, { dispose: async () => undefined });
  }),
}));

/** 2 s of a 200 Hz tone: reads as one speech window to the voice-activity pass. */
function tone(seconds: number): Float32Array {
  const a = new Float32Array(Math.round(seconds * 16_000));
  for (let i = 0; i < a.length; i++) a[i] = 0.2 * Math.sin((2 * Math.PI * 200 * i) / 16_000);
  return a;
}

type Handler = (e: { data: unknown }) => Promise<void>;
let handler: Handler;

beforeAll(async () => {
  vi.stubGlobal("postMessage", (m: unknown) => posted.push(m as (typeof posted)[number]));
  await import("../whisper.worker");
  handler = (globalThis as unknown as { onmessage: Handler }).onmessage;
  expect(typeof handler).toBe("function");
});

describe("whisper worker — multilingual path", () => {
  it("a Hindi run loads whisper-base_timestamped and decodes with language 'hi', emitting sane Devanagari timings", async () => {
    await handler({ data: { type: "run", model: "hindi", file: null, audio: tone(2), language: "hi" } });

    expect(pipelineCalls.at(-1)).toMatchObject({ task: "automatic-speech-recognition", modelId: "onnx-community/whisper-base_timestamped" });
    expect(decodeCalls.at(-1)).toMatchObject({ language: "hi", return_timestamps: "word", task: "transcribe" });

    const partial = posted.find((m) => m.type === "partial");
    expect(partial?.words?.map((w) => w.text.trim())).toEqual(["नमस्ते", "दोस्तों", "यह", "है।"]);
    const words = partial!.words!;
    for (let i = 1; i < words.length; i++) expect(words[i]!.startMs).toBeGreaterThanOrEqual(words[i - 1]!.startMs);
    expect(words.every((w) => w.endMs > w.startMs)).toBe(true);
    expect(posted.some((m) => m.type === "done")).toBe(true);
  });

  it("an English run reuses the same model repo and decodes with language 'en'", async () => {
    pipelineCalls.length = 0;
    decodeCalls.length = 0;
    posted.length = 0;
    await handler({ data: { type: "run", model: "en", file: null, audio: tone(2), language: "en" } });

    expect(pipelineCalls.at(-1)).toMatchObject({ modelId: "onnx-community/whisper-base_timestamped" });
    expect(decodeCalls.at(-1)).toMatchObject({ language: "en" });
    const partial = posted.find((m) => m.type === "partial");
    expect(partial?.words?.map((w) => w.text.trim())).toEqual(["Hello"]);
  });
});
