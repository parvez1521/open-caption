/**
 * Local speech-to-text with word timestamps: Whisper through transformers.js on onnxruntime-node (prebuilt native
 * binaries for Windows/macOS/Linux ship inside the npm package, so `npm i` needs no compiler, git or Python).
 * The same models and the same speech-window logic as the CaptionsEasy studio (apps/frontend .../transcribe), so a
 * video captions the same way in the browser and here.
 */
import { performance } from "node:perf_hooks";
import { fromWhisperCaptions } from "@motion-ai/caption-engine/core";
// pure helpers shared with the studio's browser worker: voice activity windows, loop guards, timestamp mapping
import { SR, capWordEnd, dropRepeatedRuns, isLooping, planWindows, renderWindow, toOriginalSeconds, type PackedWindow } from "../../../apps/frontend/src/features/transcribe/speech";
import { CaptionsEasyError } from "../../cli/src/errors";
import { existingFile } from "../../cli/src/fsutil";
import { SAMPLE_RATE, decodeAudio, probeMedia } from "../../cli/src/node/media";
import { modelsDir } from "../../cli/src/node/paths";
import type { Language, TranscribeOptions, Transcript, TranscriptWord } from "../../cli/src/types";

if (SR !== SAMPLE_RATE) throw new Error("sample rate mismatch");

interface ModelSpec {
  id: string;
  /** pinned commit: a later upload can never change what users download */
  revision: string;
  /** Whisper language token forced while decoding (null = detect) */
  language: string | null;
  /** token budget per second of speech, stops Whisper's loops on music/noise without cutting real speech */
  tokensPerSecond: number;
  label: string;
  /** weights per graph: picked for speed on CPUs (onnxruntime-node), see MODELS */
  dtype: { encoder_model: string; decoder_model_merged: string };
}

/**
 * Same pinned models as the studio (apps/frontend/src/features/transcribe/runtime.ts). Weights on Node's CPU backend:
 * English uses a full-precision encoder (accurate word timing) + a 4-bit decoder (measured ~2x faster than 8-bit on
 * CPU, same words); ~205 MB, downloaded once. The Hinglish repo only publishes 8-bit/fp16 weights: 8-bit (~77 MB).
 */
const FAST = { encoder_model: "fp32", decoder_model_merged: "q4" };
const Q8 = { encoder_model: "q8", decoder_model_merged: "q8" };
export const MODELS: Record<Language, ModelSpec> = {
  en: { id: "onnx-community/whisper-base_timestamped", revision: "608c49e61301901684bc36cac8f74b95ff6b5a8e", language: "en", tokensPerSecond: 7, label: "whisper-base", dtype: FAST },
  auto: { id: "onnx-community/whisper-base_timestamped", revision: "608c49e61301901684bc36cac8f74b95ff6b5a8e", language: null, tokensPerSecond: 9, label: "whisper-base (auto language)", dtype: FAST },
  hinglish: { id: "ishaan-g/whisper-hinglish-swift_timestamped", revision: "eb0fe25c3aba1799633033ad4a58ef0cad877606", language: "en", tokensPerSecond: 12, label: "whisper-hinglish-swift", dtype: Q8 },
};

type Asr = (audio: Float32Array, opts: Record<string, unknown>) => Promise<unknown>;
const loaded = new Map<string, Promise<{ asr: Asr; dispose: () => Promise<void> }>>();

const log = (quiet: boolean | undefined, msg: string) => {
  if (!quiet) process.stderr.write(msg);
};

async function loadModel(spec: ModelSpec, quiet?: boolean) {
  const key = `${spec.id}@${spec.revision}`;
  let p = loaded.get(key);
  if (!p) {
    p = (async () => {
      const tf = await import("@huggingface/transformers");
      tf.env.cacheDir = modelsDir();
      tf.env.allowLocalModels = false;
      // per-file byte progress -> one overall download line on stderr (stdout stays clean for --json)
      const files = new Map<string, { loaded: number; total: number }>();
      let lastPct = -1;
      let downloading = false;
      const progress_callback = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (p.status !== "progress" || !p.file || !p.total) return;
        files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
        let l = 0;
        let t = 0;
        files.forEach((f) => ((l += f.loaded), (t += f.total)));
        const tty = process.stderr.isTTY;
        // a live line in a terminal, a line per 10% when piped (agents, CI logs)
        const pct = tty ? Math.floor((l / t) * 100) : Math.floor((l / t) * 10) * 10;
        if (pct !== lastPct && t > 5e6) {
          if (!downloading) log(quiet, `captionseasy: downloading speech model ${spec.id} (one time, cached in ${modelsDir()})\n`);
          downloading = true;
          lastPct = pct;
          const line = `  ${pct}%  ${(l / 1048576).toFixed(0)} / ${(t / 1048576).toFixed(0)} MB`;
          log(quiet, tty ? `\r${line}` : `${line}\n`);
        }
      };
      const asr = await tf.pipeline("automatic-speech-recognition", spec.id, {
        revision: spec.revision,
        device: "cpu",
        dtype: spec.dtype,
        progress_callback,
      } as never);
      if (downloading && process.stderr.isTTY) log(quiet, "\n");
      return { asr: asr as unknown as Asr, dispose: () => (asr as unknown as { dispose: () => Promise<void> }).dispose() };
    })();
    p.catch(() => loaded.delete(key));
    loaded.set(key, p);
  }
  return p;
}

