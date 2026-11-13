// Node-side Whisper accuracy reference for the overnight QA mission.
// Uses the EXACT pinned model the app ships for `en` (+ 11 languages):
//   onnx-community/whisper-base_timestamped @ 608c49e61301901684bc36cac8f74b95ff6b5a8e
// from the local HF cache (~/.cache/huggingface), cache-only (no downloads).
// LIMITS (recorded honestly in the report):
// - This tests the MODEL, not the browser worker path (different runtime, no
//   WebGPU/WASM, no worker chunking, no VAD/packing/offset aligner).
// - Hinglish here uses the STOCK base with language token "en". The app's Hinglish
//   choice uses a fine-tuned model (ishaan-g/whisper-hinglish-swift_timestamped)
//   which is NOT in the local cache, so Hinglish Node results are an approximation.
// - Audio is extracted with ffmpeg to 16 kHz mono WAV first (the pipeline input).
// Usage (quiet machine only; pnpm install in the worktree first):
//   node qa/overnight-audit/tests/e2e/node-transcribe-ref.mjs [asset...]
// NOTE: @huggingface/transformers resolves only via a symlink at
// tests/e2e/node_modules/@huggingface/transformers -> the pnpm store path
// (create it before running; do NOT commit it). Model files must be linked
// from their revision subdirs to the model top level (see RESUME.md).
// Output: qa/overnight-audit/evidence/node-transcribe/<file>.json + summary.md
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const ASSETS = path.join(ROOT, "qa/overnight-audit/tests/assets");
// Model override (env): QA_MODEL_ID / QA_MODEL_REVISION / QA_MODEL_KEY.
// Default = the pinned `en` model. Set QA_MODEL_ID=ishaan-g/whisper-hinglish-swift_timestamped
// + QA_MODEL_REVISION=eb0fe25c3aba1799633033ad4a58ef0cad877606 for the app's real Hinglish model.
const MODEL_ID = process.env.QA_MODEL_ID || "onnx-community/whisper-base_timestamped";
const MODEL_REVISION = process.env.QA_MODEL_REVISION || "608c49e61301901684bc36cac8f74b95ff6b5a8e";
const MODEL_KEY = process.env.QA_MODEL_KEY || "base";
const OUT = path.join(ROOT, "qa/overnight-audit/evidence/node-transcribe", MODEL_KEY);
fs.mkdirSync(OUT, { recursive: true });

// Reference transcripts from tests/assets/MANIFEST.md (exact VO text).
const REFERENCE = {
  "v01_short_hinglish_720x1280.mp4": { lang: "en", text: "Aapki reel mute pe dekhi ja rahi hai." },
  "v02_normal_hinglish_1080x1920.mp4": { lang: "en", text: "Aapki reel mute pe dekhi ja rahi hai. Aadhe log sound on karte hi nahi. Bina captions ke, aapki best line kabhi suni hi nahi jaati." },
  "v03_long_hinglish_1280x720.mp4": { lang: "en", text: "Aapki reel mute pe dekhi ja rahi hai. Aadhe log sound on karte hi nahi. Bina captions ke, aapki best line kabhi suni hi nahi jaati. Ek Reel ke captions, ek minute mein. Dekho kaise. Step one clip drop karo. Step two har word apne time pe aa jaata hai." },
  "v04_english_720x1280.mp4": { lang: "en", text: null }, // exact words unverified
  "v05_hinglish_720x1280.mp4": { lang: "en", text: "Aadhe log sound on karte hi nahi. Bina captions ke, aapki best line kabhi suni hi nahi jaati." },
  "v06_music_hinglish_720x1280.mp4": { lang: "en", text: "Aadhe log sound on karte hi nahi. Bina captions ke, aapki best line kabhi suni hi nahi jaati." },
  "v07_silence_720x1280.mp4": { lang: "en", text: "" },
  "v08_noisy_hinglish_720x1280.mp4": { lang: "en", text: "Aadhe log sound on karte hi nahi. Bina captions ke, aapki best line kabhi suni hi nahi jaati." },
  "v09_noaudio_720x1280.mp4": { lang: "en", text: "" },
  "v13_twoseg_720x1280.mp4": { lang: "en", text: "Aapki reel mute pe dekhi ja rahi hai. Ek Reel ke captions, ek minute mein. Dekho kaise." },
};

const norm = (s) => (s || "").toLowerCase().replace(/[.,!?—–-]/g, " ").replace(/\s+/g, " ").trim();

