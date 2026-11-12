import { env } from "@huggingface/transformers";

/**
 * OC-003: point Transformers.js at the ONNX Runtime Web WASM files bundled
 * with the app instead of the jsDelivr CDN default.
 *
 * Why: @huggingface/transformers (v4.3.0) sets `env.backends.onnx.wasm.wasmPaths`
 * to `https://cdn.jsdelivr.net/npm/onnxruntime-web@<version>/dist/` when the app
 * never sets it — and this app never did. The .mjs factory is then loaded by
 * dynamic import (script-src) and the .wasm binary by fetch (connect-src);
 * neither cdn.jsdelivr.net origin is in the Content-Security-Policy, so the
 * WASM backend failed to initialise in the tested browser ("WASM preloading
 * failed" in the external audit) on every device that falls back from WebGPU
 * to WASM. The CSP comment previously claimed the WASM was "bundled"; the
 * build does emit the .wasm files as `/_next/static/media/` assets (via
 * onnxruntime-web's own `new URL(..., import.meta.url)` references), but
 * nothing ever pointed Transformers.js at them.
 *
 * Fix: resolve the same files with static `new URL()` asset references (one
 * per build flavour — a template literal would make the bundler treat the
 * request as a glob) and hand those URLs to `wasmPaths` before the first
 * `pipeline()` call. Both loads are then same-origin: the .mjs import is
 * covered by script-src 'self', the .wasm fetch by connect-src 'self'. No
 * CSP origin is added. The paths are relative into node_modules because
 * onnxruntime-web's package exports map does not expose `./dist/*` to bare
 * specifiers; the files are the installed onnxruntime-web dist files, so
 * they track the pinned dependency version.
 *
 * `useWasmCache = false`: Transformers.js' default pre-load fetches the .mjs
 * and re-imports it from a blob: URL in non-Chrome browsers, which CSP
 * script-src 'self' would block (blob: is not allowlisted). With the cache
 * off, ORT imports the .mjs directly from its same-origin URL and fetches
 * the .wasm itself; the files are immutable `/_next/static/*` assets, so the
 * browser HTTP cache covers repeat visits without the Cache API.
 *
 * Suffix rule mirrors Transformers.js' own default (transformers.js
 * `isSafariBelow26`): Safari below 26 without WebGPU gets the plain
 * (non-asyncify) build; everything else gets `.asyncify`.
 */
export function onnxWasmSuffix(userAgent: string, vendor: string, hasWebGpu: boolean): "" | ".asyncify" {
  const isSafari =
    vendor.indexOf("Apple") > -1 &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|mercury|brave/i.test(userAgent) &&
    !userAgent.includes("Chrome") &&
    !userAgent.includes("Android");
  if (!isSafari) return ".asyncify";
  const match = userAgent.match(/Version\/(\d+)/);
  const below26 = match ? parseInt(match[1]!, 10) < 26 : false;
  return below26 && !hasWebGpu ? "" : ".asyncify";
}

export function useBundledOnnxWasm(): void {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const suffix = onnxWasmSuffix(nav?.userAgent ?? "", nav?.vendor ?? "", !!nav && "gpu" in nav);
  env.useWasmCache = false;
  // Static strings only: the bundler must resolve each `new URL()` at build time.
  const mjs =
    suffix === ".asyncify"
      ? new URL("../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs", import.meta.url).href
      : new URL("../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs", import.meta.url).href;
  const wasm =
    suffix === ".asyncify"
      ? new URL("../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm", import.meta.url).href
      : new URL("../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm", import.meta.url).href;
  env.backends.onnx.wasm!.wasmPaths = { mjs, wasm };
}
