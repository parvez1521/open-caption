# Morning handoff — Captionit overnight QA

**Date:** 2026-11-14 (mission 01:53–~08:00 IST, owner away overnight)
**Branch:** `qa/captionit-full-audit-fixes` (base origin/main @ b32c36a)
**NO deploy, NO merge.** Everything below is on the branch, for your review.

## Executive summary
The product is in good shape for a guest-first free tool. The core loop works,
and the 2026-11-14 caption fixes are verified in the running app. Two things
stand between this branch and a clean bill, and both already have fixes on
their own branches: look previews (699b259) and Cashfree checkout (error-surface
branch). Four small bugs were found and fixed on this branch, all verified.

## Counts
- Discovery: 39 pages, 60 API routes, 150 looks, 46 motion templates,
  14 languages, 30 features, 7 journeys.
- Test matrix (60 cases): **16 pass, 21 partial, 1 partial-blocked, 1 fail,
  1 known-open, 6 blocked-env, 2 partial-env, 12 not run.**
- Bugs: 11 filed (BUG-001…011). **Fixed on this branch: 4** (007, 008, 010, 011).
  Fix exists on another branch: 2 (009 previews, Cashfree checkout).
  Not fixed (recommendations / owner decision): 5 (001, 002, 004, 005, 006;
  003 excluded by your earlier decision).
- Unit tests: baseline 2152/2152 → final **2155/2155** (193 files) after the
  mission's 3 new tests; typecheck rc=0; production build rc=0.
  (First final run caught 2 edge-resize test failures caused by the BUG-011
  handle change — the tests located handles by `aria-label`; updated to query
  by the new `title` attribute, same assertions, 2/2 pass again.)

## Critical findings
1. **Look previews don't animate (BUG-009, P2 — your report).** 150 boxes, 1
   canvas on the page, 29 posters. Fix exists on
   `feature/caption-template-previews-2026-11-14` @ 699b259. Deploy is your call.
2. **Cashfree checkout fails live (M43, known-open).** Generic "Something went
   wrong" on all 3 plans. Error-surface fix exists on its branch; after it
   deploys, re-run the sandbox test to read the real Cashfree error.
3. **Hinglish accuracy is real but below the 95% claim.** Measured with your
   actual fine-tuned model: 68–77% strict / ~88–92% counting valid spelling
   variants, on short scripted clips. Systematic misses: `reel`→`re`,
   `captions`→`options`, `aadhe`→`aage`. The claim stays your wording (framed
   as a claim, not a benchmark) — I did not change it. You should know the range.
4. **Exports are guest-gated by design** — "Create a free account to export".
   I could not create a test account (email signup rejects test domains;
   Google is the only path and needs you), so SRT/VTT/TXT/MP4 downloads are
   unverified end-to-end. The gate itself works (screenshot in evidence).
5. **In-browser transcription can't run from this sandbox** (local Chromium
   cannot reach Hugging Face). Upload/probe/validation all verified; the run
   stops at model download. The failure now shows a friendly message (BUG-008).

## What was fixed on this branch (all verified, not just written)
- **BUG-007**: homepage intro logged a React duplicate-key warning every load
  ("on" twice) — 1-line key fix + regression test.
- **BUG-008**: /transcribe showed raw "Failed to fetch" when the model download
  failed — now "Couldn't download the transcription model. Check your
  connection and try again." (live-verified).
- **BUG-010**: homepage axe violations — inert AI Edit chips lost their invalid
  `aria-pressed`; the Hinglish claim got `role="group"` so its aria-label is legal.
- **BUG-011**: Studio axe violations — `<main>` landmark + screen-reader h1,
  52 timeline handle labels fixed, trim sliders got values, tablist restructured.
  Axe re-run on the Studio is clean except the accepted skip-link item.

## Verified working (highlights)
- Caption editing (M16): SRT import → inline editor with all 5 actions;
  single-word card takes space + 2nd word ("jaati." → "jaati. test").
  Shift-all moves times (+0.5s: 0:00.2 → 0:00.7). Undo/redo work.
- Transcribe boundaries: empty / unsupported / no-audio / 60 MB over-limit all
  show honest messages, no crashes. Transcribe disabled with no file.
- Guest flow, protected-route redirect, API 401s, security headers (44/44),
  no horizontal scroll at 5 viewports, Transcribe + Pricing axe-clean.
- Motion (46 templates), AI Clipper (honest "editorial estimate" labelling),
  Analyzer, Teleprompter, Creator Studio, Growth (cards honestly "Not switched on").

## Files modified (branch `qa/captionit-full-audit-fixes`)
- `apps/frontend/src/components/home/Loader.tsx` (BUG-007)
- `apps/frontend/src/components/home/__tests__/loader.test.tsx` (new)
- `apps/frontend/src/features/transcribe/standalone.ts` (BUG-008)
- `apps/frontend/src/features/transcribe/__tests__/standalone-run.test.ts` (+2 tests)
- `apps/frontend/src/components/home/AiEditDemo.tsx`, `.../home/Sections.tsx` (BUG-010)
- `apps/frontend/src/features/studio/StudioPage.tsx`, `.../studio/Timeline.tsx`,
  `apps/frontend/src/components/brand/Skeletons.tsx` (BUG-011)
- `apps/frontend/src/features/studio/__tests__/timelineEdgeResize.test.tsx`
  (locators updated to `title` after the handle fix)
