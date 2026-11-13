# UX report — Captionit overnight QA

Branch: `qa/captionit-full-audit-fixes` (base b32c36a). Local dev + headless Chromium CDP.
Screenshots: `evidence/screenshots/`.

## Viewports (M45 PASS, M46 PASS)
- No horizontal scroll at 1440×900, 1280×800, 768×1024, 390×844, 360×800 on
  /, /transcribe, /pricing, /motion.
- Leaf SPAN overflows at 390/360 on / and /motion sit inside overflow-hidden
  containers (hero/marquee) — no page-level scroll, not user-visible.
- Homepage first visit: purpose is clear ("Word-timed captions for Reels, Shorts
  and TikTok, made in your browser"); Start free / Transcribe / Motion Studio /
  FAQ all present; 150 looks, 14 languages visible.
- /transcribe at 390px: screenshot `evidence/screenshots/transcribe-390.png`.

## Studio (from `evidence/screenshots/studio-stage.png`, `studio-playing.png`)
- Layout holds at 1440×900: left rail, Captions panel (11 cards, Shift-all,
  Emphasis, Import SRT/VTT), centre stage + timeline with word chips on the
  Captions track and a Video track below.
- Stage shows a black frame at 0:00 with working player controls (0:00 / 0:11);
  the video element loads (videoWidth 1080, readyState 4). `play()` did not
  advance in headless (no user gesture) — video picture rendering beyond the
  first frame is unverified here; the owner should play it on a real device.
- Tutorial ("STEP 1 OF 6 — Your captions are ready") re-appeared across probe
  sessions in the test profile even after earlier runs. It is dismissible
  ("Skip tour"); whether its seen-state persists per user (not per load) is
  worth one owner check — recorded as an observation, not a bug.
- The 6-step tutorial fires on first Studio open with a project that has words.

## Honest empty/error states (verified)
- Transcribe boundary files: specific, plain messages (empty / unreadable /
  no-audio / over-limit). Model-download failure: friendly sentence after BUG-008.
- Growth: YouTube + Instagram cards say "Not switched on" instead of pretending.
- Emphasis: "No AI route is available..." instead of a fake fallback.
- Export (guest): "Create a free account to export" with "Sign in to your
  account" / "Keep editing" — no dead end.
- /start with no session: login-first flow (by design); "Opening your studio…"
  while the project is created.

## Friction found (observations, not bugs)
- **Upload waits silently for a language**: with mode=captions and no saved
  language, picking a video only PENDS it — nothing happens until a language is
  picked (or the Normal Editor door is chosen). No "pick a language to continue"
  hint shows on the pending state. A first-time user may think the upload broke.
- **Tutorial re-appears** across sessions in the test profile (see above).
- **Look previews are static posters** (BUG-009) — the Templates panel feels dead
  compared with the Motion panel beside it, whose thumbnails render live.
- **"95% Hinglish" count-up** read "85%" at probe time in headless — likely
  rAF throttling in headless Chromium, not a product issue; the owner should
  confirm the 0→95 animation on a real browser.

## Copy (owner's short-sentence rule)
- All messages touched by fixes are one short sentence. The new BUG-008 message:
  "Couldn't download the transcription model. Check your connection and try again."
- Known open copy item (owner's call, D7/D8): /settings/billing says "uploads to
  52 MB" while /pricing says "Uploads up to 50 MB".
