/**
 * Which speech model and which flavour of it this device runs, and how to get its files into the browser cache before
 * the video arrives. Shared by the worker (loads the model) and the main thread (prefetches the bytes), so the two
 * can never disagree about which files are needed.
 *
 * Two models, picked by what the creator says is spoken (asked on the upload screen):
 *   en        stock Whisper base (multilingual), forced to English
 *   hinglish  Oriserve Whisper-Hindi2Hinglish-Swift: Whisper base fine-tuned on Indian Hindi speech, writes Hindi and
 *             Hinglish in Roman script. Same size and architecture as base, so the same speed.
 * Only the chosen model is downloaded.
 */

export type SpeechLanguage = "en" | "hinglish";

export interface SpeechModel {
  key: SpeechLanguage;
  id: string;
  /** Pinned commit of the model repo: a later upload to `main` can never change what users download. */
  revision: string;
  host: string;
  /** Whisper language token forced while decoding (Oriserve trained the Hinglish model with "en") */
  language: string;
  /** stored with the transcript */
  label: string;
  /**
   * Token budget per second of speech, to stop Whisper's loops on music/noise without cutting real speech. Hinglish in
   * Roman letters needs ~2 tokens a word (English ~1.1), so its budget is higher.
   */
  tokensPerSecond: number;
}

const HF = "https://huggingface.co/";
const withSlash = (h: string) => (h.endsWith("/") ? h : `${h}/`);

/**
 * Hosted on Hugging Face (ishaan-g/whisper-hinglish-swift_timestamped, pinned commit). NEXT_PUBLIC_HINGLISH_DISABLED=1
 * hides the language question and captions everything with the English model.
 */
export const HINGLISH_AVAILABLE = process.env.NEXT_PUBLIC_HINGLISH_DISABLED !== "1";

export const MODELS: Record<SpeechLanguage, SpeechModel> = {
  en: {
    key: "en",
    id: "onnx-community/whisper-base_timestamped",
    revision: "608c49e61301901684bc36cac8f74b95ff6b5a8e",
    host: HF,
    language: "en",
    label: "whisper-base (browser)",
    tokensPerSecond: 7,
  },
  hinglish: {
    key: "hinglish",
    id: process.env.NEXT_PUBLIC_HINGLISH_MODEL_ID || "ishaan-g/whisper-hinglish-swift_timestamped",
    revision: process.env.NEXT_PUBLIC_HINGLISH_MODEL_REVISION || "eb0fe25c3aba1799633033ad4a58ef0cad877606",
    host: withSlash(process.env.NEXT_PUBLIC_HINGLISH_MODEL_HOST || HF),
    language: "en",
    label: "hinglish-swift (browser)",
    tokensPerSecond: 12,
  },
};

/** Project language ("en", "hi", "hi-Latn", "auto" …) -> which model writes its captions. */
export const speechLanguageOf = (projectLanguage: string | null | undefined): SpeechLanguage =>
  HINGLISH_AVAILABLE && /^(hi|hinglish)(-|$)/i.test(projectLanguage ?? "") ? "hinglish" : "en";

/** What we store as the project's language for each choice. */
export const PROJECT_LANGUAGE: Record<SpeechLanguage, string> = { en: "en", hinglish: "hi-Latn" };

export const modelKeyOf = (m: SpeechModel) => `${m.id}@${m.revision}`;

const PREF_KEY = "ce:speech-language";
/** The creator's last answer to "what language is spoken?" (null until they've answered once). */
export function savedSpeechLanguage(): SpeechLanguage | null {
  if (!HINGLISH_AVAILABLE) return "en";
  try {
    const v = localStorage.getItem(PREF_KEY);
    return v === "en" || v === "hinglish" ? v : null;
  } catch {
    return null;
  }
}
/** Best guess before they've answered, for warming the model in the background: Hindi in the browser languages -> Hinglish. */
export function likelySpeechLanguage(): SpeechLanguage {
  if (!HINGLISH_AVAILABLE) return "en";
  const saved = savedSpeechLanguage();
  if (saved) return saved;
  const langs = typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language];
  return langs.some((l) => /^hi/i.test(l)) ? "hinglish" : "en";
}
export function saveSpeechLanguage(l: SpeechLanguage) {
  try {
    localStorage.setItem(PREF_KEY, l);
  } catch { /* private mode */ }
}

export type Device = "webgpu" | "wasm";
type Dtype = "fp16" | "q4f16" | "q8";
export interface Runtime { device: Device; dtype: { encoder_model: Dtype; decoder_model_merged: Dtype } }

const BROKEN_KEY = "ce:webgpu-broken";

export const runtimeFor = (device: Device): Runtime => ({
  device,
  dtype: device === "webgpu" ? { encoder_model: "fp16", decoder_model_merged: "q4f16" } : { encoder_model: "q8", decoder_model_merged: "q8" },
});

