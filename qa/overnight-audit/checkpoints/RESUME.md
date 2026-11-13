# Overnight QA — RESUME checkpoint

Last updated: 2026-11-14 ~03:35 IST. Coordinator: RECOVERY coordinator (second coordinator; first coordinator completed Phases 1 + planning, then ended without a final answer after an approval card timed out — owner asleep, no approvals overnight).
Branch: `qa/captionit-full-audit-fixes` (worktree `~/workspace/oc-overnight-qa`, base origin/main @ b32c36a).
Live site under test: https://www.captionit.in (www primary; apex 308→www). NO deploy, NO merge to main.
RULE: never wait on an approval card. If an action triggers one, stop it, route around it, record it here + in the morning handoff. Do not re-trigger it.

## Wait gate (from the task brief) — RECHECKED 2026-11-14 ~03:30 IST
- Checkout branch LANDED: `feature/checkout-error-surface-2026-11-14` @ e39e30e. Quota branch DONE: 2d4d140. Copy branch READY: `feature/short-copy-2026-11-14` @ e2ef3b4 (gates 2139/2139, per MEMORY.md — parent's job, do NOT touch). **Previews branch STILL not on origin** (`feature/caption-template-previews-2026-11-14` — builder 97163cb3 status unknown; do NOT block the mission on it).
- 2 vitest/next-build processes seen ~03:30 IST (other builders gating) — light CDP work only while they run; heavy gates run when quiet.

## Discovery — VERIFIED by recovery coordinator 2026-11-14 ~02:15 IST
- 39 pages ✓ (`find app -name page.tsx`), 60 API routes ✓, 14 languages ✓ (en, hinglish, hindi, tamil, telugu, bengali, marathi, punjabi, urdu, spanish, french, german, arabic, portuguese).
- 150 looks ✓ (`LOOK_NUMBER_ORDER` 178 entries − 28 retired = 150, `packages/templates/src/looks/numbers.ts`).
- 46 motion templates ✓ (motion page copy "46 templates"; registry test asserts 46).
- Discovery docs + planning docs + test assets all present and read. CDP pattern confirmed: raw WebSocket CDP via `chrome-headless-shell`, Fetch interception blocks non-localhost, `Runtime.evaluate` probes, screenshots (`~/workspace/oc-look-previews-cdp.mjs`).

## Workers spawned by recovery coordinator (~02:15 IST, read-only, no heavy work)
- W1 live-HTTP layer: curl live site — all pages status, security headers, sitemap/robots/canonical, health, unauthenticated API 401s, served HTML checks. Writes reports + evidence.
- W2 code-review layer: security headers, auth boundaries, webhook signature, checkout/guest/device/cron auth, upload validation client vs server, error handling. Writes security-report.md + api-report.md drafts + code-evidenced bugs.

## What is done
- Worktree created, branch `qa/captionit-full-audit-fixes` @ b32c36a.
- Discovery Phase 1 DONE (child 25eb6105, verified by coordinator): `discovery/website-map.md`,
  `route-inventory.csv` (104 rows), `feature-inventory.md` (30 features), `user-workflows.md`
  (7 journeys). Verified counts: 39 pages, 60 API routes (+ /health, /health/ready, /ads.txt,
  /sitemap.xml, /robots.txt), 150 looks (178 − 28 retired), 46 motion templates, 14 languages.
  Hidden routes verified: /clipper, /ai-clipper, /analyzer, /prompter, /create absent from nav +
  homepage + footer; one live in-app link survives (Studio ClipperLaunchCard → /clipper).
  "Explore more" not in worktree (branch-only). Dashboard 200s are anonymous shells, not proof.
- Test assets built: 14 files in `tests/assets/` + `MANIFEST.md` (build_assets.py re-runnable).
  gTTS BLOCKED (translate.google.com unreachable via proxy) — speech is campaign Hinglish VO
  (exact reference text) + speech-test.mp3 (English, exact words unverified). Pure Hindi sample:
  UNAVAILABLE. Multi-speaker true test: UNAVAILABLE (v13 is two segments, same voice).
- Planning docs done: `planning/test-strategy.md`, `test-matrix.csv` (60 cases M01–M60),
  `planning/risk-assessment.md`.
- Node-side model check (read-only): the exact pinned Whisper model is FULLY cached locally
  (`~/.cache/huggingface/onnx-community/whisper-base_timestamped/` @ 608c49e6, all 6 files incl.
  both quantized ONNX) + @huggingface/transformers 4.3.0 installed in the main app tree. Plan:
  transcribe test assets in Node as an accuracy reference (tests the model, not the browser
  worker). Browser Whisper cannot download locally (host hardcoded to huggingface.co for `en`;
  local Chromium has no external network) — end-to-end in-browser transcription is only
  partially testable here; test the UI flow up to model download and say so.
- Copy-pass gates (parent's tree, NOT this branch): tests rc=1 FAILED, typecheck rc=0, build rc=0.
  Parent's job; do not touch `~/workspace/oc-short-copy`.

## Running elsewhere (do NOT touch)
- Checkout error-surface builder (b6f58e81): branch `feature/checkout-error-surface-2026-11-14`, still running.
- Look-previews recovery builder (97163cb3): branch `feature/caption-template-previews-2026-11-14`, still running.
- Quota recovery builder (724d520d): DONE — branch pushed (2d4d140).
- Copy-pass gates script (pid 87958): finished, tests FAILED rc=1. Parent's job.
- PWA branch (00d23e2) + Motion branch (67560f7): queued deploys, NOT mine.

## Known issues (do not re-investigate from scratch)
1. Cashfree checkout FAILS live (generic "Something went wrong", all 3 plans; sandbox test 2026-11-14 ~01:04 IST). Audit billing read-only. Do NOT re-fix checkout.
2. Caption template (look) previews reported broken 2026-11-14 ~01:15 IST. Fix in progress on `feature/caption-template-previews-2026-11-14`. Test previews on that fix if it lands, else record open.
3. Monthly video quotas (Free 3 / Starter 10 / Plus 20 / Pro 40) built on `feature/monthly-video-quota-2026-11-14`, NOT live. Audit live plans as they are. Migration `supabase/APPLY-VIDEO-QUOTA.sql` exists on that branch, NOT applied.
4. Instagram connect BLOCKED on owner's Meta passkey. YouTube reconnect + display name blocked on owner's vezzzparrr sign-in. Timeline edge-resize live probe needs owner + project name. All OWNER-ATTENTION, do not chase.

## Environment limits (verified, standing)
- NO Playwright (P22). Browser testing = headless Chromium binary `~/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell` via CDP scripts against a LOCAL dev server. No Chromium on this VM can reach external sites — live-site browser testing is NOT possible from here; live checks are curl-only. Local dev server tests the same code as production (b32c36a); label results as local-dev, never as live-browser.
- In-browser Whisper models download from Hugging Face on demand — local Chromium cannot reach HF, so full transcription may not complete locally. Test the flow up to model download honestly; use unit tests for transcription logic; mark end-to-end transcription as partially verified with the reason.
- pnpm at `~/.local/share/npm-global/bin/pnpm` (export PATH in every exec). Tests via `pnpm --filter frontend test` (full suite only). Gates serially on a quiet machine. Build can fail once on transient Google Fonts fetch — retry once.
- /tmp is wiped by restarts — ALL evidence under `~/workspace/`. Save checkpoints after each phase.

## W2 code-review — done (2026-11-14 ~02:30 IST)

Read-only code review of headers, auth boundaries, billing, upload validation, error handling, data isolation, secrets scan. Branch `qa/captionit-full-audit-fixes` @ b32c36a. No builds, no test runs, no files modified outside the QA outputs below. All findings are code review; runtime repro pending.

- Reports: `qa/overnight-audit/reports/security-report.md` (headers table, auth-boundary table, billing, validation, isolation, secrets scan: none found), `qa/overnight-audit/reports/api-report.md` (code half only — guard per route for all 60 API routes + 2 health routes; W1's live-HTTP half not present, do not overwrite).
- Guard counts: requireUser 51, requireWorker 6, webhook signature 1, OAuth HMAC state 1, companions flag + rate limit only 2, cron bearer 1, public health 2. No unguarded API route.
- Bugs filed (6): BUG-001 P2 duration limit bypassable by omitting probe; BUG-002 P2 size/MIME enforced on client-declared values only; BUG-003 P2 `effectivePlanId` fail-open on null/unparseable expiry; BUG-004 P3 device approve GET discloses any pairing code / POST claimable by any signed-in user; BUG-005 P3 Supabase error text leaked in ~41 API sites; BUG-006 P3 cron bearer plain `!==` + 500 leaks DB text.
- Verified sound in code: webhook HMAC (raw body, timing-safe), reconcile settles only from Cashfree PAID, settle idempotent (no double-grant), checkout guest-forbidden + server-side pricing, OAuth state HMAC 10-min TTL, device token atomic consume + SHA-256 storage, RLS owner-scoped in SQL (live-DB application unverifiable from code), CSP covers all needed hosts (GIS, fonts, Supabase, Cashfree, HF, Pixabay, Sentry).

## W1 live-HTTP — done (2026-11-14 ~02:35 IST)

- All 39 pages 200 (no redirects); /sitemap.xml, /robots.txt, /health, /health/ready all
  200; /ads.txt 404 by design; apex 308 → www. Dynamic probes: /motion/counter 200
  (real id), /projects/test123 (+/settings) 200 shells (placeholder id).
- M50 pass: all 6 security headers on all 39 pages + aux + API 401s (44 responses,
  0 missing); identical CSP (1252 chars) everywhere. Apex 308 carries HSTS only —
  normal for a bare redirect, not a defect.
- Sitemap pass: 12 `<loc>`, all www, all with `<lastmod>`. Robots pass: /transcribe,
  /ai-clipper, /onboarding disallowed; /login, /pricing NOT disallowed.
- Home pass: "Captionit" 3×, "95% Hinglish", "150 looks" 2×, zero hidden-route hrefs
  (/clipper, /ai-clipper, /analyzer, /prompter, /create), canonical
  https://www.captionit.in. GIS id 401611748843 found in login JS chunk
  168dq3d6bx0im.js. Pricing: $0/$4/$6/$10 rendered; INR 299/499/799 only in JSON-LD,
  no ₹ glyph from non-IN egress (geo-expected; INR rendering needs IN-egress check).
- M52/M53/M54 pass: /api/v1/billing/me, /api/v1/projects, /api/v1/growth/connections
  all 401 UNAUTHORIZED, no data. /health/ready 200, queue booleans, no secrets.
- Bugs filed by W1: none. (bugs/ already holds BUG-001…006 from W2 code review.)
- Outputs: reports/api-report.md (HTTP half appended to W2's code half),
  evidence/network/live-http-2026-11-14.md + raw/ per-URL curl files.
  test-matrix.csv: M50, M52, M53, M54 → pass (new notes column); no other rows touched.

## Wait-gate update — recovery coordinator (~02:55 IST)
- Checkout branch LANDED on origin: `feature/checkout-error-surface-2026-11-14` @ e39e30e. Previews branch STILL not on origin (builder 97163cb3 still running).
- Machine went fully quiet (0 vitest/next build/next-server at ~02:55 IST). pnpm install DONE rc=0 (25.5s). Baseline full suite STARTED in background (log ~/workspace/oc-qa-baseline-test.log). Typecheck + build follow serially after tests.
- W1 DONE ~02:35 IST (see section above): M50, M52, M53, M54 pass; no bugs. INR price rendering untestable from this VM's non-IN egress — limitation, not a bug.
- W2 DONE ~02:50 IST (see section above): 6 bugs filed. Coordinator verified BUG-001/002/003 in code. BUG-003 annotated DO NOT FIX (known suspect S1, owner already declined).

## Baseline gates — ALL GREEN (recovery coordinator, 2026-11-14 ~02:55–03:00 IST)
- pnpm install rc=0 (25.5s). Full suite **2152/2152 passed (192 files), 573.6s**. Typecheck rc=0. Production build rc=0. Logs: `~/workspace/oc-qa-baseline-test.log`, `~/workspace/oc-qa-baseline-typecheck.log`, `~/workspace/oc-qa-baseline-build.log`, `~/workspace/oc-qa-pnpm-install.log`.
- Dev server running: `pnpm dev --port 3100` (pid 114178), home 200. `.env.local` copied from main tree (551 bytes, contents never printed).
- CDP harness: `qa/overnight-audit/tests/e2e/cdp-harness.mjs` (raw WebSocket CDP, Fetch interception blocks non-localhost, `Runtime.evaluate` probes). Node Whisper reference: `qa/overnight-audit/tests/e2e/node-transcribe-ref.mjs` (pinned model onnx-community/whisper-base_timestamped @ 608c49e6, cache-only; Hinglish = stock base approximation).
- Home probe results (local dev): no horizontal scroll at all 5 viewports (1440×900, 1280×800, 768×1024, 390×844, 360×800); title + Start free / 150 looks / Transcribe / Motion Studio / FAQ present; zero hidden-route hrefs; 47 nav links.
- "95% Hinglish" innerText FALSE was a probe artifact (flex spans split innerText with newlines); textContent confirms the claim is present. Count-up read "85%" at probe time — likely headless rAF throttling; needs a real-browser check; NOT filed as a bug.

## BUG-007 — FIXED (2026-11-14 ~03:20 IST)
- React duplicate-key warning on every home load: intro words contain "on" twice, spans keyed by word (`Loader.tsx:25,131`). Reproduced 3× in CDP probes; evidence `evidence/console/dupkey-home.txt`.
- Fix: `key={w}` → `` key={`${w}-${i}`} `` (one line, no visual change). Regression test `apps/frontend/src/components/home/__tests__/loader.test.tsx` — FAILS on old key (rc=1, proven by revert), PASSES on new key (rc=0, single-file run 6.6s).
- Full-suite re-verification runs in Phase 11. Bug file `bugs/BUG-007.md` + `fixes/fixes-applied.md` updated.
- Single-file vitest invocation that WORKS: `pnpm --filter frontend exec vitest run <path-from-apps/frontend>` from the worktree root (6.6s). The old quirk note (vitest run <file> finds no tests) applies to running from inside apps/frontend.

## Guest-session seeding — the key sandbox workaround (2026-11-14 ~03:40 IST)
- Local Chromium cannot reach ANY external site — verified twice (direct + `--proxy-server=$https_proxy` both fail for Supabase + Hugging Face). The app's `signInAnonymously()` therefore fails in local CDP, so /transcribe (and every guest tool) redirects to /login. This is a sandbox limit, NOT a product bug.
- Workaround: create a REAL anonymous guest session via Supabase's own signup endpoint with the app's PUBLIC anon key (the exact mechanism the app uses) from the shell (curl, which has proxy network), seed it into Chromium localStorage (`sb-nwqmmvqobjxguvfxeafs-auth-token`), delete the token file immediately. Throwaway guest session, no user data, never stored in evidence/logs. Documented in `qa-probe-transcribe.mjs`.
- Previews fix branch LANDED (per MEMORY.md 2026-11-14 ~02:55 IST): `feature/caption-template-previews-2026-11-14` @ 699b259, gates 2154/2154. Root cause = one shared 6-slot preview pool, Motion socials took all slots, looks starved; fix = per-kind split (3 each, ceiling 6); 144/150 live + 150 walk. NOT merged into the QA branch — test previews on the QA branch to confirm the bug, record the fix branch.

## Dev server + API reachability — BREAKTHROUGH (2026-11-14 ~04:35 IST)
- **Problem found:** `/api/v1/projects` with a valid guest token TIMED OUT (25s, HTTP 000).
  The Next dev server's server-side fetch to Supabase ignored the egress proxy
  (Node fetch doesn't use proxy env vars by default), so every server-backed
  flow (projects, Studio, billing/me) hung in local CDP. /start stuck on
  "Opening your studio…" (evidence `evidence/studio-probe.json` v1).
- **Fix:** restarted the dev server with `NODE_USE_ENV_PROXY=1`
  (new pid 125184; old pids 114178/114210 killed; home 200).
  `/api/v1/projects` now returns **200 in 3.06s** (`data:[]`, fresh guest).
  All server-backed flows are now testable in local CDP.
- **Caveat:** the proxy credential rotates per exec session — the dev server
  holds the credential from its start. If API calls start hanging again,
  restart the dev server from a fresh exec.
- **Still blocked (browser-side, no fix):** local Chromium cannot reach
  Hugging Face (model download) or Supabase directly — guest sessions are
  seeded via shell curl; in-browser Whisper cannot run locally.
- Probe `qa/overnight-audit/tests/e2e/qa-probe-transcribe.mjs` with seeded guest session (M07, M09–M12, M14, M56, M58): v12 zero bytes, v11 unsupported, v10 corrupt, v07 silence → transcribe attempt (records stall timeline at model download; local Chromium cannot reach Hugging Face).
- First unseeded run landed on /login (evidence `evidence/transcribe-probe.json` v1 — superseded). Log `~/workspace/oc-qa-transcribe-probe2.log`.
- **Harness limits found (not product bugs):** `DOM.setFileInputFiles` returns success but leaves `input.files` empty in chrome-headless-shell (verified by `qa-setfile-debug.mjs`). Workaround: `tests/e2e/upload-file.mjs` — fetch the asset same-origin + DataTransfer + bubbling change event. Assets must be served same-origin: copied into `apps/frontend/public/qa-assets/` (TEMPORARY serving shim — delete at mission end, never commit). Cross-origin fetch from :3199 failed on CORS.
- **Results (evidence/transcribe-probe.json, probe4):** M12 PASS ("This file is empty."); M11 PASS ("We couldn't read this file. It may be damaged or in a format this browser can't open."); M10 partial (truncated file picked, duration 0:03 probed, Transcribe enables; run fails at model download); M07 blocked at model download (see BUG-008); M14 partial (upload+probe works; full transcribe blocked by sandbox network); M15 partial (14 language options render); M56 PASS (Transcribe disabled with no file). Matrix updated for M07, M09–M12, M14, M15, M56.

## BUG-008 — FILED, fix planned (2026-11-14 ~04:05 IST)
- /transcribe shows raw "Failed to fetch" when the Whisper model download fails. Studio already maps the same failure to a friendly sentence (session.ts:477); standalone path doesn't. Fix in `standalone.ts` error branch ONLY (do NOT touch the shared worker catch — Studio maps the raw message itself). Regression test via FakeWorker in `standalone-run.test.ts`. Bug file `bugs/BUG-008.md`.

## Studio probe — M16 PASSED (2026-11-14 ~05:00 IST)
- Project `84b14895-98c7-4a69-ae03-6ad4000acbdc` created via /start (guest).
- **Upload gotcha found:** with mode=captions and no saved language, picking a video
  only PENDS it (waits for a language choice) — the video never processes until a
  language is picked or the Normal Editor door is chosen. Not a bug (by design),
  but the probe had to learn it (evidence `evidence/studio-probe2.json` = upload
  screen with no video after the pick).
- **M16 PASS (evidence `evidence/studio-probe3.json`):** video uploaded (Normal Editor
  door), SRT imported (26 real Hinglish words from the Node reference), click
  "jaati." → inline editor under the card with ALL 5 actions; single-word card:
  typed space + "test" → "jaati. test" sticks. The 2026-11-14 single-word fix
  VERIFIED in the running app. Matrix M16 → pass.
- Phase 4 running: looks previews count (M19–M20), exports (M21–M25), timeline (M26–M28).
- Orphan test data: diag run created project `ddb90b06-a0e4-4467-9113-fc50924cfee4`
  under a throwaway guest (token discarded); note in handoff, do not chase.

## Node Whisper reference — base run DONE; Hinglish run RUNNING (2026-11-14 ~04:05 IST)
- Base model (stock whisper-base_timestamped q8): 9/10 files ok; v09 ffmpeg-failed (no audio stream — expected). Evidence `evidence/node-transcribe/base/` (summary.md + per-file JSON).
- **Base results are POOR on Hinglish by design** (stock base + "en" token mangles Hinglish: v01 "You are watching on real mute." 1/8 words; v02 5/26; v05 4/18). This does NOT measure the app — the app uses a fine-tuned Hinglish model. v07 silence → stock base hallucinated "you" (known Whisper behaviour; app-side VAD/suppression unverified in-browser). v04 English → "hyperbolic" (reference words unverified).
- **Hinglish model downloaded** (free, via shell proxy): ishaan-g/whisper-hinglish-swift_timestamped @ eb0fe25c (pinned revision, 78MB) into `~/.cache/huggingface/` + top-level symlinks (same layout fix as base). Script parameterized (QA_MODEL_ID/REVISION/KEY). Hinglish pass running on v01, v02, v03, v05, v06, v07, v08, v13 — output `evidence/node-transcribe/hinglish/`. Log `~/workspace/oc-qa-node-transcribe-hinglish.log`.
- Script fixes made along the way: WAV decode by hand (transformers.js Node has no AudioContext); `@huggingface/transformers` resolved via a symlink in `tests/e2e/node_modules/` (pnpm layout); model files symlinked from revision subdirs to top level.

## Phase 11 — full regression RUNNING (2026-11-14 ~08:00 IST)
- Final full suite started after the edge-test locator fix. Typecheck + build
  follow serially. Logs: `~/workspace/oc-qa-final-test2.log` (+ typecheck/build).
- NOTE: the first final run (test2 predecessor) failed with exactly 2 failures in
  `timelineEdgeResize.test.tsx` — the BUG-011 handle change removed the
  `aria-label` the tests queried. Fixed by updating the 2 locators to query the
  new `title` attribute (same tests, same assertions; 2/2 pass). No test weakened.
- Reports drafted: functionality, ux, accessibility, performance, security
  (addendum), api (addendum), test-coverage, final-quality-report.
  MORNING-HANDOFF.md drafted — REGRESSION NUMBERS IN IT ARE UNVERIFIED UNTIL
  the suite + typecheck + build finish; correct the handoff if they differ.
- M44 PASS (60MB over-limit message), M09 PASS (no-audio message), M26/M27
  labels corrected (M26 edge-resize not run; M27 shift-all pass).

## Next steps (in order)
1. ~~Wait for checkout + previews branches~~ — checkout landed (e39e30e); previews fix landed on ITS branch (699b259); copy ready (e2ef3b4). Do NOT block the mission on them.
2. ~~Verify discovery counts~~ — DONE: 39 pages, 60 API routes, 150 looks, 46 motion templates, 14 languages.
3. ~~Baseline gates~~ — DONE, all green (2152/2152 + typecheck + build).
4. Dev server + CDP probes of every tool (matrix M01–M60); record bugs BUG-008… with repro + evidence. Transcribe probe running.
5. Lighthouse (local dev URLs) + axe-core + Node Whisper reference.
6. Fix confirmed safely-fixable bugs on this branch (smallest fix + regression test + re-verify). Ambiguous product/pricing/branding → recommendation, not change.
7. Full regression (full suite + critical journeys), then reports + MORNING-HANDOFF.md + final report to parent.
