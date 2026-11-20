// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { detectFaces, embeddingForFace, loadSessions, runSwap } from "../swapPipeline";
import { pickLargestFace } from "../swapMath";

/**
 * Real-pipeline verification (NOT a mock test): loads the real YuNet,
 * ArcFace and inswapper sessions from disk and swaps a real face between
 * two real photos.
 *
 * Run with:
 *   FACE_SWAP_VERIFY_DIR=/tmp/faceswap pnpm vitest run src/features/faceswap/__tests__/swapPipeline.verify.test.ts
 * where the dir holds:
 *   models/face_detection_yunet_2023mar.onnx
 *   models/w600k_r50.onnx
 *   models/buff2fs.bin
 *   models/inswapper_128_fp16.onnx
 *   samples/target.rgba + samples/source.rgba (raw RGBA) + samples/meta.json {width, height}
 * (decode the sample JPEGs with PIL: Image.open(p).convert("RGBA").tobytes()).
 *
 * Without the env var the suite is skipped, so CI stays green. On success
 * it writes before/after PNGs to docs/verification/face-swap/ in the repo.
 */

const VERIFY_DIR = process.env.FACE_SWAP_VERIFY_DIR ?? "";
const describeReal = VERIFY_DIR ? describe : describe.skip;

/* Minimal dependency-free PNG encoder (zlib is Node built-in). */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePng(rgba: Uint8ClampedArray, w: number, h: number): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

describeReal("face-swap pipeline (real models, real photos)", () => {
  it(
    "swaps a face and changes only the face region",
    async () => {
      const modelsDir = path.join(VERIFY_DIR, "models");
      const samplesDir = path.join(VERIFY_DIR, "samples");
      const meta = JSON.parse(fs.readFileSync(path.join(samplesDir, "meta.json"), "utf-8")) as { width: number; height: number };
      const { width, height } = meta;

      const sessions = await loadSessions({
        numThreads: 1,
        readFile: async (url: string) => {
          const name = url.includes("buffalo_l")
            ? "w600k_r50.onnx"
            : url.includes("buff2fs")
              ? "buff2fs.bin"
              : url.includes("inswapper")
                ? "inswapper_128_fp16.onnx"
                : path.basename(url);
          // The Buffer is passed straight through (no copy) to keep peak
          // memory down on the 6 GB sandbox.
          return fs.promises.readFile(path.join(modelsDir, name));
        },
      });
      // The swap session's inputs are matched by shape; log the names so a
      // mirror with different names is visible in the output.
      // eslint-disable-next-line no-console
      console.log("swap inputs:", sessions.swap.inputNames, "recog inputs:", sessions.recog.inputNames);

      const targetRgba = new Uint8ClampedArray(fs.readFileSync(path.join(samplesDir, "target.rgba")));
      const sourceRgba = new Uint8ClampedArray(fs.readFileSync(path.join(samplesDir, "source.rgba")));
      expect(targetRgba.length).toBe(width * height * 4);
      expect(sourceRgba.length).toBe(width * height * 4);

      const targetFaces = await detectFaces(sessions.detect, targetRgba, width, height);
      const sourceFaces = await detectFaces(sessions.detect, sourceRgba, width, height);
      expect(targetFaces.length).toBeGreaterThanOrEqual(1);
      expect(sourceFaces.length).toBeGreaterThanOrEqual(1);
      const targetBox = pickLargestFace(targetFaces)!;
      const sourceBox = pickLargestFace(sourceFaces)!;
      expect(targetBox.score).toBeGreaterThan(0.6);
      expect(sourceBox.score).toBeGreaterThan(0.6);

      const embedding = await embeddingForFace(sessions.recog, sourceRgba, width, height, sourceBox.landmarks);
      expect(embedding.length).toBe(512);
      let norm = 0;
      for (const v of embedding) norm += v * v;
      expect(Math.sqrt(norm)).toBeCloseTo(1, 4);

      const swapped = await runSwap(sessions, {
        targetRgba,
        targetW: width,
        targetH: height,
        targetBox,
        sourceRgba,
        sourceW: width,
        sourceH: height,
        sourceBox,
      });
      expect(swapped.length).toBe(targetRgba.length);

      // Mean absolute difference inside vs outside the target face box.
      const { x, y, w, h } = targetBox;
      let inSum = 0;
      let inCount = 0;
      let outSum = 0;
      let outCount = 0;
      for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
          const i = (py * width + px) * 4;
          let d = 0;
          for (let c = 0; c < 3; c++) d += Math.abs(swapped[i + c]! - targetRgba[i + c]!);
          d /= 3;
          if (px >= x && px < x + w && py >= y && py < y + h) {
            inSum += d;
            inCount++;
          } else {
            outSum += d;
            outCount++;
          }
        }
      }
      const inMean = inSum / Math.max(1, inCount);
      const outMean = outSum / Math.max(1, outCount);
      // eslint-disable-next-line no-console
      console.log(`face-region mean abs diff: ${inMean.toFixed(2)}, background: ${outMean.toFixed(2)}`);
      expect(inMean).toBeGreaterThan(8);
      expect(outMean).toBeLessThan(2);

      const outDir = path.resolve(__dirname, "../../../../../docs/verification/face-swap");
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, "target.png"), encodePng(targetRgba, width, height));
      fs.writeFileSync(path.join(outDir, "swapped.png"), encodePng(swapped, width, height));
      fs.writeFileSync(path.join(outDir, "source.png"), encodePng(sourceRgba, width, height));
    },
    600_000,
  );
});
