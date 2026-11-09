/// <reference lib="webworker" />
/**
 * Whisper in a Web Worker (transformers.js + onnxruntime-web). WebGPU with fp16 weights when the GPU supports it,
 * otherwise WASM with 8-bit weights (multi-threaded when the page is cross-origin isolated). The model downloads once
 * and is cached by the browser (Cache Storage).
 *
 * Pipeline, all inside this worker so the page stays smooth:
 *   1. the model starts loading while the video's audio is decoded (Mediabunny -> 16 kHz mono, streamed: the whole
 *      file is never held in memory),
 *   2. speech is found and packed into windows (silence dropped, see speech.ts),
 *   3. each window is transcribed and its words are posted straight away ("partial"), already mapped back onto the
 *      clip's clock, so the editor can show captions while the rest is still being written.
 */
import { pipeline, env, StoppingCriteria, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import { MODELS, isConstrainedDevice, pickRuntime, runtimeFor, type Device, type SpeechLanguage } from "./runtime";
import { Resampler, downmix } from "./resample";
import { SR, TimelineAligner, capWordEnd, dropRepeatedRuns, isLooping, planWindows, renderWindow, toOriginalSeconds, type PackedWindow } from "./speech";

env.allowLocalModels = false;

export type RawWord = { text: string; startMs: number; endMs: number };
export type In =
  | { type: "run"; model: SpeechLanguage; file: Blob | null; audio?: Float32Array; language: string | null; resumeFromMs?: number; forceWasm?: boolean; safe?: boolean }
  | { type: "preload"; model: SpeechLanguage; forceWasm?: boolean };
export type Out =
  | { type: "status"; stage: "audio" | "download" | "load" | "transcribe"; progress: number; device?: string }
  | { type: "partial"; words: RawWord[]; audioEndMs: number; progress: number; windows: number; windowIndex: number; durationMs: number; device: string }
  | { type: "done"; device: string; durationMs: number; noAudio?: boolean; windowsTotal: number; windowsSkipped: number }
  | { type: "timing"; phase: string; ms: number }
  | { type: "gpu-broken"; reason: string }
  | { type: "error"; message: string; code?: string };

const HEAD_S = 12;

const post = (m: Out) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);
const coded = (code: string, message: string) => Object.assign(new Error(message), { code });

let asr: AutomaticSpeechRecognitionPipeline | null = null;
/** which model `asr` / `loading` hold: one model in memory at a time */
let loadedFor: SpeechLanguage | null = null;
let device: Device = "wasm";
let loading: Promise<AutomaticSpeechRecognitionPipeline> | null = null;
/** the model the current run wants */
let wanted: SpeechLanguage = "en";
/** Gentle mode for devices where the normal path crashed: one thread, processor only, no overlapping work. */
let safeMode = false;

/** One load at a time: a run that arrives while a preload is still going waits for the same model. */
function load(forceWasm = false): Promise<AutomaticSpeechRecognitionPipeline> {
  if (loadedFor !== wanted) {
    // the other language's model is in memory (or loading): let it go, only one fits comfortably on a phone
    const old = asr;
    const pending = loading;
    asr = null;
    loading = null;
    loadedFor = wanted;
    void old?.dispose().catch(() => undefined);
    void pending?.then((m) => m.dispose()).catch(() => undefined);
  }
  if (asr) return Promise.resolve(asr);
  if (!forceWasm && loading) return loading;
  const p = loadModel(forceWasm).finally(() => { if (loading === p) loading = null; });
  if (!forceWasm) loading = p;
  return p;
}

async function loadModel(forceWasm: boolean) {
  if (asr) return asr;
  const spec = MODELS[wanted];
  const t0 = performance.now();
  // WASM threads need SharedArrayBuffer, which only exists when the page is cross-origin isolated.
  // Phones/low-memory devices stay on ONE thread: extra WASM threads multiply the runtime's memory,
  // which is what gets heavy mobile tabs killed outright.
  if (safeMode || isConstrainedDevice()) env.backends.onnx.wasm!.numThreads = 1;
  else if (self.crossOriginIsolated) {
    env.backends.onnx.wasm!.numThreads = Math.min(8, Math.max(2, (navigator.hardwareConcurrency || 4) - 1));
  }
  device = (await pickRuntime(forceWasm)).device;
  // per-file byte progress -> one overall download percentage
  const files = new Map<string, { loaded: number; total: number }>();
  const onProgress = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status !== "progress" || !p.file || !p.total) return;
    files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
    let l = 0, t = 0;
    files.forEach((f) => { l += f.loaded; t += f.total; });
    post({ type: "status", stage: "download", progress: t ? l / t : 0, device });
  };
  const make = (dev: Device) => {
    env.remoteHost = spec.host;
    return pipeline("automatic-speech-recognition", spec.id, {
      device: dev,
      dtype: runtimeFor(dev).dtype,
      revision: spec.revision,
      progress_callback: onProgress,
    }) as Promise<AutomaticSpeechRecognitionPipeline>;
  };
  let made: AutomaticSpeechRecognitionPipeline;
  try {
    made = await make(device);
  } catch (e) {
    if (device !== "webgpu") throw e;
    post({ type: "gpu-broken", reason: e instanceof Error ? e.message.slice(0, 200) : "compile failed" });
    device = "wasm"; // some GPUs advertise f16 but fail to compile the graph
    made = await make("wasm");
  }
  // the creator switched language while this one was loading: it's no longer wanted
  if (loadedFor !== spec.key) {
    void made.dispose().catch(() => undefined);
    return load(forceWasm);
  }
  asr = made;
  post({ type: "status", stage: "load", progress: 1, device });
  post({ type: "timing", phase: "model", ms: Math.round(performance.now() - t0) });
  return asr;
}

