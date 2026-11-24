// One-off measurement (NOT shipped code): runs the production in-browser model
// (onnx-community/whisper-base_timestamped, same id + revision as the eval harness
// and the Studio worker's English model) on the repo's real test clip and reports
// the raw Whisper word times against the energy-envelope ground truth.
//
//   node measure-real-clip.mjs
//
// Reads ../clip.f32 (16 kHz mono float32, converted from speech-test.mp3) and
// ../set.json. The model downloads once into ../.cache (gitignored). Run from
// this directory. Prints the Whisper words, the per-word start/end errors vs the
// bursts [240,1080] [1700,2540] [3020,3900] ms, and the mean |start error| —
// the numbers the pinned comment in speech.test.ts claims (starts 160-290 ms
// late). It does NOT apply refineWordTimings (that is TypeScript, covered by
// timingMeasurement.test.ts); it checks the raw model output the correction
// starts from.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline, env } from "@huggingface/transformers";

const dir = path.dirname(fileURLToPath(import.meta.url));
env.cacheDir = path.join(dir, "..", ".cache");
env.allowLocalModels = false;
env.allowRemoteModels = true;

const set = JSON.parse(fs.readFileSync(path.join(dir, "..", "set.json"), "utf8"));
const clip = set[0];
const buf = fs.readFileSync(path.join(dir, "..", `${clip.id}.f32`));
const audio = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);

const BURSTS = [
  [240, 1080],
  [1700, 2540],
  [3020, 3900],
];

const asr = await pipeline("automatic-speech-recognition", "onnx-community/whisper-base_timestamped", {
  dtype: "q8",
  revision: "608c49e61301901684bc36cac8f74b95ff6b5a8e",
});
const t0 = performance.now();
const out = await asr(audio, {
  language: "en",
  task: "transcribe",
  return_timestamps: "word",
  max_new_tokens: Math.min(440, Math.ceil(clip.seconds * 7) + 20),
});
const ms = Math.round(performance.now() - t0);

const chunks = (out.chunks ?? []).filter((c) => c.text.trim());
console.log(`model run: ${ms} ms for ${clip.seconds}s of audio`);
console.log(`text: ${chunks.map((c) => c.text).join("").trim()}`);
console.log("whisper words (ms):");
chunks.forEach((c, i) => {
  const [a, b] = c.timestamp;
  const startMs = Math.round(a * 1000);
  const endMs = Math.round((b ?? a + 0.3) * 1000);
  const burst = BURSTS[i];
  const startErr = burst ? startMs - burst[0] : null;
  const endErr = burst ? endMs - burst[1] : null;
  console.log(`  ${i + 1}. ${JSON.stringify(c.text)} [${startMs}, ${endMs}]  start err ${startErr} ms, end err ${endErr} ms`);
});
const startErrs = chunks.slice(0, BURSTS.length).map((c, i) => Math.abs(Math.round(c.timestamp[0] * 1000) - BURSTS[i][0]));
if (startErrs.length) {
  console.log(`mean |start error|: ${(startErrs.reduce((s, x) => s + x, 0) / startErrs.length).toFixed(0)} ms`);
}

// PACKED run: the same clip the way the Studio worker hears it — speech found by VAD
// (these bursts), silence dropped, segments packed with 0.1 s of glue between them
// (planWindows/renderWindow in speech.ts). The pinned measurement was made on packed
// audio; the raw clip above collapses the phrase because Whisper hears the silences.
const SR = 16000;
const GLUE = Math.round(0.1 * SR);
// detectSpeech pads every segment by 0.2 s (clamped to the neighbour's midpoint):
// [240,1080] -> [40,1280], [1700,2540] -> [1500,2740], [3020,3900] -> [2820,4100].
const PADDED = [
  [40, 1280],
  [1500, 2740],
  [2820, 4100],
];
async function runPacked(piecesMs, label, language) {
  const pieces = piecesMs.map(([s, e]) => audio.subarray(Math.round((s / 1000) * SR), Math.round((e / 1000) * SR)));
  const packedLen = pieces.reduce((n, p) => n + p.length, 0) + GLUE * (pieces.length - 1);
  const packed = new Float32Array(packedLen);
  let off = 0;
  const packedPieces = [];
  pieces.forEach((p, i) => {
    if (i > 0) off += GLUE;
    packed.set(p, off);
    packedPieces.push({ packedStart: off, origStart: piecesMs[i][0] });
    off += p.length;
  });
  const toOriginalMs = (packedMs) => {
    const t = (packedMs / 1000) * SR;
    for (let i = 0; i < packedPieces.length; i++) {
      const p = packedPieces[i];
      const pieceLen = pieces[i].length;
      if (t <= p.packedStart + pieceLen) {
        if (t >= p.packedStart) return Math.round(p.origStart + ((t - p.packedStart) / SR) * 1000);
        const prev = packedPieces[i - 1];
        return prev ? Math.round(prev.origStart + (pieces[i - 1].length / SR) * 1000) : Math.round(p.origStart);
      }
    }
    const last = packedPieces[packedPieces.length - 1];
    return Math.round(last.origStart + (pieces[pieces.length - 1].length / SR) * 1000);
  };
  const t1 = performance.now();
  const packedOut = await asr(packed, {
    ...(language ? { language } : {}),
    task: "transcribe",
    return_timestamps: "word",
    max_new_tokens: Math.min(440, Math.ceil((packedLen / SR) * 7) + 20),
  });
  const runMs = Math.round(performance.now() - t1);
  const packedChunks = (packedOut.chunks ?? []).filter((c) => c.text.trim());
  console.log(`\n${label}: ${runMs} ms for ${(packedLen / SR).toFixed(2)}s of packed audio`);
  console.log(`text: ${packedChunks.map((c) => c.text).join("").trim()}`);
  console.log("whisper words mapped back to the original clock (ms):");
  packedChunks.forEach((c, i) => {
    const [a, b] = c.timestamp;
    const startMs = toOriginalMs(Math.round(a * 1000));
    const endMs = toOriginalMs(Math.round((b ?? a + 0.3) * 1000));
    const burst = BURSTS[i];
    const startErr = burst ? startMs - burst[0] : null;
    const endErr = burst ? endMs - burst[1] : null;
    console.log(`  ${i + 1}. ${JSON.stringify(c.text)} [${startMs}, ${endMs}]  start err ${startErr} ms, end err ${endErr} ms`);
  });
  const errs = packedChunks.slice(0, BURSTS.length).map((c, i) => Math.abs(toOriginalMs(Math.round(c.timestamp[0] * 1000)) - BURSTS[i][0]));
  if (errs.length) {
    console.log(`${label} mean |start error|: ${(errs.reduce((s, x) => s + x, 0) / errs.length).toFixed(0)} ms`);
  }
}
await runPacked(BURSTS, "PACKED (tight bursts)", "en");
await runPacked(PADDED, "PACKED (worker padding)", "en");
await runPacked(PADDED, "PACKED (worker padding, auto language)", null);
await asr.dispose();