const suffix = (dtype: Dtype) => (dtype === "q8" ? "_quantized" : `_${dtype}`);

/** Every file the pipeline fetches for this model and runtime, as the exact URLs transformers.js keys its cache by. */
export function modelFiles(m: SpeechModel, rt: Runtime): string[] {
  const fileUrl = (name: string) => `${m.host}${m.id}/resolve/${m.revision}/${name}`;
  return [
    "config.json",
    "generation_config.json",
    "preprocessor_config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    `onnx/encoder_model${suffix(rt.dtype.encoder_model)}.onnx`,
    `onnx/decoder_model_merged${suffix(rt.dtype.decoder_model_merged)}.onnx`,
  ].map(fileUrl);
}

/** A GPU that advertised f16 but failed once is remembered (per browser version) so later visits skip the failed compile. */
const uaMajor = () => (typeof navigator === "undefined" ? "" : (navigator.userAgent.match(/(?:Chrome|Version|Firefox)\/(\d+)/)?.[1] ?? ""));

export function webgpuMarkedBroken(): boolean {
  try {
    return localStorage.getItem(BROKEN_KEY) === uaMajor();
  } catch {
    return false;
  }
}
export function markWebgpuBroken() {
  try {
    localStorage.setItem(BROKEN_KEY, uaMajor());
  } catch { /* private mode */ }
}

/** Does this browser have a WebGPU adapter with 16-bit shader support? Works on the main thread and in workers. */
export async function webgpuF16(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu;
    const adapter = gpu ? await gpu.requestAdapter() : null;
    return !!adapter?.features.has("shader-f16");
  } catch {
    return false;
  }
}

/**
 * Phones and low-memory devices: the tab's memory budget is small, and a mobile GPU driver crash kills the whole
 * tab (Chrome's "Can't open this page"), taking the editor with it. These devices always get the quantized (q8)
 * WASM runtime on a single thread — slower, but it survives. Desktops keep the WebGPU/fp16 fast path.
 */
export function isConstrainedDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  if (/Android|webOS|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent ?? "")) return true;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return mem !== undefined && mem <= 4;
}

let picked: Promise<Runtime> | null = null;
export function pickRuntime(forceWasm = false): Promise<Runtime> {
  if (forceWasm || webgpuMarkedBroken() || isConstrainedDevice()) return Promise.resolve(runtimeFor("wasm"));
  return (picked ??= webgpuF16().then((ok) => runtimeFor(ok ? "webgpu" : "wasm")));
}

const CACHE = "transformers-cache";

async function cacheHas(cache: Cache, url: string) {
  return (await cache.match(url)) !== undefined;
}

/** Are all of this model's files (for this device's runtime) already in the browser cache? */
export async function isModelSaved(lang: SpeechLanguage = likelySpeechLanguage()): Promise<boolean> {
  try {
    if (typeof caches === "undefined") return false;
    const rt = await pickRuntime();
    const cache = await caches.open(CACHE);
    const checks = await Promise.all(modelFiles(MODELS[lang], rt).map((u) => cacheHas(cache, u)));
    return checks.every(Boolean);
  } catch {
    return false;
  }
}

/** Don't spend a user's data or battery when they've asked the browser to save it. */
export function networkAllowsPrefetch(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (!c) return true;
  return !c.saveData && !/^(slow-)?2g$/.test(c.effectiveType ?? "");
}

const prefetching = new Map<SpeechLanguage, Promise<void>>();

/**
 * Downloads the model files into Cache Storage (bytes only, no memory cost) while the user is doing something else:
 * on the landing page, on the dashboard, on the upload screen. Resumes naturally: files already cached are skipped.
 */
export function prefetchModel(lang: SpeechLanguage = likelySpeechLanguage(), onProgress?: (fraction: number) => void): Promise<void> {
  if (typeof caches === "undefined" || typeof fetch === "undefined") return Promise.resolve();
  const running = prefetching.get(lang);
  if (running) return running;
  const p = (async () => {
    try {
      const rt = await pickRuntime();
      const cache = await caches.open(CACHE);
      const urls = modelFiles(MODELS[lang], rt);
      let done = 0;
      for (const url of urls) {
        if (!(await cacheHas(cache, url))) {
          const res = await fetch(url, { mode: "cors" });
          if (!res.ok) throw new Error(`model file ${res.status}`);
          await cache.put(url, res);
        }
        onProgress?.(++done / urls.length);
      }
      void navigator.storage?.persist?.().catch(() => false);
    } catch {
      prefetching.delete(lang); // try again next time; the real run downloads anything missing itself
    }
  })();
  prefetching.set(lang, p);
  return p;
}

/** Start the prefetch when the browser is idle, and only on a connection that can afford it. */
export function prefetchWhenIdle() {
  if (typeof window === "undefined" || !networkAllowsPrefetch()) return;
  const go = () => void prefetchModel();
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (ric) ric(go, { timeout: 4000 });
  else setTimeout(go, 1500);
}
