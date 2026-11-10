# A11 — Background removal (Cutout) spike: evaluation

**Workstream:** Phase 8, W8 (Addition A11 from `research/captions-ai-analysis.md` §A11).
**Date:** 2026-11-10. **Evaluator:** spike agent, sandbox VM (see Measurements for the machine).
**Verdict: NO-GO — recorded non-goal, alongside chroma key. No feature code shipped.**
Licence passes cleanly and the parity-safe design holds; the spike fails on the
device-cost gate, under the programme rule stated in §A11 and in this spike's brief:
*if device cost cannot be evidenced as acceptable for a mid-range phone, the
successful outcome is a recorded non-goal — not a shipped feature with silent jank.*

---

## 1. Licence evidence — PASS

### 1.1 The exact model file we would ship

- **Model:** MediaPipe Selfie Segmentation, general (square) variant — the model
  Google's Image Segmenter task page recommends for "replacing or modifying the
  background in an image"; outputs two categories, 0 = background, 1 = person.
- **File:** `selfie_segmenter.tflite`, float16, version `1`, from Google's official
  model bucket:
  `https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite`
- **Measured at download (2026-11-10):** 249,537 bytes; SHA-256
  `191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b`.
  (The landscape variant, `selfie_segmenter_landscape.tflite` float16/1, is
  250,177 bytes, SHA-256 `490e9ea734313e0de10fa0cd9e3c6133e36ea4db2b7a49bde9ef019f72796b8e`;
  same model card. It is shaped for landscape video calls — 144×256 input — and
  is the wrong shape for this product's vertical-first clips, so the square
  model is the candidate.)

### 1.2 Per-model licence — evidenced, not assumed

- **Authoritative source:** the model's own model card, hosted by Google:
  *Model Card — MediaPipe Selfie Segmentation*,
  `https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Selfie%20Segmentation.pdf`
  (this is the "info" / model-card link the official task page attaches to the
  SelfieSegmenter rows of its Models table).
