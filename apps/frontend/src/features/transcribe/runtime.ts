/**
 * Which speech model and which flavour of it this device runs, and how to get its files into the browser cache before
 * the video arrives. Shared by the worker (loads the model) and the main thread (prefetches the bytes), so the two
 * can never disagree about which files are needed.
 *
 * Models, picked by what the creator says is spoken (asked on the upload screen):
 *   en        stock Whisper base (multilingual), forced to English
 *   hinglish  Oriserve Whisper-Hindi2Hinglish-Swift: Whisper base fine-tuned on Indian Hindi speech, writes Hindi and
 *             Hinglish in Roman script. Same size and architecture as base, so the same speed.
 *   hindi     the SAME stock multilingual Whisper base as `en`, forced to Hindi ("hi"): captions come out in
 *             Devanagari script. Same repo, revision and files as `en`, so a browser that already downloaded the
 *             English model downloads nothing extra — only the language token changes.
 *   tamil, telugu, bengali, marathi, punjabi, urdu, spanish, french, german, arabic, portuguese
 *             the SAME stock multilingual Whisper base as `en`, forced to that language's Whisper token
 *             ("ta", "te", "bn", "mr", "pa", "ur", "es", "fr", "de", "ar", "pt"): same repo, revision and files
 *             as `en`, so again nothing extra to download — only the token changes. Urdu and Arabic write
 *             right-to-left scripts; they render through the browser's bidi handling (no RTL-specific caption
 *             layout yet).
 * Only the chosen model is downloaded. A language ships only when it is wired end to end (this map, the worker's
 * language token, and the caption engine's alignment gate — Devanagari fixtures live in the caption-engine suite);
 * no other language is listed anywhere in the UI.
 *
 * Model choice for `hindi` (evaluated for Phase 5 Slice 5.2): the multilingual Whisper family offers tiny (39M)
 * and base (74M) as the small end. Tiny was rejected: its Hindi accuracy is the weakest in the family and it would
 * be a second, separate download. Base is the smallest model that (a) ships in the `_timestamped` export this
 * pipeline needs for word-level timestamps, (b) is already the proven English download in this codebase, and
 * (c) covers Hindi with the language token alone. Licence: MIT (OpenAI Whisper; the onnx-community export keeps
 * the upstream licence) — Whisper/Transformers.js were audited SAFE (Apache-2.0/MIT family) in the Phase 1 audit.
 */

