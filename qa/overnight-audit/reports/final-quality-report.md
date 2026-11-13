# Final quality report — Captionit overnight QA

Mission: full product QA + bug fixing, no deploy, no merge.
Branch: `qa/captionit-full-audit-fixes` (base origin/main @ b32c36a).
Run: 2026-11-14 ~01:53–08:00 IST (owner away overnight).

## Verdict
**The product is in good shape for a guest-first free tool. The core loop —
upload → transcribe → edit captions → style → export — works, and the
2026-11-14 caption fixes are verified in the running app. Two things stand
between this branch and a clean bill: the look previews (fix already exists
on its own branch) and the Cashfree checkout (fix already exists on its own
branch). Everything else found is small, fixed, or a recommendation.**

## Counts
- Discovery: 39 pages, 60 API routes, 150 looks, 46 motion templates, 14 languages,
  30 features, 7 journeys.
- Test matrix (60 cases): 16 pass, 21 partial, 1 partial-blocked, 1 fail,
  1 known-open, 6 blocked-env, 2 partial-env, 12 not run.
- Bugs: 11 filed (BUG-001…011). Fixed on this branch: 4 (BUG-007, 008, 010, 011).
  Fix exists on another branch: 2 (BUG-009 previews, Cashfree checkout).
  Not fixed (recommendations / owner decision): 5 (BUG-001, 002, 004, 005, 006;
  BUG-003 excluded by owner decision).
- Unit tests: baseline 2152/2152; final regression — see `fixes/regression-results.md`.

## Top 5 findings
1. **Look previews don't animate (BUG-009, P2, owner-reported).** 150 boxes, 1
   canvas, 29 posters. Fix exists on `feature/caption-template-previews-2026-11-14`
   @ 699b259. Deploy decision is the owner's.
2. **Cashfree checkout fails live (M43, known-open).** Generic "Something went
   wrong" on all 3 plans; error-surface fix exists on its branch. Needs the
   sandbox re-test to read the real Cashfree error, then the root-cause fix.
3. **Hinglish accuracy is real but below the 95% claim.** Fine-tuned model
   measures 68–77% strict / ~88–92% lenient on short scripted clips, with
   systematic confusions (`reel`→`re`, `captions`→`options`, `aadhe`→`aage`).
   The claim is the owner's wording, framed as a claim — not changed; he should
   know the measured range.
4. **In-browser transcription can't run in this sandbox** (Chromium cannot reach
   Hugging Face). Upload/probe/validation all verified; the run itself stops at
   model download. The failure now shows a friendly message (BUG-008 fixed).
5. **Exports are guest-gated by design** ("Create a free account to export").
   No test account could be created without a real email/Google account, so
   SRT/VTT/TXT/MP4 file downloads are unverified end-to-end. The gate works.

## Fixed in this mission (all verified, not just written)
- BUG-007: homepage intro duplicate-key warning (1-line key fix + regression test).
- BUG-008: /transcribe raw "Failed to fetch" → friendly message (live-verified).
- BUG-010: homepage axe violations (chips aria-pressed removed; claim role=group).
- BUG-011: Studio axe violations (main landmark, h1, 52 handle labels, trim
  sliders, tablist) — axe re-run clean except the accepted skip-link region.

## Recommendations (owner decisions, not changes)
- Color-contrast (9 nodes, muted look-tag pills): brightening changes the palette.
- BUG-001/002 (server-side upload limits), BUG-004 (device approve), BUG-005
  (DB error text leak), BUG-006 (cron bearer): fix with server-side probes.
- BUG-003 stays as-is per the owner's earlier decision.
- Transcribe LCP 12.3s in dev Lighthouse — re-measure on production before acting.
- Upload-waits-for-language: add a "pick a language to continue" hint on the
  pending state (first-time users may think the upload broke).
- Tutorial re-appearing across sessions in the test profile — confirm the
  seen-state persists per user.

## What still needs the owner (see MORNING-HANDOFF.md)
- Deploy decisions: checkout error-surface fix → quota → PWA → Motion → copy
  (existing queue); previews fix 699b259 slots after the checkout decision.
- Instagram passkey, YouTube reconnect (vezzzparrr sign-in), display name,
  timeline live probe (project name), Google consent-screen rename.
- Real-device checks: video playback picture, 95% count-up feel, hero drag feel,
  PWA Add to Home Screen, Mac Chrome transparent WebM.
- One production Lighthouse run (home + pricing + transcribe).