// transformers.js in Node has no AudioContext, so a WAV file path cannot be
// passed to the pipeline. Decode the ffmpeg-written 16 kHz mono PCM16 WAV
// by hand (scan for the "data" chunk; convert int16 -> float32).
function decodeWav16Mono(wavPath) {
  const buf = fs.readFileSync(wavPath);
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`not a RIFF/WAVE file: ${wavPath}`);
  }
  let off = 12;
  let dataOff = -1;
  let dataLen = 0;
  let fmt = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") {
      fmt = {
        audioFormat: buf.readUInt16LE(off + 8),
        channels: buf.readUInt16LE(off + 10),
        sampleRate: buf.readUInt32LE(off + 12),
        bitsPerSample: buf.readUInt16LE(off + 22),
      };
    } else if (id === "data") {
      dataOff = off + 8;
      dataLen = size;
      break;
    }
    off += 8 + size + (size % 2);
  }
  if (dataOff < 0) throw new Error(`no data chunk in ${wavPath}`);
  if (!fmt || fmt.audioFormat !== 1 || fmt.bitsPerSample !== 16) {
    throw new Error(`unsupported WAV format in ${wavPath}: ${JSON.stringify(fmt)}`);
  }
  const samples = new Float32Array(dataLen / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = buf.readInt16LE(dataOff + i * 2) / 32768;
  return { samples, sampleRate: fmt.sampleRate };
}
const wordOverlap = (ref, got) => {
  const r = norm(ref).split(" ").filter(Boolean);
  const g = new Set(norm(got).split(" ").filter(Boolean));
  if (!r.length) return { refWords: 0, matched: 0, missing: [] };
  const missing = r.filter((w) => !g.has(w));
  return { refWords: r.length, matched: r.length - missing.length, missing };
};

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : Object.keys(REFERENCE);

const { env, pipeline } = await import("@huggingface/transformers");
env.localModelPath = path.join(os.homedir(), ".cache/huggingface");
env.allowRemoteModels = false; // cache-only; never downloads
env.allowLocalModels = true;

const transcriber = await pipeline(
  "automatic-speech-recognition",
  MODEL_ID,
  { revision: MODEL_REVISION, dtype: "q8" },
);

const summary = [];
for (const file of files) {
  const input = path.join(ASSETS, file);
  const wav = path.join(OUT, `${file}.wav`);
  const ff = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", input, "-ar", "16000", "-ac", "1", wav]);
  if (ff.status !== 0 || !fs.existsSync(wav)) {
    summary.push({ file, status: "ffmpeg-failed", detail: String(ff.stderr || "").slice(0, 200) });
    continue;
  }
  const ref = REFERENCE[file];
  const t0 = Date.now();
  const { samples, sampleRate } = decodeWav16Mono(wav);
  const out = await transcriber(samples, {
    sampling_rate: sampleRate,
    language: ref.lang,
    task: "transcribe",
    return_timestamps: "word",
    chunk_length_s: 30,
    stride_length_s: 5,
  });
  const ms = Date.now() - t0;
  const text = (out.text || "").trim();
  const words = (out.chunks || []).map((c) => ({ w: c.text.trim(), start: c.timestamp[0], end: c.timestamp[1] }));
  const overlap = ref.text === null ? null : wordOverlap(ref.text, text);
  const result = { file, model: `${MODEL_ID}@${MODEL_REVISION.slice(0, 8)} (q8)`, languageToken: ref.lang, ms, text, words, reference: ref.text, overlap };
  fs.writeFileSync(path.join(OUT, `${file}.json`), JSON.stringify(result, null, 2));
  summary.push({ file, status: "ok", ms, text: text.slice(0, 120), overlap });
  console.log(file, "->", text.slice(0, 120), overlap ? `(${overlap.matched}/${overlap.refWords} ref words)` : "(no reference)", `${ms}ms`);
}

const lines = ["# Node Whisper reference — summary", "", `Model: ${MODEL_ID} @ ${MODEL_REVISION.slice(0, 8)} (q8), cache-only.`, MODEL_KEY === "hinglish" ? "Hinglish note: the app's real fine-tuned Hinglish model, language token `en` (per runtime.ts)." : "Hinglish note: stock base with language token `en`. The app's Hinglish choice uses a fine-tuned model not in the cache, so Hinglish rows are an approximation.", "This tests the model, not the browser worker path.", ""];
for (const s of summary) {
  lines.push(`- ${s.file}: ${s.status}${s.overlap ? ` — ${s.overlap.matched}/${s.overlap.refWords} ref words matched; missing: ${s.overlap.missing.join(", ") || "none"}` : ""}${s.text ? ` — "${s.text}"` : ""}`);
}
fs.writeFileSync(path.join(OUT, "summary.md"), lines.join("\n") + "\n");
console.log("SUMMARY WRITTEN:", path.join(OUT, "summary.md"));
