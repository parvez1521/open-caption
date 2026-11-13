import { afterEach, describe, expect, it, vi } from "vitest";
import { MODELS, PROJECT_LANGUAGE, SHIPPED_LANGUAGES, isConstrainedDevice, likelySpeechLanguage, modelFiles, networkAllowsPrefetch, runtimeFor, savedSpeechLanguage, speechLanguageOf } from "../runtime";

const PHONE_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const DESKTOP_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function setNavigator(value: Record<string, unknown>) {
  Object.defineProperty(globalThis, "navigator", { value, configurable: true, writable: true });
}
afterEach(() => {
  // @ts-expect-error test cleanup: vitest gives each file a fresh global anyway
  delete globalThis.navigator;
  vi.resetModules();
});

describe("constrained-device policy (phones must not get the heavy runtime)", () => {
  it("treats Android and iPhone browsers as constrained", () => {
    setNavigator({ userAgent: PHONE_UA });
    expect(isConstrainedDevice()).toBe(true);
    setNavigator({ userAgent: IPHONE_UA });
    expect(isConstrainedDevice()).toBe(true);
  });

  it("treats a low-memory desktop as constrained and a normal desktop as not", () => {
    setNavigator({ userAgent: DESKTOP_UA, deviceMemory: 2 });
    expect(isConstrainedDevice()).toBe(true);
    setNavigator({ userAgent: DESKTOP_UA, deviceMemory: 8 });
    expect(isConstrainedDevice()).toBe(false);
    setNavigator({ userAgent: DESKTOP_UA });
    expect(isConstrainedDevice()).toBe(false);
  });

  it("the WASM runtime is the quantized (q8) one, for both model halves", () => {
    expect(runtimeFor("wasm").dtype).toEqual({ encoder_model: "q8", decoder_model_merged: "q8" });
    expect(runtimeFor("webgpu").dtype.encoder_model).toBe("fp16"); // desktop fast path unchanged
  });

  it("pickRuntime never picks WebGPU on a phone, even with an f16 adapter", async () => {
    const gpu = { requestAdapter: async () => ({ features: new Set(["shader-f16"]) }) };
    setNavigator({ userAgent: PHONE_UA, gpu });
    const rt = await import("../runtime");
    await expect(rt.pickRuntime()).resolves.toMatchObject({ device: "wasm" });
  });

  it("pickRuntime still picks WebGPU on a desktop with an f16 adapter", async () => {
    const gpu = { requestAdapter: async () => ({ features: new Set(["shader-f16"]) }) };
    setNavigator({ userAgent: DESKTOP_UA, gpu, deviceMemory: 8 });
    const rt = await import("../runtime");
    await expect(rt.pickRuntime()).resolves.toMatchObject({ device: "webgpu" });
  });
});

describe("multilingual model map (Slice 5.2: Devanagari Hindi)", () => {
  it("Hindi (Devanagari) is backed by the multilingual Whisper base model with the 'hi' token", () => {
    expect(MODELS.hindi.id).toBe("onnx-community/whisper-base_timestamped");
    expect(MODELS.hindi.language).toBe("hi");
    expect(MODELS.hindi.licence).toBe("MIT");
    expect(MODELS.hindi.approxDownloadMb).toBeGreaterThan(0);
  });

  it("Hindi downloads exactly the English model's files (same repo + revision): no second download", () => {
    expect(MODELS.hindi.id).toBe(MODELS.en.id);
    expect(MODELS.hindi.revision).toBe(MODELS.en.revision);
    expect(modelFiles(MODELS.hindi, runtimeFor("wasm"))).toEqual(modelFiles(MODELS.en, runtimeFor("wasm")));
    expect(modelFiles(MODELS.hindi, runtimeFor("webgpu"))).toEqual(modelFiles(MODELS.en, runtimeFor("webgpu")));
    expect(MODELS.hindi.approxDownloadMb).toBe(MODELS.en.approxDownloadMb);
  });

  it("the Roman-Hinglish choice is untouched: its own fine-tune, decoded with 'en', stored as hi-Latn", () => {
    expect(MODELS.hinglish.id).toContain("hinglish");
    expect(MODELS.hinglish.language).toBe("en");
    expect(PROJECT_LANGUAGE.hinglish).toBe("hi-Latn");
    expect(PROJECT_LANGUAGE.hindi).toBe("hi");
    expect(PROJECT_LANGUAGE.en).toBe("en");
  });

  it("project language -> model: hi-Latn stays Roman, bare hi is Devanagari, unknown codes fall back to English", () => {
    expect(speechLanguageOf("hi-Latn")).toBe("hinglish");
    expect(speechLanguageOf("hinglish")).toBe("hinglish");
    expect(speechLanguageOf("hi")).toBe("hindi");
    expect(speechLanguageOf("hi-Deva")).toBe("hindi");
    expect(speechLanguageOf("hi-IN")).toBe("hindi");
    expect(speechLanguageOf("en")).toBe("en");
    expect(speechLanguageOf("auto")).toBe("en");
    expect(speechLanguageOf(null)).toBe("en");
    expect(speechLanguageOf("ja")).toBe("en"); // unshipped languages are never promised: they fall back, not listed
  });

  it("only shipped languages are offered, each with a label and download size from the one map", () => {
    expect(SHIPPED_LANGUAGES.map((m) => m.key)).toEqual(["en", "hinglish", "hindi", "tamil", "telugu", "bengali", "marathi", "punjabi", "urdu", "spanish", "french", "german", "arabic", "portuguese"]);
    for (const m of SHIPPED_LANGUAGES) {
      expect(m.choiceLabel.length).toBeGreaterThan(0);
      expect(m.approxDownloadMb).toBeGreaterThan(0);
      expect(m.licence.length).toBeGreaterThan(0);
    }
  });

  it("remembers a Hindi choice like any other", () => {
    localStorage.setItem("ce:speech-language", "hindi");
    expect(savedSpeechLanguage()).toBe("hindi");
    localStorage.setItem("ce:speech-language", "hinglish");
    expect(savedSpeechLanguage()).toBe("hinglish");
    localStorage.removeItem("ce:speech-language");
  });
});