export type SpeechLanguage =
  | "en"
  | "hinglish"
  | "hindi"
  | "tamil"
  | "telugu"
  | "bengali"
  | "marathi"
  | "punjabi"
  | "urdu"
  | "spanish"
  | "french"
  | "german"
  | "arabic"
  | "portuguese";

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
  /** Upstream licence of the model weights (recorded per the Phase 1 licence audit). */
  licence: string;
  /**
   * Approximate one-time download in MB for this device class's runtime files (the exact bytes differ slightly
   * between the WebGPU and WASM file sets). Shown in the UI next to the language choice — never rounded up into
   * a bigger claim, and for `hindi` it is the very same download as `en` (identical files).
   */
  approxDownloadMb: number;
  /** Label for the upload-screen language choice. */
  choiceLabel: string;
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
    licence: "MIT",
    approxDownloadMb: 90,
    choiceLabel: "English",
  },
  hinglish: {
    key: "hinglish",
    id: process.env.NEXT_PUBLIC_HINGLISH_MODEL_ID || "ishaan-g/whisper-hinglish-swift_timestamped",
    revision: process.env.NEXT_PUBLIC_HINGLISH_MODEL_REVISION || "eb0fe25c3aba1799633033ad4a58ef0cad877606",
    host: withSlash(process.env.NEXT_PUBLIC_HINGLISH_MODEL_HOST || HF),
    language: "en",
    label: "hinglish-swift (browser)",
    tokensPerSecond: 12,
    licence: "MIT",
    approxDownloadMb: 90,
    choiceLabel: "Hindi / Hinglish",
  },
  hindi: {
    key: "hindi",
    // Multilingual Whisper base, the exact repo + revision the English choice already downloads: the files are
    // identical, so this language costs no extra download on a browser that has captioned English before.
    id: "onnx-community/whisper-base_timestamped",
    revision: "608c49e61301901684bc36cac8f74b95ff6b5a8e",
    host: HF,
    language: "hi",
    label: "whisper-base · Hindi (browser)",
    // Devanagari costs Whisper more tokens per word than English (multi-byte script, ~2-3 tokens a word): same
    // budget as the Roman-Hinglish model so real speech is never cut while loops still stop.
    tokensPerSecond: 12,
    licence: "MIT",
    approxDownloadMb: 90,
    choiceLabel: "Hindi (देवनागरी)",
  },
  // The eleven below share the stock multilingual Whisper base with `en` (same repo + revision, only the language
  // token changes), so none of them costs a second download on a browser that has captioned English before.
  // Non-Latin scripts budget 12 tokens/second like Hindi; Latin-script languages budget 7 like English.
  tamil: {
    key: "tamil",
    id: "onnx-community/whisper-base_timestamped",
    revision: "608c49e61301901684bc36cac8f74b95ff6b5a8e",
    host: HF,
    language: "ta",
    label: "whisper-base · Tamil (browser)",
    tokensPerSecond: 12,
    licence: "MIT",
    approxDownloadMb: 90,
    choiceLabel: "Tamil (தமிழ்)",
  },
  telugu: {
    key: "telugu",
    id: "onnx-community/whisper-base_timestamped",
    revision: "608c49e61301901684bc36cac8f74b95ff6b5a8e",
    host: HF,
    language: "te",
    label: "whisper-base · Telugu (browser)",
    tokensPerSecond: 12,
    licence: "MIT",
    approxDownloadMb: 90,
    choiceLabel: "Telugu (తెలుగు)",
  },
  bengali: {
    key: "bengali",
    id: "onnx-community/whisper-base_timestamped",
    revision: "608c49e61301901684bc36cac8f74b95ff6b5a8e",
    host: HF,
    language: "bn",
    label: "whisper-base · Bengali (browser)",
    tokensPerSecond: 12,
    licence: "MIT",
    approxDownloadMb: 90,
    choiceLabel: "Bengali (বাংলা)",
  },
  marathi: {
    key: "marathi",
    id: "onnx-community/whisper-base_timestamped",
    revision: "608c49e61301901684bc36cac8f74b95ff6b5a8e",
    host: HF,
    language: "mr",
    label: "whisper-base · Marathi (browser)",
    tokensPerSecond: 12,
    licence: "MIT",
    approxDownloadMb: 90,
    choiceLabel: "Marathi (मराठी)",
  },
  punjabi: {
    key: "punjabi",
    id: "onnx-community/whisper-base_timestamped",
    revision: "608c49e61301901684bc36cac8f74b95ff6b5a8e",
    host: HF,
    language: "pa",
    label: "whisper-base · Punjabi (browser)",
    tokensPerSecond: 12,
    licence: "MIT",
    approxDownloadMb: 90,
    choiceLabel: "Punjabi (ਪੰਜਾਬੀ)",
  },
  urdu: {
    key: "urdu",
    id: "onnx-community/whisper-base_timestamped",
    revision: "608c49e61301901684bc36cac8f74b95ff6b5a8e",
    host: HF,
    language: "ur",
    label: "whisper-base · Urdu (browser)",
    tokensPerSecond: 12,
    licence: "MIT",
    approxDownloadMb: 90,
    choiceLabel: "Urdu (اردو)",
  },
  spanish: {
    key: "spanish",
    id: "onnx-community/whisper-base_timestamped",
    revision: "608c49e61301901684bc36cac8f74b95ff6b5a8e",
    host: HF,
    language: "es",
    label: "whisper-base · Spanish (browser)",
    tokensPerSecond: 7,
    licence: "MIT",
    approxDownloadMb: 90,
    choiceLabel: "Spanish (Español)",
  },
  french: {
    key: "french",
    id: "onnx-community/whisper-base_timestamped",
    revision: "608c49e61301901684bc36cac8f74b95ff6b5a8e",
    host: HF,
    language: "fr",
    label: "whisper-base · French (browser)",
    tokensPerSecond: 7,
    licence: "MIT",
    approxDownloadMb: 90,
    choiceLabel: "French (Français)",
  },
  german: {
    key: "german",
    id: "onnx-community/whisper-base_timestamped",
    revision: "608c49e61301901684bc36cac8f74b95ff6b5a8e",
    host: HF,
    language: "de",
    label: "whisper-base · German (browser)",
    tokensPerSecond: 7,
    licence: "MIT",
    approxDownloadMb: 90,
    choiceLabel: "German (Deutsch)",
  },
  arabic: {
    key: "arabic",
    id: "onnx-community/whisper-base_timestamped",
    revision: "608c49e61301901684bc36cac8f74b95ff6b5a8e",
    host: HF,
    language: "ar",
    label: "whisper-base · Arabic (browser)",
    tokensPerSecond: 12,
    licence: "MIT",
    approxDownloadMb: 90,
    choiceLabel: "Arabic (العربية)",
  },
  portuguese: {
    key: "portuguese",
    id: "onnx-community/whisper-base_timestamped",
    revision: "608c49e61301901684bc36cac8f74b95ff6b5a8e",
    host: HF,
    language: "pt",
    label: "whisper-base · Portuguese (browser)",
    tokensPerSecond: 7,
    licence: "MIT",
    approxDownloadMb: 90,
    choiceLabel: "Portuguese (Português)",
  },
};

/**
 * The languages the upload screen may offer, in display order: exactly the entries of this map that are shipped
 * and available. A language that is not wired end to end must not appear here — and if it is not in MODELS, it
 * cannot appear at all.
 */
