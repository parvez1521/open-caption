# Test coverage report — Captionit overnight QA

## Matrix (60 cases, `planning/test-matrix.csv`)
- Pass: 16 — Fail: 1 — Known-open: 1 — Partial: 21 — Partial-blocked: 1 —
  Partial-env: 2 — Blocked-env: 6 — Not run: 12
- Best-covered areas: transcribe boundary validation (M09–M12, M44, M56 pass),
  Studio caption editing (M16, M27, M28 pass), auth boundaries (M37, M40, M52–M54),
  headers (M50), viewports (M45), homepage (M46).
- Weakest coverage: exports (M21–M25 blocked-env, guest-gated), in-browser
  transcription end-to-end (model download blocked locally), emphasis (Groq),
  edge cases M57–M60 (refresh/double-submit/filenames — not run).

## Unit tests (repo suite)
- Baseline (branch base b32c36a, before fixes): **2152/2152 passed (192 files)**,
  typecheck rc=0, production build rc=0.
- New tests added in this mission (3):
  - `components/home/__tests__/loader.test.tsx` (BUG-007; fails pre-fix, passes post-fix)
  - `features/transcribe/__tests__/standalone-run.test.ts` +2 tests (BUG-008;
    the fetch-failure test fails pre-fix, 8/8 pass post-fix)
  - BUG-010/011 verified by axe re-runs in CDP (no new unit tests; static-markup
    rules are best verified by the axe runs themselves).
- Final full-suite regression: see `fixes/regression-results.md` (runs after the
  report drafts; numbers recorded there).

## Node Whisper reference (accuracy measurement, not the browser path)
- Stock base (q8): 9/10 files ok (v09 ffmpeg-failed, no audio stream — expected).
- Fine-tuned Hinglish model (pinned revision, downloaded free via shell proxy):
  8 files ok. Per-file JSON + summaries in `evidence/node-transcribe/{base,hinglish}/`.
- The browser worker path (WebGPU/WASM, worker chunking, VAD/packing, refineWordTimings)
  is NOT covered by the Node reference — that gap is why M01–M08/M13 stay partial.

## CDP probes (all under `tests/e2e/`, evidence under `evidence/`)
- Home + viewports, transcribe (boundary + flow + over-limit + no-audio),
  Studio phases 1–6 (project create, upload, SRT import, inline edit, looks count,
  exports gate, undo/redo, shift-all, play, axe), secondary tools + auth + billing,
  viewports + axe, axe detail/verify runs, proxy-reach test, setFileInputFiles debug.
- Screenshots: looks-panel, studio-stage, studio-playing, export-gate, transcribe-390.
- Lighthouse JSON: home, pricing, transcribe.

## What was NOT tested (honest list)
- Real-device behaviour: touch drag (HeroCylinder, timeline), phone Add to Home
  Screen (PWA), Mac Chrome transparent WebM, video picture playback beyond the
  first frame (play() blocked in headless).
- Live production browser flows (no Chromium here can reach external sites):
  GIS chooser wording live, INR pricing render (needs IN egress), Cashfree
  webhook re-test, Instagram/YouTube connects (owner's passkey/sign-in).
- Paid features: none exist to test (zero-cost product); Cashfree production
  switch untouched.
- M57–M60 (refresh mid-process, double submit, long/unicode filenames).