describe("eleven new languages (2026-11-12: Indian + world)", () => {
  const NEW: { key: keyof typeof MODELS; token: string; project: string; budget: number }[] = [
    { key: "tamil", token: "ta", project: "ta", budget: 12 },
    { key: "telugu", token: "te", project: "te", budget: 12 },
    { key: "bengali", token: "bn", project: "bn", budget: 12 },
    { key: "marathi", token: "mr", project: "mr", budget: 12 },
    { key: "punjabi", token: "pa", project: "pa", budget: 12 },
    { key: "urdu", token: "ur", project: "ur", budget: 12 },
    { key: "spanish", token: "es", project: "es", budget: 7 },
    { key: "french", token: "fr", project: "fr", budget: 7 },
    { key: "german", token: "de", project: "de", budget: 7 },
    { key: "arabic", token: "ar", project: "ar", budget: 12 },
    { key: "portuguese", token: "pt", project: "pt", budget: 7 },
  ];

  it("every new language is the stock Whisper base with its own token: same files as English, no second download", () => {
    for (const n of NEW) {
      const m = MODELS[n.key];
      expect(m.language).toBe(n.token);
      expect(m.id).toBe(MODELS.en.id);
      expect(m.revision).toBe(MODELS.en.revision);
      expect(m.licence).toBe("MIT");
      expect(m.tokensPerSecond).toBe(n.budget);
      expect(modelFiles(m, runtimeFor("wasm"))).toEqual(modelFiles(MODELS.en, runtimeFor("wasm")));
      expect(modelFiles(m, runtimeFor("webgpu"))).toEqual(modelFiles(MODELS.en, runtimeFor("webgpu")));
    }
  });

  it("project language -> model for all eleven (code, region variant, full name)", () => {
    const cases: [string, string][] = [
      ["ta", "tamil"], ["ta-IN", "tamil"], ["tamil", "tamil"],
      ["te", "telugu"], ["te-IN", "telugu"],
      ["bn", "bengali"], ["bn-BD", "bengali"], ["bangla", "bengali"],
      ["mr", "marathi"], ["mr-IN", "marathi"],
      ["pa", "punjabi"], ["pa-IN", "punjabi"],
      ["ur", "urdu"], ["ur-PK", "urdu"],
      ["es", "spanish"], ["es-ES", "spanish"],
      ["fr", "french"], ["fr-FR", "french"],
      ["de", "german"], ["de-DE", "german"], ["deutsch", "german"],
      ["ar", "arabic"], ["ar-SA", "arabic"],
      ["pt", "portuguese"], ["pt-BR", "portuguese"],
    ];
    for (const [input, expected] of cases) expect(speechLanguageOf(input)).toBe(expected);
  });

  it("project language round-trips for all eleven", () => {
    for (const n of NEW) expect(PROJECT_LANGUAGE[n.key]).toBe(n.project);
  });

  it("remembers a new-language choice and rejects an unknown saved value", () => {
    localStorage.setItem("ce:speech-language", "tamil");
    expect(savedSpeechLanguage()).toBe("tamil");
    localStorage.setItem("ce:speech-language", "xx");
    expect(savedSpeechLanguage()).toBe(null);
    localStorage.removeItem("ce:speech-language");
  });

  it("guesses from the browser language for the new languages", () => {
    localStorage.removeItem("ce:speech-language");
    setNavigator({ languages: ["ta-IN", "en-IN"] });
    expect(likelySpeechLanguage()).toBe("tamil");
    setNavigator({ languages: ["pt-BR"] });
    expect(likelySpeechLanguage()).toBe("portuguese");
    setNavigator({ languages: ["xx"] });
    expect(likelySpeechLanguage()).toBe("en");
  });
});

describe("prefetch network gate (click/intent only — a hover must never start a multi-MB download)", () => {
  it("allows the prefetch with no connection info (desktop / unknown browser)", () => {
    setNavigator({ userAgent: DESKTOP_UA });
    expect(networkAllowsPrefetch()).toBe(true);
  });

  it("allows the prefetch on 4G only", () => {
    setNavigator({ userAgent: DESKTOP_UA, connection: { saveData: false, effectiveType: "4g" } });
    expect(networkAllowsPrefetch()).toBe(true);
  });

  it("blocks the prefetch on 3G, 2G and slow-2G", () => {
    for (const effectiveType of ["3g", "2g", "slow-2g"]) {
      setNavigator({ userAgent: DESKTOP_UA, connection: { saveData: false, effectiveType } });
      expect(networkAllowsPrefetch()).toBe(false);
    }
  });

  it("blocks the prefetch when Save-Data is on, even on 4G", () => {
    setNavigator({ userAgent: DESKTOP_UA, connection: { saveData: true, effectiveType: "4g" } });
    expect(networkAllowsPrefetch()).toBe(false);
  });
});