let stopLoops: unknown;
async function loopGuard() {
  if (!stopLoops) {
    const { StoppingCriteria } = await import("@huggingface/transformers");
    /** Ends a window's decoding the moment Whisper starts repeating itself (see isLooping). */
    class StopLoops extends StoppingCriteria {
      _call(inputIds: (number | bigint)[][]): boolean[] {
        return inputIds.map((ids) => isLooping(ids));
      }
    }
    stopLoops = new StopLoops();
  }
  return stopLoops;
}

type Chunk = { text: string; timestamp: [number, number | null] };
type Raw = { text: string; startMs: number; endMs: number };

async function runWindow(asr: Asr, spec: ModelSpec, audio: Float32Array, w: PackedWindow): Promise<Raw[]> {
  const packed = renderWindow(audio, w);
  const seconds = packed.length / SR;
  const out = (await asr(packed, {
    return_timestamps: "word",
    task: "transcribe",
    max_new_tokens: Math.min(440, Math.ceil(seconds * spec.tokensPerSecond) + 20),
    stopping_criteria: await loopGuard(),
    ...(spec.language ? { language: spec.language } : {}),
  })) as { chunks?: Chunk[] };
  const words: Raw[] = [];
  for (const c of out.chunks ?? []) {
    if (!c.text.trim()) continue;
    const [a, b] = c.timestamp;
    const end = capWordEnd(c.text, a, b ?? a + 0.3, seconds);
    words.push({ text: c.text, startMs: toOriginalSeconds(w, a) * 1000, endMs: toOriginalSeconds(w, end) * 1000 });
  }
  return dropRepeatedRuns(words);
}

/**
 * Transcribe a local video or audio file into timed words. Runs on this machine; the first call downloads the
 * speech model (~77 MB) into the per-user cache and later calls reuse it.
 */
export async function transcribe(videoPath: string, opts: TranscribeOptions = {}): Promise<Transcript> {
  const path = existingFile(videoPath, "Video");
  const language: Language = opts.language ?? "en";
  const spec = MODELS[language];
  if (!spec) throw new CaptionsEasyError("BAD_ARGS", `language must be one of: ${Object.keys(MODELS).join(", ")}`);
  const t0 = performance.now();
  const info = await probeMedia(path);
  if (!info.hasAudio) throw new CaptionsEasyError("NO_AUDIO", `${path} has no audio track to transcribe.`);
  // the model loads while the audio decodes
  const model = loadModel(spec, opts.quiet);
  model.catch(() => undefined);
  const audio = await decodeAudio(path);
  const durationMs = (audio.length / SR) * 1000;
  let m: Awaited<typeof model>;
  try {
    m = await model;
  } catch (e) {
    throw new CaptionsEasyError("TRANSCRIBE_FAILED", `Could not load the speech model ${spec.id}: ${e instanceof Error ? e.message : e}. The first run needs internet access to download it.`);
  }
  const windows = planWindows(audio);
  const raw: Raw[] = [];
  for (let i = 0; i < windows.length; i++) {
    opts.onProgress?.(i / windows.length);
    raw.push(...(await runWindow(m.asr, spec, audio, windows[i]!)));
  }
  opts.onProgress?.(1);
  const words = fromWhisperCaptions(dropRepeatedRuns(raw), { durationMs: info.durationMs || durationMs });
  return {
    language: language === "hinglish" ? "hi-Latn" : language === "auto" ? "auto" : "en",
    model: `${spec.id}@${spec.revision.slice(0, 7)}`,
    durationMs: Math.round(info.durationMs || durationMs),
    elapsedMs: Math.round(performance.now() - t0),
    words: words.map((w): TranscriptWord => ({ text: w.text, startMs: w.startMs, endMs: w.endMs })),
  };
}

/** Free the speech models held in memory (long-running hosts such as the MCP server). */
export async function unloadModels() {
  const all = [...loaded.values()];
  loaded.clear();
  await Promise.all(all.map((p) => p.then((m) => m.dispose()).catch(() => undefined)));
}
