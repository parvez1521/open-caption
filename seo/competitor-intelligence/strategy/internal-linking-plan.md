# Captionit Internal Linking Plan

Date: 2026-11-13. Branch: `feature/seo-competitor-intelligence-2026-11-13`.
Rule for every link below: contextual links only, in body copy where the
reader would actually want them. No link lists for their own sake, no
footer-stuffing beyond the existing Product column, no keyword-stuffed
anchor text. Anchor text is the plain name of the destination.

## Pages live in this branch

### `/` (homepage)

- Primary keyword: word-timed captions for Reels, Shorts and TikTok.
- Intent: commercial / brand.
- Parent: none (root). Supporting pages: every tool page below.
- Link opportunities (built in this branch): tool-doors list gains an
  "Auto caption generator" row linking to `/auto-caption-generator`; the
  footer Product column gains the same link (sitewide, so every page links
  to the new tool page once).
- CTA destination: `/start` (existing "Start free" buttons, unchanged).

### `/auto-caption-generator` (NEW in this branch)

- Primary keyword: automatic video caption generator.
- Secondary keywords: auto captions for videos; free caption generator for
  video; automatic captions for Reels and Shorts.
- Intent: transactional (searcher wants a working tool now).
- Parent: `/`. Supporting pages (future): `/animated-captions`,
  `/subtitle-generator`, `/add-captions-to-video`, `/hinglish-captions`.
- Links on the page (all built):
  - `/start` — CTA, hero and closing ("Start free", "Caption a video free").
  - `/transcribe` — in "How it works" and in the formats section
    (transcript-first workflow; the transcribe tool is the same Whisper
    engine, standalone).
  - `/motion` — in the styles section (46 motion templates that sit on top
    of captions; Motion Studio).
  - `/pricing` — in the pricing note (paid 30-day passes; no prices quoted
    on this page, so the geo currency rule cannot be broken here).
  - `/about` — in the closing section (who makes Captionit).
  - `/` — logo/nav and a closing link back to the homepage.
  - Future (not linked yet — targets do not exist): `/animated-captions`
    (styles gallery), `/subtitle-generator` (SRT/VTT), `/hinglish-captions`.
    Add these links when those pages land; do not link to 404s.
- CTA destination: `/start`.

## Pages approved for Phase 2 (link targets to wire when built)

### `/animated-captions`

- Primary: animated captions generator. Secondary: animated captions for
  Reels; word-by-word captions.
- Intent: transactional / commercial investigation.
- Parent: `/auto-caption-generator`. Supporting: 150-look styles gallery
  (child), `/motion`.
- Links: up to `/auto-caption-generator`; across to `/subtitle-generator`;
  down to the gallery; `/pricing`; CTA `/start`.

### `/subtitle-generator`

- Primary: video subtitle generator. Secondary: AI subtitle generator;
  free SRT generator.
- Intent: transactional (searcher wants a subtitle file).
- Parent: `/auto-caption-generator`. Supporting: `/hindi-subtitles`
  (child), `/transcribe`.
- Links: up to `/auto-caption-generator`; across to `/animated-captions`;
  down to `/hindi-subtitles`; `/transcribe`; `/pricing`; CTA `/start`.

### `/add-captions-to-video`

- Primary: add captions to video. Secondary: how to add captions to a
  video free.
- Intent: informational how-to.
- Parent: `/auto-caption-generator`. Supporting: "How to add Hindi
  captions" guide (child).
- Links: tool parent in the first section and at the close
  (`/auto-caption-generator`); one sibling guide at most; `/transcribe`;
  CTA `/start`.

### `/hinglish-captions`

- Primary: Hinglish caption generator. Secondary: Hinglish captions for
  Reels; Hindi Hinglish auto captions.
- Intent: transactional, language-qualified.
- Parent: `/auto-caption-generator`. Supporting: `/hindi-subtitles`
  (sibling, Devanagari counterpart).
- Links: up to `/auto-caption-generator`; across to `/hindi-subtitles`;
  `/pricing` (₹ plans are a ranking-page feature in India SERPs);
  CTA `/start`.

### `/hindi-subtitles`

- Primary: Hindi subtitle generator. Secondary: Hindi captions for Reels;
  Devanagari SRT.
- Intent: transactional, language-qualified.
- Parent: `/subtitle-generator`.
- Links: up to `/subtitle-generator`; across to `/hinglish-captions`;
  `/transcribe`; CTA `/start`.

## Pages deliberately not linked as SEO targets

- `/transcribe`, `/motion`, `/ai-clipper`, `/clipper`, `/dashboard`,
  `/editor`, `/settings`, `/growth`, `/planner`, `/analytics`, `/library`,
  `/analyzer`, `/prompter`, `/exports`, `/brand`, `/create`: noindex app
  routes. They may receive user-navigation links from tool pages (the new
  page links to `/transcribe` and `/motion` because a reader using the tool
  needs them), but they are never linked as if they were landing pages, and
  they are never in the sitemap while noindex.
- `/login`: in the sitemap today, linked from the nav as "Sign in". No
  editorial links point at it.
- Legal pages (`/terms`, `/privacy`, `/cookies`, etc.): footer only, no
  editorial links.

## Anchor-text rules

- Use the destination's plain name: "Transcribe", "Motion Studio",
  "Pricing", "About", "automatic video caption generator" only where it is
  the sentence's natural subject.
- Never repeat the same anchor text twice on one page for two different
  destinations.
- The CTA anchor is always an action ("Start free", "Caption a video free"),
  never a keyword.
