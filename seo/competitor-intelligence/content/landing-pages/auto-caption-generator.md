# Content Brief — /auto-caption-generator (BUILT)

- **Status:** BUILT in this branch, 2026-11-13. Files:
  `apps/frontend/src/app/auto-caption-generator/{page,layout,faqs}.tsx`.
- **Primary keyword:** automatic video caption generator (global + India).
  Secondary: auto captions for videos, automatic captions, free caption
  generator (video-qualified only).
- **Intent:** transactional (searcher wants a working tool now).
- **Parent:** `/`. Children (Phase 2): `/animated-captions`,
  `/subtitle-generator`, `/hinglish-captions`, `/add-captions-to-video`.
- **Structure (as built):** one H1 ("Automatic video caption generator");
  intro + Start free / See pricing CTAs; How it works (5 steps, each an
  H3); What you get; Captions in your language; Export formats; What it
  cannot do; Free-with-paid-passes note; FAQ (6, from `faqs.ts`, mirrored
  in FAQPage schema); closing CTA.
- **Product facts used (all verified in
  `audit/captionit-baseline.md`):** 150 looks; 14 languages incl. Hindi
  and Hinglish (Roman script; Devanagari separate); Whisper in-browser
  (Hinglish model is Oriserve Whisper-Hindi2Hinglish-Swift, fine-tuned);
  MP4/MOV/WebM/MKV input; MP4 + transparent MOV/WebM overlays (Companion
  app) + SRT/VTT/ASS/TXT/JSON export; free up to 5 minutes; paid up to
  3 hours; 30-day passes, no auto-renew; no watermark.
- **Honesty rules applied:** limits stated on the page ("What it cannot
  do"); no invented stats, ratings, testimonials or user counts; "largest
  style count" qualified as "we verified among rival tools in this
  research" (one rival claims 1,000+ styles unverified).
- **Structured data:** SoftwareApplication + FAQPage (FAQ built from the
  same array as the visible FAQ section).
- **Internal links:** up to `/`, across to `/transcribe` and `/motion`
  (user-navigation links to live tools, not SEO links to landing pages),
  to `/pricing` and `/start` as conversion exits; linked from the homepage
  tool-doors list and the footer Product column.
- **Known gap on this page:** no image. The site's only share image still
  carries the old "CaptionsEasy" name and "20+ looks", so reusing it would
  show the wrong brand and the wrong count. Replacing that asset is a
  separate fix, not part of this branch.