export const SHIPPED_LANGUAGES: SpeechModel[] = [
  MODELS.en,
  ...(HINGLISH_AVAILABLE ? [MODELS.hinglish] : []),
  MODELS.hindi,
  MODELS.tamil,
  MODELS.telugu,
  MODELS.bengali,
  MODELS.marathi,
  MODELS.punjabi,
  MODELS.urdu,
  MODELS.spanish,
  MODELS.french,
  MODELS.german,
  MODELS.arabic,
  MODELS.portuguese,
];

/**
 * Project language ("en", "hi", "hi-Latn", "auto" …) -> which model writes its captions.
 * "hi-Latn" / "hinglish" is the Roman-script choice and keeps mapping to the Hinglish fine-tune, exactly as
 * before. Bare "hi" (and "hi-Deva" / "hi-IN") is Hindi in its standard script — Devanagari — and maps to the
 * multilingual model with the "hi" token. (Before Slice 5.2 bare "hi" also fell through to the Roman model,
 * because that was the only Hindi path; "hi-Latn" is unchanged, so every project that meant Roman still gets it.)
 */
export const speechLanguageOf = (projectLanguage: string | null | undefined): SpeechLanguage => {
  const l = (projectLanguage ?? "").trim().toLowerCase();
  if (l === "hi-latn" || l.startsWith("hinglish")) return HINGLISH_AVAILABLE ? "hinglish" : "en";
  if (l === "hi" || l.startsWith("hi-deva") || l.startsWith("hi-in")) return "hindi";
  if (l === "ta" || l.startsWith("ta-") || l === "tamil") return "tamil";
  if (l === "te" || l.startsWith("te-") || l === "telugu") return "telugu";
  if (l === "bn" || l.startsWith("bn-") || l === "bengali" || l === "bangla") return "bengali";
  if (l === "mr" || l.startsWith("mr-") || l === "marathi") return "marathi";
  if (l === "pa" || l.startsWith("pa-") || l === "punjabi") return "punjabi";
  if (l === "ur" || l.startsWith("ur-") || l === "urdu") return "urdu";
  if (l === "es" || l.startsWith("es-") || l === "spanish" || l === "espanol") return "spanish";
  if (l === "fr" || l.startsWith("fr-") || l === "french" || l === "francais") return "french";
  if (l === "de" || l.startsWith("de-") || l === "german" || l === "deutsch") return "german";
  if (l === "ar" || l.startsWith("ar-") || l === "arabic") return "arabic";
  if (l === "pt" || l.startsWith("pt-") || l === "portuguese" || l === "portugues") return "portuguese";
  return "en";
};

/** What we store as the project's language for each choice. */
export const PROJECT_LANGUAGE: Record<SpeechLanguage, string> = {
  en: "en",
  hinglish: "hi-Latn",
  hindi: "hi",
  tamil: "ta",
  telugu: "te",
  bengali: "bn",
  marathi: "mr",
  punjabi: "pa",
  urdu: "ur",
  spanish: "es",
  french: "fr",
  german: "de",
  arabic: "ar",
  portuguese: "pt",
};

export const modelKeyOf = (m: SpeechModel) => `${m.id}@${m.revision}`;

const PREF_KEY = "ce:speech-language";
/** The creator's last answer to "what language is spoken?" (null until they've answered once). */
export function savedSpeechLanguage(): SpeechLanguage | null {
  if (!HINGLISH_AVAILABLE) return "en";
  try {
    const v = localStorage.getItem(PREF_KEY);
    return v !== null && v in MODELS ? (v as SpeechLanguage) : null;
  } catch {
    return null;
  }
}
/**
 * Best guess before they've answered, for warming the model in the background: the browser's first language,
 * mapped to a shipped choice (Hindi in the browser languages -> Hinglish). Unchanged by the Devanagari path:
 * Roman-Hinglish stays the default guess for Hindi, and Hindi (Devanagari) is always an explicit pick on the
 * upload screen, never a guess.
 */
export function likelySpeechLanguage(): SpeechLanguage {
  if (!HINGLISH_AVAILABLE) return "en";
  const saved = savedSpeechLanguage();
  if (saved) return saved;
  const langs = typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language];
  const GUESS: Record<string, SpeechLanguage> = {
    hi: "hinglish",
    ta: "tamil",
    te: "telugu",
    bn: "bengali",
    mr: "marathi",
    pa: "punjabi",
    ur: "urdu",
    es: "spanish",
    fr: "french",
    de: "german",
    ar: "arabic",
    pt: "portuguese",
  };
  for (const l of langs) {
    const guess = GUESS[l.slice(0, 2).toLowerCase()];
    if (guess) return guess;
  }
  return "en";
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

/** Don't spend a user's data or battery when they've asked the browser to save it,
 *  or when the connection is anything slower than 4G. No connection info at all
 *  (desktop, or a browser that doesn't expose it) still allows the prefetch. */
export function networkAllowsPrefetch(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (!c) return true;
  if (c.saveData) return false;
  if (c.effectiveType && c.effectiveType !== "4g") return false;
  return true;
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
