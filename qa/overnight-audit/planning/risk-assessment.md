# Risk assessment

## Highest risk (test first)
1. **Transcription pipeline** — the core promise. In-browser Whisper + word timestamps + timing
   alignment. Risk: model download failure, wrong language, timing drift (the owner already reported
   timing mismatch once; a fix landed 2026-11-14). Local browser cannot download the model, so
   end-to-end transcription is only partially testable here — Node-side reference + UI flow to download.
2. **Export (MP4 via Remotion + SRT/VTT/TXT)** — the paid value. Risk: CSP blocks, render failure,
   corrupt output, wrong timing in the file. Verify by opening downloaded files, not by trusting a
   success toast.
3. **Billing / plan gating** — money path. Checkout is ALREADY broken live (known). Risk: plan grant
   without payment, free tier leaking paid limits, webhook replay. Audit read-only; do not re-fix.
4. **Auth + session** — Google GIS login, guest sessions, guest-claim on sign-up. Risk: data leaking
   across users, guest work lost on login, session expiry loops.
5. **Look previews (150)** — reported broken by the owner. A fix is on another branch. If the fix
   does not land, this stays the top open P1.

## Medium risk
6. **Growth connect (YouTube/Instagram OAuth)** — tokens in DB, callback HMAC, disconnect behaviour.
   Instagram blocked on owner's passkey; YouTube needs owner's sign-in. Test what the code allows
   without those; record the rest as owner-blocked.
7. **Editor state** — timeline edits, undo/redo, draft/live mode, save conflicts. The timeline
   edge-resize bug is still open (live probe needs the owner). Test what reproduces locally.
8. **Media handling** — IndexedDB media bin (a v3/v4 live bug was found in redesign Phase 2A),
   upload limits (50 MB free), duration limits, large files.
9. **Motion Studio + AI Clipper + Analyzer + Teleprompter** — secondary tools; some are hidden from
   nav but live. Test each by direct URL.
10. **Responsive layouts** — 390px mobile layout was never truly verified (standing open item).

## Lower risk
11. **SEO / sitemap / robots / canonical** — verified live already (12 URLs, www canonical, app routes
    disallowed). Re-check after any fix that touches metadata.
12. **Legal pages** — content accuracy (privacy wording was fixed once for overclaims). Read, do not
    rewrite without a demonstrated error.
13. **Performance** — bundle size, font loading, Whisper prefetch behaviour. Lighthouse on local dev.

## Environment risks (mission-level)
- Runtime restarts kill background jobs — checkpoint after every phase (RESUME.md).
- 1.5 CPU / 6 GB — heavy jobs serialize; parallel gates OOM and flake.
- Builders still running at mission start (checkout + previews branches) — heavy work waits for them.
- Copy-pass gates FAILED (rc=1) in the parent's tree — unrelated to this branch, but the baseline
  full suite on THIS branch must be run and recorded independently.