- **What it says, verbatim in substance:** a "LICENSED UNDER" column stating
  **"Apache License, Version 2.0"**; authors Tingbo Hou, Siargey Pisarchyk and
  Karthik Raveendran (Google); dated May 6, 2021; model size 249 KB for general
  inputs (matching the downloaded file's 249,537 bytes); input 256×256×3 RGB in
  [0, 1]; output a person mask in [0, 1]; average person IoU 96.48% (general
  model) on its evaluation set.
- **Cross-checks:** the official task page
  (`https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter`,
  page footer "Last updated 2026-11-04 UTC") lists this exact model for this
  exact use. No non-commercial, research-only, or attribution-beyond-Apache
  clause appears anywhere on the card. **The per-model gate A11 demanded is
  satisfied for THIS file.**

### 1.3 Runtime licence — `@mediapipe/tasks-vision` + its WASM assets

- **Checked in the published npm tarballs themselves** (registry.npmjs.org),
  two versions, 2026-11-10:
  - `@mediapipe/tasks-vision@0.10.14`: `package.json` SPDX field
    `"license": "Apache-2.0"`; bundle/type sources carry Apache-2.0 headers
    ("Copyright 2022 The MediaPipe Authors. Licensed under the Apache License,
    Version 2.0").
  - `@mediapipe/tasks-vision@1.2.2` (current latest): same SPDX
    `"license": "Apache-2.0"`.
- **Recorded wrinkle:** neither tarball contains a standalone `LICENSE` file.
  The licence is evidenced by the SPDX field plus the in-source Apache headers
  — sufficient for adoption, but the adoption note (had we shipped) must say
  exactly this, and we would ship the Apache-2.0 text ourselves in the credits
  surface, as with other adopted packages.
- **WASM footprint (part of the download the user would pay):**
  `vision_wasm_internal.wasm` is 9,423,986 bytes in 0.10.14 (SIMD build;
  the no-SIMD fallback is 9,294,247 bytes) and 14,603,354 bytes in 1.2.2.
  Plus the model itself (0.25 MB). First-use download ≈ **9.7 MB (0.10.14) to
  14.9 MB (1.2.2)** — disclosable in-product under the existing Whisper/RNNoise
  download-size pattern; not a blocker.

**Licence conclusion: SAFE on both the model file and the runtime.** This gate
is not the reason for the verdict.

---

## 2. Design — parity by construction HOLDS

The only shippable shape is the derived-asset pattern already proven twice in
this codebase: reverse conforms (`features/studio/segmentAssets.ts`) and the
A12 RNNoise derived WAV (`features/studio/audio/denoise.ts`). Segmentation
would **never** run live in preview or in export. Concretely, against the
existing code:

1. **Where the conform runs.** A new sibling module
   `features/studio/backgroundReplace.ts`, dynamically imported from a
   `StudioPage` segment action exactly like `reverseSelectedSegment` (dynamic
   `import("./segmentAssets")`, per-segment progress state, honest error
   surface). Inside: Mediabunny `Input`/`VideoSampleSink` decode of the source
   blob (the same stack and windowing discipline as `reverseVideoBlob`), and
   per decoded frame, in source order:
   draw frame to a canvas at display size → `ImageSegmenter` in `VIDEO`
   running mode, `segmentForVideo(canvas, timestampMs)`,
   `outputConfidenceMasks: true` → composite on a second canvas: replacement
   background first (solid fill; own-image cover-fit; or a blurred copy of the
   frame produced by downscale→upscale, avoiding `ctx.filter` whose support
   is uneven), then the frame drawn through the confidence mask as alpha →
   hand the composited canvas to the output's video track (Mediabunny
   canvas/sample source, `codec: "avc"`, `QUALITY_HIGH` — the same encoder
   settings as the reverse conform) into an in-memory `BufferTarget` MP4.
2. **Audio.** Passed through **unchanged in content**: the source's audio
   track is walked in order with `AudioSampleSink` and re-encoded via
   `AudioBufferSource` (AAC 128 kbps) — i.e. the reverse conform's audio path
   minus `reverseChannelData`. A source with no audio track yields a silent
   derived asset, exactly as reverse does today. Captions/timings are
   untouched: the derived file is frame- and duration-identical to the source,
   so **no range remap is needed** (unlike reverse's `remapRangeToReversed`).
3. **How the output is stored and referenced.** On success only:
   `storeSegmentAsset({ kind: "video", name: "Background replaced — <source>",
   … })` writes the MP4 to the same IndexedDB media bin (`saveAsset`,
   mediaStore) as every derived asset; a composition op mirroring
   `applyReversedSegment` swaps the segment's `assetId` to the derived record
   in **one undo step** via `commitComposition`. From that moment the segment
   *is* the derived file for every consumer — StudioPlayer preview and the
   export renderer resolve the same `assetId` to the same bytes, which is
   what "preview ≡ export by construction" means here. `derivedCache.ts`
   (slice 8.2) would register a fourth derived kind (`background-replaced`,
   name prefix `Background replaced — `) so cleanup protects referenced
   copies and can reclaim unreferenced ones, same as reversed/freeze/
   noise-suppressed today.
4. **Failure shape.** All-or-nothing, like `reverseVideoBlob`: the output
   lives in a `BufferTarget` until `finalize()`; any throw cancels the output,
   stores nothing, and leaves the composition untouched.
5. **Delivery of model + runtime.** Self-hosted under `public/` (model
   249,537 B + the pinned tasks-vision WASM), loaded lazily only when the
   action is invoked, size disclosed before first download — the product's
   on-device honesty rules rule out a CDN fileset.

**Where the pattern strains (recorded, none fatal to parity):**

- *Memory.* Reverse buffers decoded samples one bounded window at a time; a
  segmentation conform additionally holds full-resolution RGBA canvases and
  mask buffers per frame — one 1080p RGBA frame is 8.29 MB, and several are
  live simultaneously. On a phone this is an OOM risk; it surfaces as a thrown
  error (no partial asset), but it is a real device-cost pressure, counted in §3.
- *No resume.* The `VIDEO`-mode segmenter is stateful over monotonic
  timestamps, so the conform is strictly sequential and a mid-conform failure
  restarts from zero — the same property reverse already has.
- *No silent downscale shortcut.* Conforming at reduced resolution would keep
  parity (both sides consume the same asset) but would silently lower that
  segment's export resolution relative to its siblings. The design therefore
  conforms at full source resolution — and pays the cost measured in §3.

**Design conclusion: the derived-asset pattern holds for segmentation.**
Parity is not the blocker either.

---

## 3. Measurements — the hard gate

### 3.1 Method (what was actually run, 2026-11-10)

- **Machine:** this sandbox VM — AMD EPYC 9D25 (server-class), ~1.5 shared
  vCPU allocation (throttled, noisy neighbours: note the wide min–max spreads),
  6 GB RAM. **This is desktop/server-class hardware, not a phone.**
- **Stack measured:** the native MediaPipe Tasks runtime (Python `mediapipe`
  1.2.2, CPU delegate / XNNPack) running the **exact** `selfie_segmenter.tflite`
  file of §1.1 (SHA-256 above), `ImageSegmenter` in `IMAGE` mode,
  `output_category_mask: true`. Per-frame `segment()` time therefore includes
  full-frame ingest, resize to 256×256, inference, and mask production at
  frame size — the same pipeline stages a browser conform would pay, minus
  canvas compositing and encode (counted separately below).
- **Fixtures:** (a) synthetic frames (gradient + filled ellipse "person");
  (b) Google's own test photo from the model bucket
  (`segmentation_input_rotation0.jpg`, 257×257) resized to 720p/1080p.
  Dense 256×256 inference FLOPs are content-independent, so timing transfers
  between fixtures — and it did (below). Mask *validity* does not transfer,
  which is why both fixtures were run.

### 3.2 Results

Native `segment()`, median of n=50 after 3 warm-up calls (real photo):

| Frame size | Median | Mean | Min | Max | Person fraction of mask |
|---|---|---|---|---|---|
| 257×257 (native photo) | 7.6 ms | 8.2 ms | 7.0 ms | 24.8 ms | 0.426 |
| 1280×720 | 23.7 ms | 42.1 ms | 18.6 ms | 76.8 ms | 0.442 |
| 1920×1080 | 94.3 ms | 88.5 ms | 34.7 ms | 121.7 ms | 0.454 |

Synthetic frames (n=50) agree: 7.0 ms (256²), 21.9 ms (720p), 91.9 ms (1080p).
Sustained burst, 200 consecutive 720p frames: first-50 median 24.4 ms,
last-50 median 22.8 ms — no drift over 200 frames **on this VM** (a short
burst on a fan-cooled server CPU says nothing about phone thermals).
Runtime + model creation: 373 ms. Model input is fixed at 256×256, so the
growth from 720p→1080p is the full-resolution handling around the inference
(ingest + mask at frame size) — in a browser that full-res per-pixel work
still exists, split between WASM and canvas.

**Validity checks.** The real photo segments consistently (~0.43–0.45 person
fraction at every size). The flat-colour synthetic "person" is *not*
recognised (max person probability 0.11 anywhere) — recorded so nobody
mistakes the synthetic timing fixture for a quality result.

**Browser/WASM attempt — not measured.** `@mediapipe/tasks-vision@0.10.14`
in Node 24 loads its fileset but `ImageSegmenter.createFromOptions` fails
with `document is not defined` (the web bundle converts images through DOM
canvas), and this sandbox has no browser binary. **No browser or WASM timing
is claimed anywhere in this document.** The general expectation that WASM
inference runs slower than the native XNNPack path measured above is stated
as an expectation, not a measurement.

### 3.3 What this means for a 30 s clip (extrapolation, labelled)

Pure `segment()` time only, at the measured medians — **before** Mediabunny
decode, canvas compositing, and AVC encode, which the conform also pays for
every frame (reverse conforms pay decode+encode too, but no per-frame
inference or compositing):

| Clip | Frames | Segment-only time (native, this VM) |
|---|---|---|
| 30 s @ 30 fps, 720p | 900 | ≈ 20 s |
| 30 s @ 24 fps, 1080p | 720 | ≈ 66 s |
| 30 s @ 30 fps, 1080p | 900 | ≈ 84 s |

Every multiplier still to apply points the wrong way: browser WASM instead of
native XNNPack; a mid-range phone CPU instead of a server EPYC core; a
900-frame sustained burst under phone thermal limits; plus decode/composite/
encode. An honest extrapolation for a mid-range phone at 1080p is **multiple
minutes of conform per 30 s clip**, with material OOM risk from §2's frame
buffers. At 720p the native segment-only figure (~20 s) is plausibly
tolerable on a flagship — and unevidenced on a mid-range phone.

### 3.4 The only phone evidence available — and why it doesn't carry the gate

Google's own task page (§1.2) publishes whole-pipeline latency for this model
on **Pixel 6: 33.46 ms CPU / 35.15 ms GPU**. That is a 2021 *flagship-tier*
SoC, the *native* runtime, an average (not a sustained 900-frame burst), and
not a browser. It corroborates the order of magnitude; it does not evidence a
mid-range phone running our browser stack, which is the claim shipping would
make.

### 3.5 What this sandbox cannot measure (stated plainly)

- A mid-range phone's per-frame throughput in a mobile browser (WASM SIMD /
  WebGL delegate behaviour varies by device and browser).
- Sustained throughput and thermal throttling over a full-clip burst.
- Mobile memory pressure / tab-kill behaviour with 1080p frame buffers.
- Mobile Safari anything.

---

## 4. Verdict and reasoning

**NO-GO. Background removal joins chroma key as a declared non-goal for this
programme. No feature code is shipped from this spike.**

Reasoning, gate by gate:

1. **Licence: PASS.** The exact model file is Apache-2.0 on its own Google
   model card (§1.2); the runtime is Apache-2.0 by SPDX in its published
   tarballs (§1.3). If cost ever passes, no licence work remains except
   shipping the Apache text and crediting the model in the credits surface.
2. **Parity design: PASS.** The derived-asset conform is constructible
   against `segmentAssets.ts`/`denoise.ts` precedent with no parity hole
   (§2). Preview ≡ export was never the risk.
3. **Device cost: FAIL — by the programme's own rule.** Shipping requires
   device cost *evidenced as acceptable on a mid-range phone*. The evidence
   that exists points the other way at the resolution users actually shoot:
   ~84 s of pure segmentation per 30 s of 1080p on desktop-class native
   hardware, before decode/composite/encode, before WASM, before a phone
   CPU, before thermals. The only phone number anyone publishes is a
   flagship's native average. "Probably fine" is not evidence, and a
   minutes-long, possibly OOM-killed conform discovered by users on their
   own phones is exactly the silent-jank outcome §A11's gate exists to
   prevent.

Quality would additionally have needed in-product limits even on a pass —
the model card itself lists them: thin features (fingers, hair edges) may be
missed, masks are "not pixel perfect", quality degrades with fast motion,
noise and low light, and people far from camera (>~4 m) or at multiple scales
are out of scope.

## 5. What would change the verdict

Any **one** of these, re-run through this same evaluation:

1. **Real mid-phone browser evidence:** a tasks-vision (WASM/WebGL) conform
   of a real 30 s 1080p clip on a genuinely mid-range phone (Snapdragon
   6/7-series or Dimensity 700-class), sustained end-to-end — decode +
   segment + composite + encode — completing within a pre-committed budget
   (suggested: ≤ ~2× clip duration) without tab kills. The owner's on-device
   pass is the natural source of this evidence.
2. **A materially cheaper licence-clean stack:** e.g. a tasks-vision WebGPU
   delegate that is broadly available and measurably fast enough on the same
   mid-phone test, or a smaller/faster Apache-2.0 (or equally permissive)
   segmentation model whose per-model card re-passes §1.
3. **A product decision to cap the feature** (e.g. clips ≤ 720p, stated
   in-product as a conform-resolution cap) **together with** mid-phone
   evidence at that cap under test 1. A silent cap changes nothing.
4. **Platform shift:** broadly shipped browser/OS background-segmentation
   APIs that move the per-frame cost off our WASM budget entirely.

Until then: **non-goal, reason recorded.** Revisit only with new evidence,
not with a preview-only prototype — a preview-only version is the one shape
this programme has repeatedly refused to ship.
