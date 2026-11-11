// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

/**
 * OC-003: the Transformers.js workers must point ONNX Runtime Web at the
 * WASM files bundled with the app (same-origin `/_next/static/media/`
 * assets) instead of the jsDelivr CDN default, and must disable the WASM
 * cache (its blob:-URL factory import would be blocked by CSP script-src).
 * The suffix rule mirrors Transformers.js' own Safari<26 default.
 */

const { wasmState } = vi.hoisted(() => ({ wasmState: {} as { wasmPaths?: { mjs: string; wasm: string } } }));
vi.mock("@huggingface/transformers", () => ({
  env: {
    allowLocalModels: true,
    useWasmCache: true,
    backends: { onnx: { wasm: wasmState } },
  },
}));

import { onnxWasmSuffix, useBundledOnnxWasm } from "../onnxWasm";
import { env } from "@huggingface/transformers";

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const SAFARI_17_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const SAFARI_26_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";

describe("onnxWasmSuffix", () => {
  it("uses .asyncify everywhere except Safari < 26 without WebGPU", () => {
    expect(onnxWasmSuffix(CHROME_UA, "Google Inc.", true)).toBe(".asyncify");
    expect(onnxWasmSuffix(SAFARI_17_UA, "Apple Computer, Inc.", true)).toBe(".asyncify");
    expect(onnxWasmSuffix(SAFARI_17_UA, "Apple Computer, Inc.", false)).toBe("");
    expect(onnxWasmSuffix(SAFARI_26_UA, "Apple Computer, Inc.", false)).toBe(".asyncify");
  });
});

describe("useBundledOnnxWasm", () => {
  it("sets same-origin bundled wasmPaths and disables the WASM cache", () => {
    useBundledOnnxWasm();
    expect(env.useWasmCache).toBe(false);
    const paths = (env.backends.onnx.wasm as unknown as typeof wasmState).wasmPaths!;
    expect(paths.mjs).toContain("onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs");
    expect(paths.wasm).toContain("onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm");
    expect(paths.mjs).not.toContain("jsdelivr");
    expect(paths.wasm).not.toContain("jsdelivr");
    expect(paths.mjs).not.toContain("https://");
  });
});
