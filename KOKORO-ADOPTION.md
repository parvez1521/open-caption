# A9 — Kokoro on-device TTS: adoption gates (Phase 8, W6)

Verified 2026-11-10 in worktree `wt-p8-tts` (branch `phase8/tts`, base `main @ 377654f`).
Licence notes in this repo otherwise live as header records in the adopted module
(e.g. `features/studio/audio/denoise.ts`) and on the `/credits` page; a *failed*
adoption has no module to carry its record, so it lives here instead.
(`docs/` is gitignored in this repo — "personal notes, never published" —
so a committed note cannot live under it.)
Verdict format follows TRANSFORMATION-AUDIT §C.

## Verdict up front

**NO-SHIP. Gate 1 PASS (isolated-worker only) — Gate 2 FAIL.**

Nothing was built, no dependency was retained: after the spike, `kokoro-js` was
removed again (`apps/frontend/package.json` and `pnpm-lock.yaml` are unchanged on
this branch). Step 2 (the Voiceover surface) and the conditional OPUS-MT voice
dub were **not** built, because building them on a failed licence gate would be
shipping the gated component. The dub is deferred as *blocked*, not merely
unattempted.

| Item | Licence | Verdict |
|---|---|---|
| Kokoro-82M weights (`onnx-community/Kokoro-82M-v1.0-ONNX`) | Apache-2.0 | **SAFE** on their own |
| `kokoro-js@1.2.1` (wrapper code) | Apache-2.0 | **SAFE** on its own |
| `phonemizer@1.2.1` — kokoro-js's mandatory G2P dependency | Declared Apache-2.0; **bundles eSpeak-NG, GPL-3.0-or-later** | **AVOID — Gate 2 FAIL** (see §2) |
| `@huggingface/transformers` coexistence (repo 4.3.0 vs kokoro-js's `^3.5.1`) | Apache-2.0 | **PASS, isolated worker only** (see §1) |
| MMS-TTS | CC-BY-NC | **AVOID** — not touched, as instructed |

## §1 Gate 1 — coexistence with the repo's Transformers.js: PASS (isolated worker only)

Facts, all measured in this worktree:

- The repo pins `@huggingface/transformers` **4.3.0 exactly**
  (`apps/frontend/package.json`, verified — not `^4.3.0`).
- `kokoro-js` latest is **1.2.1** (npm registry, 2026-11-10). Its
  `@huggingface/transformers: ^3.5.1` is a regular **dependency**, not a peer
  dependency, so a package manager can nest it. `pnpm add kokoro-js@1.2.1`
  resolved it to a nested **3.8.1** under
  `node_modules/.pnpm/kokoro-js@1.2.1/node_modules/@huggingface/transformers`,
  leaving the app's own 4.3.0 in place. Both copies exist side by side.
- Load proof, separately (Node, from `apps/frontend`):
  - `import("kokoro-js")` succeeds; `new KokoroTTS({}, {})` constructs (the
    constructor only stores model + tokenizer); `tts.voices` lists **28
    voices** — `af_*` ×11, `am_*` ×9 (en-us), `bf_*` ×4, `bm_*` ×4 (en-gb).
    No other language is in the JS voice map, and `phonemize()` accepts only
    `"a" | "b"` (en-us / en-gb): the **English-first** limitation in the spec
    is real — Hindi voice `.bin` files sit in the package but the JS path
    cannot select them.
  - `import("@huggingface/transformers")` (4.3.0) succeeds alone;
    `pipeline` and `StyleTextToSpeech2Model` are functions.
- **Same-process co-import fails in Node**: importing both copies in one Node
  process dies in `dlopen` — kokoro-js's transformers 3.8.1 pulls
  `onnxruntime-node@1.21.0` whose binding requires `VERS_1.21.0`, but the
  shared library already loaded is 1.30.0's (from transformers 4.3.0).
  This is a *native-runtime* clash; the browser path uses onnxruntime-web
  (WASM), not the native binding.
- **Browser-bundle proof**: an esbuild bundle (`--platform=browser`,
  entry importing `pipeline`/`StyleTextToSpeech2Model` from 4.3.0 **and**
  `KokoroTTS` from kokoro-js) **builds successfully** — 6,304,650 bytes,
  and the metafile shows *both* `transformers.web.js` copies (4.3.0 and
  3.8.1), *both* onnxruntime-web builds (1.31.0-dev for v4, 1.22.0-dev for
  v3), plus `phonemizer` and `kokoro-js`. Coexistence in the browser is
  therefore real but **duplicated**: two full inference runtimes.

Conclusion: Gate 1 passes **only** under the isolated-worker pattern the spec
allows (Kokoro in its own worker with its own bundled transformers 3.8.1,
never sharing a runtime or a Node process with the 4.3.0 Whisper/text
workers). The cost would have been ~6 MB of extra bundled runtime in that
worker. This gate is not the blocker.

## §2 Gate 2 — eSpeak-NG scoping: FAIL

The question was whether the phonemizer path is *data / reimplemented logic*
or *bundled GPL code*. It is bundled GPL code, executed on every synthesis:

Evidence (published tarballs `kokoro-js-1.2.1.tgz` and `phonemizer-1.2.1.tgz`,
inspected 2026-11-10):

1. `phonemizer@1.2.1`'s README first line: *"Simple text to phones converter
   **using eSpeak NG**."* Its package contains **no source, no data-only
   dictionary, and no JS reimplementation** — `files` is only `dist`,
   `types`, `README.md`, `LICENSE`.
2. `dist/phonemizer.js` (1,322,380 bytes, the file the `default` export
   loads) is an **Emscripten build of eSpeak-NG itself**:
   - it embeds a WASM binary (`wasmBinary` present in the bundle);
   - it embeds the data package `espeakng.worker.data` and creates the
     `/usr/share/espeak-ng-data` file tree (lang/voices/…) in the
     Emscripten FS at startup;
   - it exposes the compiled C API bindings — `_emscripten_bind_eSpeakNGWorker_*`
     (`synth`, `synth_ipa`, `set_voice`, `get_voices`, …) and the
     `espeak_VOICE` / `espeak_EVENT` bindings;
   - its type declarations include `espeakng.worker.d.ts`.
3. It is not an optional path: `kokoro-js`'s `dist/kokoro.js` imports
   `phonemize` from `phonemizer`, and `KokoroTTS.generate()` /
   `stream()` call it for **every** text input (en-us → `en-us`, en-gb →
   `en`) before tokenisation. There is no English path through kokoro-js
   that avoids eSpeak-NG. (`generate_from_ids()` skips it, but then the
   caller must supply phoneme ids — i.e. supply their own G2P, which is a
   different, unadopted component.)
4. Upstream eSpeak-NG is **GPL-3.0-or-later** (its README/COPYING:
   "released under the GPL version 3 or later license").
5. The scoping cannot be made clean from the packages as published:
   - `phonemizer`'s own `LICENSE` file is the Apache-2.0 text and its
     package.json declares `license: Apache-2.0`. An Apache-2.0 file in
     the wrapper package **cannot relicense the upstream GPL-3.0 C code
     compiled into its dist**, and the tarball contains **no GPL text, no
     eSpeak-NG copyright notice, and no source offer** for the compiled
     component.
   - Serving this bundle to a browser is conveying the WASM to every
     visitor — the same basis on which this programme already ruled
     `@ffmpeg/core` **AVOID** in TRANSFORMATION-AUDIT §C.2 ("Serving WASM
     = GPL conveyance → source-offer duty") for this closed commercial
     product.

Conclusion: **Gate 2 FAILS.** Shipping A9 via kokoro-js would ship
GPL-3.0 eSpeak-NG code in a way this note cannot scope cleanly. This is an
engineering record, not legal advice; reversing it is an owner/legal
decision (e.g. accepting GPL compliance for the eSpeak component with a
real source offer), or an engineering change of G2P (a permissively
licensed phonemizer, e.g. a CMUdict-based one, feeding
`generate_from_ids()` — a new adoption with its own gate, not this one).

## §3 Model-size correction (recorded for any future attempt)

The spec's "~86 MB q8" conflates two files. From the HF API for
`onnx-community/Kokoro-82M-v1.0-ONNX` (license: apache-2.0), and
transformers 3.8.1's dtype map (`q8` → `_quantized` suffix):

- dtype `q8` → `onnx/model_quantized.onnx` = **92,361,116 bytes (~92.4 MB)**;
- the ~86 MB file is `onnx/model_q8f16.onnx` (86,033,585 bytes), a different
  dtype (`q8f16`, mixed precision);
- plus one voice file per selected voice, fetched separately by kokoro-js
  from the same repo: **522,240 bytes** each; tokenizer ≈ 3.6 KB.

An honest pre-download disclosure for a `q8` build would therefore have
been **"about 93 MB"**, not 86 MB. No disclosure UI shipped (no-ship).

## §4 What was NOT done, deliberately

- No Voiceover panel/worker, no `saveAsset` handoff, no tests for them:
  they would exist only to call the gated library.
- The conditional OPUS-MT → Kokoro voice-replacement dub is **deferred as
  blocked by Gate 2**, with the same labelling requirement standing if it
  is ever revived ("AI voice dub — synthetic voice, no lip sync").
- Synthesis quality / voice sound were never evaluated and are not claimed
  anywhere; that remains an owner's-device question for a future,
  licence-clean path.
