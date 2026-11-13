# Regression results — Captionit overnight QA

Branch: `qa/captionit-full-audit-fixes` (base b32c36a). All gates run serially on a
quiet machine (1.5 CPU / 6 GB). Logs under `~/workspace/oc-qa-final-*.log`.

## Final gates (2026-11-14 ~08:15 IST)
- Full suite: **2155/2155 passed, 193 files, rc=0** (238.8s)
  (`~/workspace/oc-qa-final-test2.log`)
- Typecheck: **rc=0** (`~/workspace/oc-qa-final-typecheck.log`)
- Production build: **rc=0** (`~/workspace/oc-qa-final-build.log`)

## Baseline (same branch before fixes, 2026-11-14 ~02:55 IST)
- Full suite: 2152/2152 passed, 192 files; typecheck rc=0; build rc=0.

## Delta (+3 tests, +1 file)
- `loader.test.tsx` (new, BUG-007) — 1 test.
- `standalone-run.test.ts` (BUG-008) — +2 tests (8 total in file).
- `timelineEdgeResize.test.tsx` — locators updated (`getByLabelText` →
  `getByTitle`) after the BUG-011 handle change; assertions unchanged, 2/2 pass.

## Mid-mission failure (fixed, not hidden)
- The first final run failed with exactly 2 failures in
  `timelineEdgeResize.test.tsx`: the BUG-011 fix removed the `aria-label` the
  tests used to locate the drag handles. Fixed by updating the 2 locators to
  query the new `title` attribute. No test was weakened or deleted; the
  re-run is green (2155/2155).

## Critical-journey re-verification (CDP, local dev)
- Home load: no duplicate-key warning (BUG-007 fixed); axe clean except
  color-contrast (BUG-010 fixed).
- /transcribe v07: friendly model-download message (BUG-008 fixed).
- Studio: inline edit + 5 actions + single-word space (M16, re-verified on the
  rebuilt project); shift-all +0.5s (M27); undo/redo (M28); axe clean except
  the accepted skip-link region (BUG-011 fixed).
- Looks previews still fail on this branch (BUG-009 — fix lives on its branch).
- Exports still guest-gated (M21–M25 — needs a real account).
