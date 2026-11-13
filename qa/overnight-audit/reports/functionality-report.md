# Functionality report — Captionit overnight QA

Branch: `qa/captionit-full-audit-fixes` (base b32c36a). Tested 2026-11-14 ~03:00–07:45 IST.
Method: local dev server (port 3100) + headless Chromium via CDP + Node Whisper
reference + live-site curl (W1). Full matrix: `planning/test-matrix.csv` (60 cases).

## Counts (60 cases)
- Pass: 16 — Fail: 1 — Known-open: 1 — Partial: 21 — Partial-blocked: 1 —
  Partial-env: 2 — Blocked-env: 6 — Not run: 12

## What works (verified in the running app)
- **Transcribe page**: loads as guest; all 14 languages in the chooser; Transcribe
  disabled with no file (M56). Boundary files handled honestly, no crashes:
  zero bytes → "This file is empty." (M12); unsupported → "We couldn't read this
  file. It may be damaged or in a format this browser can't open." (M11);
  no-audio video → "This file has no audio track to transcribe." (M09);
  60 MB file → "This file is over the 50 MB limit for this tool." (M44).
  Truncated file probes a 0:03 duration and enables Transcribe (M10).
- **Studio caption editing (M16 PASS)**: SRT import of 26 real Hinglish words →
  click a word → inline editor under the card with all 5 actions; single-word
  card accepts space + 2nd word ("jaati." → "jaati. test"). The 2026-11-14
  single-word fix is verified in the running app.
- **Shift-all (M27 PASS)**: +0.5s moves the first card 0:00.2 → 0:00.7.
- **Undo/redo (M28 PASS)**: edit → undo reverts → redo re-applies.
- **Guest flow (M37 PASS)**: /start creates a project, Studio opens, sidebar
  shows "Guest session". **Protected routes (M40 PASS)**: logged-out /dashboard →
  /login?redirect=%2Fdashboard, no data.
- **Auth boundaries (M52–M54 PASS, live curl)**: billing/me, projects,
  growth/connections all 401 unauthenticated, no data.
- **Security headers (M50 PASS, live curl)**: all 6 headers on all 39 pages + aux
  + API 401s (44 responses, 0 missing).
- **Viewports (M45 PASS)**: no horizontal scroll at 1440/1280/768/390/360 on
  /, /transcribe, /pricing, /motion.
- **Secondary tools load**: Motion (46 templates), AI Clipper (editorial-score
  labelling honest), Analyzer, Teleprompter, Creator Studio, Growth
  (YouTube + Instagram honestly "Not switched on" in this env).

## Transcription accuracy — measured with the app's real models (Node reference)
- Fine-tuned Hinglish model (ishaan-g/whisper-hinglish-swift_timestamped @ eb0fe25c,
  the exact pinned model + revision, q8, cache-only): strict word-match 68–77%
  across v01/v02/v03/v05/v06/v08/v13 (e.g. v02 20/26, v05 13/18).
  Counting the model's valid romanisation variants (`nahin` for `nahi`, `par`
  for `pe`) the range is ~88–92%. Systematic confusions: `reel` → `re`/`real`,
  `captions` → `options`/`cabsions`, `aadhe` → `aage`, "Step one/two" dropped in v03.
  Music and noise do NOT degrade it (v06/v08 same 13/18 as clean v05).
- Stock base with `en` token mangles Hinglish (v01 1/8, v02 5/26) — expected;
  that is why the app uses the fine-tune. English sample v04 → "hyperbolic"
  (reference words unverified — unmeasured).
- Silence (v07): BOTH models emit one hallucinated word ("you"). Whether the
  app's VAD/timing path suppresses it in-browser is untested (model download
  blocked locally).
- v03 note: the MANIFEST reference appears incomplete — the model returned 64
  words including sentences not in the reference, so v03's 34/50 is not a clean
  measure.
- The homepage "95% Hinglish caption accurate" is the owner's marketing claim,
  framed as a claim (not a benchmark). The measured strict range (68–77%) and
  lenient range (~88–92%) are below 95% — see the recommendation in the final
  report; the claim wording itself was not changed.
- In-browser transcription end-to-end could NOT run locally (Chromium cannot
  reach Hugging Face). Node results test the model, not the browser worker path.

## What fails / is blocked
- **M19 FAIL — look previews do not animate** (BUG-009, owner-reported). 150
  preview boxes render; page holds 1 canvas total (the stage). Only 29/150 show
  a poster still. Fix exists on `feature/caption-template-previews-2026-11-14`
  @ 699b259 — not on this branch, deploy is the owner's call.
- **M43 KNOWN-OPEN — Cashfree checkout** fails live with generic "Something went
  wrong" (recorded 2026-11-14 ~01:04 IST). Fix on its own branch; not re-tested here.
- **Exports (M21–M25) BLOCKED-env**: export is guest-gated by design ("Create a
  free account to export" → sign-in). Email signup via Supabase API rejected
  test domains (400); Google is the only account path and needs the owner.
  The gate itself was verified working (screenshot `evidence/screenshots/export-gate.png`).
- **Emphasis (M18) BLOCKED-env**: "No AI route is available... free AI is not
  configured" (Groq key lives in Vercel, not local env). Honest message.
- **In-browser transcription (M01–M08, M13–M14, M07) PARTIAL**: upload + probe
  work; the run stops at model download (HF unreachable from local Chromium).
  Model-download failure now shows a friendly message (BUG-008, fixed).
- **Not run (12)**: M17 timing visual, M20 apply look (needs M19), M30 add to
  project, M36 coach (no growth data), M41 logout, M51 cookies, M55 webhook
  bad sig, M57 refresh mid-process, M58 double submit, M59/M60 long/unicode
  filenames, M26 edge-resize drag (regression tests merged; live probe open).

## Bugs found (11) — see `bugs/BUG-*.md`
- Fixed on this branch (4): BUG-007 (Loader duplicate key), BUG-008 (raw fetch
  error on model-download failure), BUG-010 (homepage axe: chips aria-pressed,
  claim aria-label), BUG-011 (Studio axe: landmarks, h1, timeline handles,
  trim sliders, tablist).
- Confirmed, fix on another branch (2): BUG-009 (look previews), Cashfree
  checkout (M43, no bug file — known open).
- Code-confirmed, not fixed (5): BUG-001/002 (upload limits client-side only),
  BUG-004 (device approve), BUG-005 (DB error text leak), BUG-006 (cron
  bearer). BUG-003 excluded by owner decision (known suspect S1).