/** Decode the audio track and stream it through the resampler: 16 kHz mono, never the whole file in memory. */
async function extractAudio(file: Blob, onHead?: (head: Float32Array) => void): Promise<Float32Array> {
  const { Input, BlobSource, ALL_FORMATS, AudioSampleSink } = await import("mediabunny");
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const track = await input.getPrimaryAudioTrack();
  if (!track) throw coded("NO_AUDIO", "This video has no audio track.");
  if (!(await track.canDecode().catch(() => false))) throw coded("AUDIO_UNSUPPORTED", "This browser can't decode this audio format.");
  const total = await input.computeDuration().catch(() => 0);
  const sink = new AudioSampleSink(track);
  let rs: Resampler | null = null;
  let aligner: TimelineAligner | null = null;
  const chunks: Float32Array[] = [];
  let pending: Float32Array[] = [];
  let pendingLen = 0;
  const flushPending = () => {
    if (!pendingLen || !rs) return;
    const merged = new Float32Array(pendingLen);
    let o = 0;
    for (const p of pending) { merged.set(p, o); o += p.length; }
    pending = [];
    pendingLen = 0;
    const part = rs.push(merged);
    chunks.push(part);
    emitted += part.length;
  };
  let lastPost = 0;
  let emitted = 0;
  let headFired = false;
  const concat = () => {
    const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  };
  try {
    for await (const sample of sink.samples()) {
      const planes: Float32Array[] = [];
      for (let c = 0; c < sample.numberOfChannels; c++) {
        const plane = new Float32Array(sample.numberOfFrames);
        sample.copyTo(plane, { planeIndex: c, format: "f32-planar" });
        planes.push(plane);
      }
      rs ??= new Resampler(sample.sampleRate, SR);
      aligner ??= new TimelineAligner(sample.sampleRate);
      // place the sample on the media clock (start offsets, gaps, codec priming) BEFORE resampling:
      // concatenating raw decoded PCM here used to shift every word timestamp by the container's offsets
      const mono = aligner.align(sample.timestamp, downmix(planes));
      if (mono.length) {
        pending.push(mono);
        pendingLen += mono.length;
      }
      if (pendingLen >= 32_768) flushPending();
      // the first ~12 s are enough to start captioning while the rest still decodes
      if (onHead && !headFired && emitted >= HEAD_S * SR) {
        headFired = true;
        onHead(concat());
      }
      const ts = sample.timestamp;
      sample.close();
      const now = performance.now();
      if (total && now - lastPost > 250) {
        lastPost = now;
        post({ type: "status", stage: "audio", progress: Math.min(1, ts / total) });
      }
    }
    flushPending();
    if (rs) chunks.push(rs.flush());
  } catch (e) {
    throw coded("AUDIO_UNSUPPORTED", e instanceof Error ? e.message : "audio decode failed");
  } finally {
    input.dispose?.();
  }
  const out = concat();
  if (!out.length) throw coded("NO_AUDIO", "This video has no audio.");
  return out;
}

type Chunk = { text: string; timestamp: [number, number | null] };

/** Ends a window's decoding the moment Whisper starts repeating itself (see isLooping). */
class StopLoops extends StoppingCriteria {
  _call(inputIds: (number | bigint)[][]): boolean[] {
    return inputIds.map((ids) => isLooping(ids));
  }
}
const stopLoops = new StopLoops();

