# Fixes applied — Captionit overnight QA

Branch: `qa/captionit-full-audit-fixes` (base b32c36a). No deploy, no merge.
Each fix: smallest change + regression test + re-verification. Full-suite
regression runs in Phase 11.

## BUG-007 — Homepage intro duplicate-key warning (P3) — FIXED
- File: `apps/frontend/src/components/home/Loader.tsx:131`
- Change: `key={w}` → `` key={`${w}-${i}`} `` (one line).
- Cause: intro words `["Every", "word,", "on", "screen,", "on", "time."]` contain
  "on" twice; keying by the word gave two spans key "on".
- Test: `apps/frontend/src/components/home/__tests__/loader.test.tsx` (new).
  Proves the fix: FAILS on the old key (rc=1), PASSES on the new key (rc=0).
- Re-verified: local dev CDP home load (see Phase 11 regression notes).

## BUG-008 — /transcribe raw "Failed to fetch" on model-download failure (P3) — FIXED
- File: `apps/frontend/src/features/transcribe/standalone.ts` (error branch).
- Change: network-ish worker messages map to "Couldn't download the transcription
  model. Check your connection and try again." Non-network errors unchanged.
  Shared worker untouched (Studio maps the raw message itself).
- Test: `apps/frontend/src/features/transcribe/__tests__/standalone-run.test.ts` (2 new).
  Proves the fix: FAILS without it (1 failed / 7 passed), 8/8 pass with it.
- **Live re-verified 2026-11-14 ~04:20 IST:** CDP /transcribe v07 shows the friendly
  message (was "Failed to fetch").

## BUG-010 — Homepage axe violations (P3) — FIXED + VERIFIED
- Files: `components/home/AiEditDemo.tsx` (removed `aria-pressed` from inert chips),
  `components/home/Sections.tsx` (added `role="group"` to the claim `<p>`).
- Verified: axe re-run on `/` — only `color-contrast` (9 nodes, design call,
  recommendation) remains. Tests hinglishClaim + loader + aiEditDemo: 10/10 pass.

## BUG-011 — Studio axe violations (P3) — FIXED + VERIFIED
- Files: `features/studio/StudioPage.tsx` (root divs → `<main id="main-content">`,
  sr-only h1, tablist restructure), `features/studio/Timeline.tsx` (handles
  `aria-label` → `title`; sliders get `aria-valuenow/min/max/valuetext`),
  `components/brand/Skeletons.tsx` (skeleton root → `<main>`, no `role="status"`).
- Verified: axe re-run on the Studio — only `region` (skip link, accepted) remains.
  Timeline tests 5/5 pass.

## Not fixed in this mission (recommendations / owner decisions)
- BUG-003 (P2, `effectivePlanId` fail-open): known suspect S1 from the
  2026-11-11 audit. Owner already decided to leave it. Recommendation only.
- BUG-001, BUG-002 (P2, upload duration/size enforced on client values):
  code-confirmed, runtime repro pending. Fix needs a server-side probe at
  complete time — see each bug file. Decision: fix in this mission if the
  repro confirms, else recommendation.
- BUG-004, BUG-005, BUG-006 (P3): code-confirmed, runtime repro pending.
  Fix if safely verifiable, else recommendation.
- Cashfree checkout live failure: known, fix on another branch. Not touched.
- Look previews: fix on another branch. Not touched.
