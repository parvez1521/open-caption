# Test strategy

Mission: overnight QA of Captionit.in (https://www.captionit.in), branch `qa/captionit-full-audit-fixes`,
base main @ b32c36a. Owner away all night; no deploy, no merge to main.

## What "verified" means
A feature counts as verified only when the complete user-visible workflow ran and its output was
inspected. Opening a URL is not verification. API-only checks do not verify a feature.
Skipped or inaccessible work is reported as skipped/blocked with the reason — never as passed.

## Test layers (in order)
1. **Live HTTP layer (curl, read-only).** Status codes, redirects, headers, sitemap/robots, served HTML
   content. Done for 19 routes + homepage content (see checkpoint RESUME.md). Cheap; repeatable.
2. **Repo test suite (Vitest).** Baseline full suite on this branch first; then targeted regression after
   every fix. `pnpm --filter frontend test`, serially, quiet machine only.
3. **Local browser layer (headless Chromium via CDP, local dev server).** The only browser route on
   this VM: no Chromium here can reach external sites, and the cloud browser cannot reach VM localhost.
   Local dev serves the same code as production (b32c36a). All browser results are labelled local-dev,
   never live-browser. Probe pattern: `~/workspace/oc-look-previews-*.mjs` (CDP via chrome-remote-interface
   or raw WebSocket — check what the earlier probes used before writing new ones).
4. **Node-side model check (accuracy reference).** In-browser Whisper cannot download its model locally
   (host hardcoded to huggingface.co for `en`; local Chromium has no external network). The exact pinned
   model (`onnx-community/whisper-base_timestamped` @ 608c49e6) is fully cached at
   `~/.cache/huggingface/onnx-community/whisper-base_timestamped/` with @huggingface/transformers 4.3.0
   installed in the main app tree. Transcribe test assets in Node with the same model + language tokens
   as an accuracy reference. This tests the model, not the browser worker path — say so in the report.
5. **Manual code review layer.** Security headers, auth boundaries, RLS notes, validation (client vs
   server), error handling — read the code, cite file + line.

## Tooling rules
- NO Playwright (owner decision P22 — library and CLI both forbidden). No install.
- Free tools only. No paid APIs, keys, or plans. No purchases.
- axe-core + Lighthouse via npx (free, dev-only) against LOCAL dev URLs.
- OWASP ZAP passive/baseline only if feasible here; else document as not run.
- FFmpeg for synthetic assets (done — see `tests/assets/MANIFEST.md`).

## Scope boundaries (owner standing rules)
- Cashfree checkout: audit read-only. Known live failure (generic "Something went wrong", all 3 plans,
  sandbox 2026-11-14 ~01:04 IST). Do NOT re-fix; error-surface fix is on another branch.
- Look previews: reported broken 2026-11-14 ~01:15 IST; fix on another branch. Test previews on that
  fix if it lands, else record open.
- Monthly video quotas: on another branch, not live. Audit live plans as they are.
- Instagram connect (owner's Meta passkey), YouTube reconnect + display name (owner's vezzzparrr
  sign-in), timeline edge-resize live probe (owner + project name): OWNER-ATTENTION, do not chase.
- Guest/anonymous sessions + dedicated test data only. Never bypass auth, invent credentials, guess keys,
  use another user's account, or touch production data.
- Hidden tools (/clipper, /ai-clipper, /analyzer, /prompter, /create) are live by direct URL but hidden
  from nav/homepage/footer by owner order — test them as live routes, do not re-hide or re-expose.
- Design ban list applies to any UI copy/fix: no purple gradients, Lucide, sparkle icons, 3-cards,
  bento, glass cards, glowing orbs, colour stripes, Inter/Geist, emojis in headings, em dashes
  everywhere, fake testimonials, dot-grid, hover animations, lorem ipsum. Short sentences.

## Severity
P0 critical (data loss, cross-user exposure, critical security, app down, prod data corruption).
P1 high (main tool broken, upload/export broken, core workflow blocked, auth failure, unusable output).
P2 medium (partial failure, validation error, wrong output, browser-specific, serious mobile issue).
P3 low (minor visual, typography, alignment, small UX friction, minor copy).

## Regression rule
Every fix: smallest change + regression test + re-run of the affected feature + full suite before
the mission ends. Never weaken or delete a test. Never hide an error with a timeout.