/** One window through the model (falls back from a failed GPU to the processor), words mapped to the clip's clock. */
async function runWindow(audio: Float32Array, w: PackedWindow, language: string | null): Promise<RawWord[]> {
  let model = await load();
  const packed = renderWindow(audio, w);
  const seconds = packed.length / SR;
  const opts = {
    return_timestamps: "word" as const,
    task: "transcribe",
    // Whisper loops until its token limit on music or noise; cap it near the fastest speech that fits the window
    max_new_tokens: Math.min(440, Math.ceil(seconds * MODELS[wanted].tokensPerSecond) + 20),
    stopping_criteria: stopLoops,
    ...(language ? { language } : {}),
  };
  let out: { chunks?: Chunk[] };
  try {
    out = (await model(packed, opts)) as typeof out;
  } catch (gpuErr) {
    // the graphics card ran out of memory (or lost its device): carry on with the processor instead
    if (device !== "webgpu") throw gpuErr;
    post({ type: "gpu-broken", reason: gpuErr instanceof Error ? gpuErr.message.slice(0, 200) : "device lost" });
    try { await asr?.dispose(); } catch { /* the GPU may already be gone */ }
    asr = null;
    model = await load(true);
    out = (await model(packed, opts)) as typeof out;
  }
  const words: RawWord[] = [];
  for (const c of out.chunks ?? []) {
    if (!c.text.trim()) continue;
    const [a, b] = c.timestamp;
    const end = capWordEnd(c.text, a, b ?? a + 0.3, seconds);
    words.push({ text: c.text, startMs: toOriginalSeconds(w, a) * 1000, endMs: toOriginalSeconds(w, end) * 1000 });
  }
  return dropRepeatedRuns(words);
}

self.onmessage = async (e: MessageEvent<In>) => {
  wanted = e.data.model;
  if (e.data.type === "preload") {
    load(e.data.forceWasm).catch(() => { /* the real run retries and reports the error */ });
    return;
  }
  try {
    const { file, language, resumeFromMs = 0 } = e.data;
    safeMode = !!e.data.safe;
    const forceWasm = !!e.data.forceWasm || safeMode;
    // start the model while the audio decodes: the slower of the two sets the pace, not their sum
    const modelReady = load(forceWasm);
    modelReady.catch(() => { /* awaited below; avoids an unhandled rejection while audio is still decoding */ });
    let firstDone = false;

    // Head start: as soon as ~12 s of audio exist, caption the first short window while the rest still decodes.
    // Skipped when resuming (that work is already done) or when speech runs right up to the end of the head.
    let head: Promise<number> | null = null;
    const onHead = (headAudio: Float32Array) => {
      if (resumeFromMs > 0 || safeMode) return;
      const hw = planWindows(headAudio)[0];
      const twoWindows = planWindows(headAudio).length > 1;
      if (!hw || (!twoWindows && hw.origEnd > headAudio.length - SR)) return;
      head = (async () => {
        await modelReady;
        post({ type: "status", stage: "transcribe", progress: 0, device });
        const t0 = performance.now();
        const words = await runWindow(headAudio, hw, language);
        post({ type: "timing", phase: "firstWindow", ms: Math.round(performance.now() - t0) });
        firstDone = true;
        post({ type: "partial", words, audioEndMs: (hw.origEnd / SR) * 1000, progress: 0, windows: 0, windowIndex: 0, durationMs: 0, device });
        return hw.origEnd;
      })();
      head.catch(() => { /* surfaced when awaited below */ });
    };

    const tAudio = performance.now();
    const audio = file ? await extractAudio(file, onHead) : e.data.audio!;
    post({ type: "timing", phase: "audio", ms: Math.round(performance.now() - tAudio) });
    const durationMs = (audio.length / SR) * 1000;
    post({ type: "status", stage: "audio", progress: 1 });

    const headEnd = head ? await head : 0;
    const from = Math.max(headEnd, Math.round((resumeFromMs / 1000) * SR));
    const wins = planWindows(audio, undefined, from, from === 0);
    const offset = headEnd ? 1 : 0;
    await modelReady;
    for (let n = 0; n < wins.length; n++) {
      const w = wins[n]!;
      post({ type: "status", stage: "transcribe", progress: n / Math.max(1, wins.length), device });
      const t0 = performance.now();
      const words = await runWindow(audio, w, language);
      post({ type: "timing", phase: firstDone ? "window" : "firstWindow", ms: Math.round(performance.now() - t0) });
      firstDone = true;
      post({
        type: "partial",
        words,
        audioEndMs: (w.origEnd / SR) * 1000,
        progress: (n + 1) / wins.length,
        windows: wins.length + offset,
        windowIndex: n + offset,
        durationMs,
        device,
      });
    }
    post({ type: "status", stage: "transcribe", progress: 1, device });
    post({ type: "done", device, durationMs, windowsTotal: wins.length + offset, windowsSkipped: 0 });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err), code: (err as { code?: string }).code });
  }
};