- `qa/overnight-audit/` — discovery, planning, tests, evidence, bugs, fixes, reports.

## Commands (all from `~/workspace/oc-overnight-qa`)
- Tests: `pnpm --filter frontend test` (single file:
  `pnpm --filter frontend exec vitest run <path-from-apps/frontend>`)
- Typecheck / build: `pnpm --filter frontend typecheck` / `pnpm --filter frontend build`
  (run from the worktree; serial, quiet machine)
- Dev server used: `NODE_USE_ENV_PROXY=1 pnpm dev --port 3100` (see Environment notes)

## Test results
- Baseline: 2152/2152 (192 files), typecheck rc=0, build rc=0.
- Final: **2155/2155 (193 files)**, typecheck rc=0, build rc=0.
  Logs: `~/workspace/oc-qa-final-test2.log`, `~/workspace/oc-qa-final-typecheck.log`,
  `~/workspace/oc-qa-final-build.log`.
- Node Whisper reference: stock base 9/10 ok; fine-tuned Hinglish 8/8 ok
  (`qa/overnight-audit/evidence/node-transcribe/{base,hinglish}/`).
- Lighthouse 13.6.0 (local dev): home perf 60 / a11y 90 / seo 92; pricing 70/100/100;
  transcribe 44/100/66 (LCP 12.3s in dev — re-measure live before acting).
- Axe-core 4.12.1: home only color-contrast (9 nodes, design call) remains;
  Studio only the accepted skip-link region remains.

## Evidence locations
- `qa/overnight-audit/` — `discovery/`, `planning/` (matrix M01–M60),
  `tests/assets/` (14 files + MANIFEST.md) + `tests/e2e/` (probes),
  `evidence/` (probe JSON, screenshots, Lighthouse JSON, Node transcripts),
  `bugs/BUG-001.md…BUG-011.md`, `fixes/fixes-applied.md`,
  `reports/` (functionality, ux, accessibility, performance, security, api,
  test-coverage, final-quality-report), `checkpoints/RESUME.md`.
- Key screenshots: `evidence/screenshots/looks-panel.png`,
  `studio-stage.png`, `export-gate.png`, `transcribe-390.png`.

## Issues needing you (owner)
- **Deploy queue** (existing order): checkout error-surface fix → quota
  (needs APPLY-VIDEO-QUOTA.sql in Supabase BEFORE deploy) → PWA → Motion
  Explore-more → copy (last). Previews fix 699b259 slots after the checkout decision.
- **Instagram**: complete the Meta passkey ("Authenticity verification") in the
  live browser or Business Suite on your phone, then tell me — a fresh connect
  task follows. Then: 1 API test call per permission; Privacy policy URL;
  Tech Provider decision (irreversible — your explicit call only).
- **YouTube reconnect + display name**: sign vezzzparrr@gmail.com into Google
  in the cloud browser, then YouTube reconnect + Sync count check + set display
  name "Parvez Siddiqui" in /settings.
- **Timeline live probe**: still needs you + the project name (asked 2026-11-13).
- **Google consent-screen rename**: "Open Caption" → "Captionit" (portal step).
- **On-screen checks** (yours): caption batch items, hero drag feel, Captionit
  wordmark, halo re-render, Export modal + background, Shift-all + tutorial,
  Start-for-free incognito proof, 95% count-up feel, video playback picture,
  PWA Add to Home Screen (after PWA deploy), Mac Chrome transparent WebM.
- **Decisions**: color-contrast muted pills (brighten or keep?); BUG-001/002/
  004/005/006 server-side fixes (approve or leave); transcribe LCP (only if
  it reproduces live); upload-waits-for-language hint (add or leave).

## Paid / inaccessible features NOT tested
- Nothing paid exists in the product. Cashfree production switch untouched.
- In-browser Whisper end-to-end (model download blocked locally).
- Exports end-to-end (needs a real signed-in account — yours).
- Emphasis end-to-end (Groq key in Vercel only).
- Instagram/YouTube connects (your passkey/sign-in).
- Real-device checks (touch, PWA install, Mac Chrome, video picture).
- INR pricing render (needs India egress; USD verified).
- M57–M60 (refresh mid-process, double submit, long/unicode filenames).

## Exact next steps
1. You review this handoff + the branch; say which fixes to merge/deploy (none
   are merged — the branch stays as-is until you say so).
2. Deploy queue per above; after the checkout fix deploys, re-run the sandbox
   test to read the real Cashfree error.
3. Instagram passkey → fresh connect task → Sync test.
4. YouTube reconnect + display name (vezzzparrr sign-in).
5. One production Lighthouse run (home + pricing + transcribe).
6. Your on-screen checks listed above.

## WHAT STILL NEEDS MY ATTENTION
- **Deploy go/no-go for each queued branch** (checkout fix, quota + its SQL,
  PWA, Motion, copy, previews fix) — nothing is merged until you say so.
- **Instagram Meta passkey** (connect is built and deployed; only your
  verification unblocks it).
- **YouTube reconnect + display name** (vezzzparrr Google sign-in in the cloud browser).
- **Timeline live probe** (your project name + a drag on your Studio).
- **Google consent-screen rename** ("Open Caption" → "Captionit").
- **Hinglish 95% claim vs measured 68–77% strict / ~88–92% lenient** — the
  wording stays yours; decide if the claim, the model, or nothing changes.
- **Color-contrast muted pills** — brighten to pass 4.5:1, or keep the palette.
